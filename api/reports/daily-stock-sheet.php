<?php
/**
 * Daily Stock Sheet & Bar Reconciliation API
 * Hostinger Web Hosting Compatible
 * Target: /api/reports/daily-stock-sheet.php
 */

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware.php';

header('Content-Type: application/json; charset=utf-8');

// Authenticate user
$user = authenticate();
if (!$user) {
    http_response_type(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$pdo = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $targetDate = isset($_GET['date']) ? trim($_GET['date']) : date('Y-m-d');
    $categoryFilter = isset($_GET['categoryId']) ? trim($_GET['categoryId']) : 'all';
    $search = isset($_GET['search']) ? strtolower(trim($_GET['search'])) : '';
    $typeFilter = isset($_GET['type']) ? trim($_GET['type']) : 'all';

    $formattedDate = str_replace('-', '.', $targetDate);

    // 1. Get units sold on this date
    $soldQuery = "
        SELECT bi.variant_id, SUM(bi.quantity) as total_sold
        FROM bill_items bi
        INNER JOIN bills b ON bi.bill_id = b.id
        WHERE b.status = 'paid' AND DATE(b.created_at) = :targetDate
        GROUP BY bi.variant_id
    ";
    $soldStmt = $pdo->prepare($soldQuery);
    $soldStmt->execute([':targetDate' => $targetDate]);
    $soldMap = [];
    while ($row = $soldStmt->fetch()) {
        $soldMap[$row['variant_id']] = (int)$row['total_sold'];
    }

    // 2. Get received movements on this date
    $recQuery = "
        SELECT variant_id, SUM(quantity_change) as total_received
        FROM stock_movements
        WHERE movement_type IN ('stock_in', 'purchase') AND DATE(created_at) = :targetDate
        GROUP BY variant_id
    ";
    $recStmt = $pdo->prepare($recQuery);
    $recStmt->execute([':targetDate' => $targetDate]);
    $receivedMap = [];
    while ($row = $recStmt->fetch()) {
        $receivedMap[$row['variant_id']] = (int)$row['total_received'];
    }

    // 3. Fetch all active products and variants
    $prodQuery = "
        SELECT 
            p.id as product_id, p.name as product_name, p.category_id, p.is_kitchen_item,
            c.name as category_name, c.type as category_type,
            v.id as variant_id, v.size, v.sku, v.cost_price, v.selling_price, v.stock
        FROM products p
        INNER JOIN categories c ON p.category_id = c.id
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
        $balance = (int)$row['stock'];
        $inHand = max(0, $balance + $sold - $received);
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

    echo json_encode([
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
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($user['role'] !== 'super_admin') {
        http_response_type(403);
        echo json_encode(['error' => 'Super Admin permission required']);
        exit;
    }

    $data = json_decode(file_get_contents('php://input'), true);
    $adjustments = isset($data['adjustments']) ? $data['adjustments'] : [];
    $reason = isset($data['reason']) ? trim($data['reason']) : 'Daily Stock Sheet Physical Audit Reconciliation';

    if (!is_array($adjustments) || empty($adjustments)) {
        http_response_type(400);
        echo json_encode(['error' => 'No adjustments provided']);
        exit;
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
            $variantId = $adj['variantId'];
            $newBalance = (int)$adj['newBalance'];
            if ($newBalance < 0) continue;

            $getStmt->execute([':variantId' => $variantId]);
            $current = $getStmt->fetch();
            if ($current) {
                $qtyBefore = (int)$current['stock'];
                $diff = $newBalance - $qtyBefore;
                if ($diff !== 0) {
                    $updateStmt->execute([':newStock' => $newBalance, ':variantId' => $variantId]);
                    $movStmt->execute([
                        ':id' => 'mov-' . uniqid(),
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
        echo json_encode([
            'success' => true,
            'updatedCount' => $updatedCount,
            'message' => "Successfully updated {$updatedCount} stock item(s) from physical sheet."
        ]);
    } catch (Exception $e) {
        $pdo->rollBack();
        http_response_type(500);
        echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}
