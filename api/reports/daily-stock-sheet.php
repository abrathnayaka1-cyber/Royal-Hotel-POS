<?php
/**
 * Daily Stock Sheet & Bar Reconciliation API
 * Hostinger Web Hosting Compatible
 * Target: /api/reports/daily-stock-sheet.php
 *
 * GET  - build the daily register (In-Hand, Received, Stock, Balance, Sold, Value)
 * POST - apply a physical-count reconciliation (Super Admin only)
 */

// middleware.php already loads config/database.php and exposes Database::getConnection(),
// requireAuth()/requireSuperAdmin(), sendJson()/sendError() and logAudit().
require_once __DIR__ . '/../middleware.php';

$user = requireAuth();

$pdo = Database::getConnection();

$method = $_SERVER['REQUEST_METHOD'];

// Allow shared hosts that cannot send PUT/PATCH/DELETE through to .php endpoints.
if ($method === 'POST' && !empty($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
}

// --------------------------------------------------------------------------
// GET - Daily stock sheet report
// --------------------------------------------------------------------------
if ($method === 'GET') {
    $targetDate = isset($_GET['date']) && $_GET['date'] !== '' ? trim((string)$_GET['date']) : date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $targetDate)) {
        sendError('Invalid date. Expected format: YYYY-MM-DD.', 400);
    }

    $categoryFilter = isset($_GET['categoryId']) ? trim((string)$_GET['categoryId']) : 'all';
    $search = isset($_GET['search']) ? strtolower(trim((string)$_GET['search'])) : '';
    $typeFilter = isset($_GET['type']) ? trim((string)$_GET['type']) : 'all';

    $formattedDate = str_replace('-', '.', $targetDate);

    // 1. Units sold on this date (paid bills only)
    $soldQuery = "
        SELECT bi.variant_id, SUM(bi.quantity) as total_sold
        FROM bill_items bi
        INNER JOIN bills b ON bi.bill_id = b.id
        WHERE b.status = 'paid' AND DATE(COALESCE(b.paid_at, b.created_at)) = :targetDate
        GROUP BY bi.variant_id
    ";
    $soldStmt = $pdo->prepare($soldQuery);
    $soldStmt->execute([':targetDate' => $targetDate]);
    $soldMap = [];
    while ($row = $soldStmt->fetch()) {
        $soldMap[$row['variant_id']] = (int)$row['total_sold'];
    }

    // 2. Received units + adjustments recorded on this date.
    //    Matches the Node/Express implementation: stock_in / purchase and positive
    //    adjustments count as "received", negative adjustments are subtracted from the
    //    opening (in-hand) figure.
    $movQuery = "
        SELECT variant_id, movement_type, quantity_change
        FROM stock_movements
        WHERE DATE(created_at) = :targetDate
    ";
    $movStmt = $pdo->prepare($movQuery);
    $movStmt->execute([':targetDate' => $targetDate]);
    $receivedMap = [];
    $adjustmentMap = [];
    while ($row = $movStmt->fetch()) {
        $variantId = $row['variant_id'];
        $change = (int)$row['quantity_change'];
        if (in_array($row['movement_type'], ['stock_in', 'purchase'], true)) {
            $receivedMap[$variantId] = ($receivedMap[$variantId] ?? 0) + $change;
        } elseif ($row['movement_type'] === 'adjustment') {
            if ($change > 0) {
                $receivedMap[$variantId] = ($receivedMap[$variantId] ?? 0) + $change;
            } else {
                $adjustmentMap[$variantId] = ($adjustmentMap[$variantId] ?? 0) + $change;
            }
        }
    }

    // 3. Fetch all active products and variants
    $prodQuery = "
        SELECT 
            p.id as product_id, p.name as product_name, p.category_id, p.is_kitchen_item,
            c.name as category_name, c.type as category_type,
            co.name as company_name,
            v.id as variant_id, v.size, v.sku, v.cost_price, v.selling_price, v.stock
        FROM products p
        INNER JOIN categories c ON p.category_id = c.id
        LEFT JOIN companies co ON p.company_id = co.id
        INNER JOIN product_variants v ON p.id = v.product_id
        WHERE p.is_active = 1 AND p.is_archived = 0 AND v.is_active = 1
        ORDER BY c.display_order ASC, p.name ASC, v.selling_price DESC
    ";
    $prodStmt = $pdo->query($prodQuery);
    $rows = $prodStmt->fetchAll();

    $items = [];
    $rowNo = 1;
    $totalInHand = 0;
    $totalReceived = 0;
    $totalStock = 0;
    $totalBalance = 0;
    $totalSold = 0;
    $totalValue = 0;

    foreach ($rows as $row) {
        if ($categoryFilter !== 'all' && $row['category_id'] !== $categoryFilter) continue;
        if ($typeFilter === 'bar' && ($row['is_kitchen_item'] || $row['category_type'] === 'restaurant')) continue;
        if ($typeFilter === 'restaurant' && (!$row['is_kitchen_item'] && $row['category_type'] !== 'restaurant')) continue;

        $cleanProdName = preg_replace('/(Arrack|Brandy|Whisky|Vodka|Beer|DCSL|DCSCL)/i', '', $row['product_name']);
        $cleanProdName = trim($cleanProdName);
        $cleanSize = preg_replace('/(Bottle|Flask|Quarter|Half|Large|Portion|Double|Single|Peg)/i', '', $row['size']);
        $cleanSize = trim($cleanSize);
        $displayName = trim(($cleanProdName ?: $row['product_name']) . ' ' . $cleanSize);

        if ($search) {
            $match = strpos(strtolower($row['product_name']), $search) !== false ||
                     strpos(strtolower($displayName), $search) !== false ||
                     strpos(strtolower($row['sku']), $search) !== false;
            if (!$match) continue;
        }

        $varId = $row['variant_id'];
        $sold = isset($soldMap[$varId]) ? $soldMap[$varId] : 0;
        $received = isset($receivedMap[$varId]) ? $receivedMap[$varId] : 0;
        $adjustments = isset($adjustmentMap[$varId]) ? $adjustmentMap[$varId] : 0;
        $balance = (int)$row['stock'];
        $inHand = max(0, $balance + $sold - $received - $adjustments);
        $stock = $inHand + $received;
        $price = (float)$row['selling_price'];
        $value = $sold * $price;

        $totalInHand += $inHand;
        $totalReceived += $received;
        $totalStock += $stock;
        $totalBalance += $balance;
        $totalSold += $sold;
        $totalValue += $value;

        $items[] = [
            'no' => $rowNo++,
            'productId' => $row['product_id'],
            'variantId' => $varId,
            'productName' => $row['product_name'],
            'companyName' => $row['company_name'] ?: 'In-House / Other',
            'categoryName' => $row['category_name'],
            'size' => $row['size'],
            'displayName' => $displayName ?: ($row['product_name'] . ' ' . $row['size']),
            'inHand' => $inHand,
            'received' => $received,
            'stock' => $stock,
            'balance' => $balance,
            'sold' => $sold,
            'price' => $price,
            'value' => $value,
            'costPrice' => (float)$row['cost_price'],
            'isKitchenItem' => (bool)$row['is_kitchen_item']
        ];
    }

    sendJson([
        'date' => $targetDate,
        'formattedDate' => $formattedDate,
        'totalInHand' => $totalInHand,
        'totalReceived' => $totalReceived,
        'totalStock' => $totalStock,
        'totalBalance' => $totalBalance,
        'totalSold' => $totalSold,
        'totalValue' => $totalValue,
        'items' => $items
    ]);
}

// --------------------------------------------------------------------------
// POST - Physical audit reconciliation (Super Admin only)
// --------------------------------------------------------------------------
if ($method === 'POST') {
    if ($user['role'] !== 'super_admin') {
        sendError('Super Admin permission required', 403);
    }

    $input = getJsonInput();
    $adjustments = isset($input['adjustments']) ? $input['adjustments'] : [];
    $reason = isset($input['reason']) && is_string($input['reason']) && trim($input['reason']) !== ''
        ? substr(trim($input['reason']), 0, 500)
        : 'Daily Stock Sheet Physical Audit Reconciliation';

    if (!is_array($adjustments) || empty($adjustments)) {
        sendError('No adjustments provided', 400);
    }

    $updatedCount = 0;
    $pdo->beginTransaction();

    try {
        $updateStmt = $pdo->prepare("UPDATE product_variants SET stock = :newStock WHERE id = :variantId");
        $getStmt = $pdo->prepare("SELECT v.stock, v.size, p.id as product_id, p.name as product_name FROM product_variants v INNER JOIN products p ON v.product_id = p.id WHERE v.id = :variantId");
        $movStmt = $pdo->prepare("
            INSERT INTO stock_movements (id, product_id, product_name, variant_id, variant_size, quantity_change, quantity_before, quantity_after, movement_type, reason, user_id, user_name, created_at)
            VALUES (:id, :productId, :productName, :variantId, :variantSize, :quantityChange, :quantityBefore, :quantityAfter, 'adjustment', :reason, :userId, :userName, NOW())
        ");

        foreach ($adjustments as $adj) {
            if (!is_array($adj) || empty($adj['variantId'])) continue;

            $variantId = (string)$adj['variantId'];
            $newBalance = isset($adj['newBalance']) && is_numeric($adj['newBalance']) ? (int)$adj['newBalance'] : -1;
            if ($newBalance < 0 || $newBalance > 1000000) continue;

            $getStmt->execute([':variantId' => $variantId]);
            $current = $getStmt->fetch();
            if ($current) {
                $qtyBefore = (int)$current['stock'];
                $diff = $newBalance - $qtyBefore;
                if ($diff !== 0) {
                    $updateStmt->execute([':newStock' => $newBalance, ':variantId' => $variantId]);
                    $movStmt->execute([
                        ':id' => 'mov-audit-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(3)), 0, 6),
                        ':productId' => $current['product_id'],
                        ':productName' => $current['product_name'],
                        ':variantId' => $variantId,
                        ':variantSize' => $current['size'],
                        ':quantityChange' => $diff,
                        ':quantityBefore' => $qtyBefore,
                        ':quantityAfter' => $newBalance,
                        ':reason' => $reason,
                        ':userId' => $user['id'],
                        ':userName' => $user['name']
                    ]);
                    $updatedCount++;
                }
            }
        }

        $pdo->commit();

        logAudit(
            $user['id'],
            $user['name'],
            $user['role'],
            'DAILY_SHEET_RECONCILE',
            'INVENTORY',
            null,
            "Reconciled {$updatedCount} items via Daily Stock Sheet audit"
        );

        sendJson([
            'success' => true,
            'updatedCount' => $updatedCount,
            'message' => "Successfully updated {$updatedCount} stock item(s) from physical sheet."
        ]);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[DailyStockSheet Error] ' . $e->getMessage());
        sendError('Database error while saving the stock sheet reconciliation.', 500);
    }
}

sendError('Method not allowed', 405);
