<?php
/**
 * POS Core API Middleware & Helper Library
 * Provides Authentication, RBAC, Database Handling, and Audit Logging for Hostinger PHP Backend
 */

require_once __DIR__ . '/../config/database.php';

// Set global JSON header and CORS headers
function initApiHeaders(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('X-XSS-Protection: 1; mode=block');

    // Strict CORS: NEVER reflect an arbitrary Origin (the old code echoed
    // $_SERVER['HTTP_ORIGIN'] straight into Access-Control-Allow-Origin while
    // also sending Access-Control-Allow-Credentials, which lets any website
    // make credentialed cross-origin requests). Only origins explicitly
    // listed in CORS_ORIGINS (comma-separated) are allowed. With no allowlist
    // configured the API is same-origin only, which is the safe default.
    $allowlist = array_values(array_filter(array_map('trim', explode(',', (string)getenv('CORS_ORIGINS')))));
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && in_array($origin, $allowlist, true)) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

initApiHeaders();

/**
 * Send JSON response and terminate script
 */
function sendJson($data, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Send standard error JSON response and terminate script
 */
function sendError(string $message, int $statusCode = 400): void {
    http_response_code($statusCode);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Parse JSON input from request body
 */
function getJsonInput(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) {
        return $_POST;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Extract Bearer token from Authorization header or Cookie
 */
function getBearerToken(): ?string {
    $headers = null;
    if (isset($_SERVER['Authorization'])) {
        $headers = trim($_SERVER['Authorization']);
    } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $headers = trim($_SERVER['HTTP_AUTHORIZATION']);
    } elseif (function_exists('apache_request_headers')) {
        $requestHeaders = apache_request_headers();
        $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
        if (isset($requestHeaders['Authorization'])) {
            $headers = trim($requestHeaders['Authorization']);
        }
    }

    if (!empty($headers) && preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
        return $matches[1];
    }

    if (!empty($_COOKIE['pos_auth_token'])) {
        return $_COOKIE['pos_auth_token'];
    }

    return null;
}

/**
 * Authenticate current user from session token
 */
function requireAuth(): array {
    $token = getBearerToken();
    if (!$token) {
        sendError('Unauthorized. Please login to access this POS feature.', 401);
    }

    $pdo = Database::getConnection();

    // Query active session
    $stmt = $pdo->prepare("
        SELECT s.token, s.expires_at, u.id, u.name, u.username, u.email, u.role, u.is_active, u.pin
        FROM user_sessions s
        INNER JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > NOW()
        LIMIT 1
    ");
    $stmt->execute([$token]);
    $session = $stmt->fetch();

    if (!$session) {
        sendError('Session expired or invalid. Please login again.', 401);
    }

    if (!(bool)$session['is_active']) {
        // Destroy session if user was disabled
        $delStmt = $pdo->prepare("DELETE FROM user_sessions WHERE token = ?");
        $delStmt->execute([$token]);
        sendError('Your account has been deactivated. Please contact the administrator.', 403);
    }

    return [
        'id'        => $session['id'],
        'name'      => $session['name'],
        'username'  => $session['username'],
        'email'     => $session['email'],
        'role'      => $session['role'],
        'isActive'  => (bool)$session['is_active'],
        'pin'       => $session['pin'],
        'token'     => $session['token']
    ];
}

/**
 * Enforce Super Admin permissions (403 if Cashier)
 */
function requireSuperAdmin(): array {
    $user = requireAuth();
    if ($user['role'] !== 'super_admin') {
        sendError('Access Denied: Super Admin permissions required.', 403);
    }
    return $user;
}

/**
 * Brute-force protection for login (file-backed, no DB schema required).
 *
 * The legacy login endpoint had NO throttling, so the documented default
 * password and the 4-digit cashier PINs could be guessed at unlimited speed.
 * This records failed attempts per (IP + identifier) in a JSON file under a
 * runtime directory (configurable via POS_RUNTIME_DIR, default: system temp)
 * and locks an identifier for 60 seconds after 5 consecutive failures.
 */
function loginAttemptsFile(): string {
    $dir = getenv('POS_RUNTIME_DIR') ?: sys_get_temp_dir();
    return rtrim($dir, '/\\') . '/royal_pos_login_attempts.json';
}

function loginAttemptsLoad(string $file): array {
    if (!is_file($file)) {
        return [];
    }
    $raw = @file_get_contents($file);
    if ($raw === false) {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function loginAttemptsSave(string $file, array $data): void {
    $tmp = $file . '.tmp.' . getmypid();
    @file_put_contents($tmp, json_encode($data), LOCK_EX);
    @rename($tmp, $file);
}

function loginAttemptKey(string $ip, string $identifier): string {
    return hash('sha256', $ip . '|' . strtolower(trim($identifier)));
}

/** Returns remaining lockout seconds when throttled, otherwise null. */
function checkLoginThrottle(string $ip, string $identifier): ?int {
    $file = loginAttemptsFile();
    $data = loginAttemptsLoad($file);
    $key = loginAttemptKey($ip, $identifier);
    $rec = $data[$key] ?? null;
    if (is_array($rec) && isset($rec['lockedUntil']) && $rec['lockedUntil'] > time()) {
        return (int)($rec['lockedUntil'] - time());
    }
    return null;
}

/** Records a failed login and locks the identifier after 5 consecutive failures. */
function recordLoginFailure(string $ip, string $identifier): void {
    $file = loginAttemptsFile();
    $data = loginAttemptsLoad($file);
    $key = loginAttemptKey($ip, $identifier);
    $now = time();

    $rec = $data[$key] ?? ['count' => 0, 'lockedUntil' => 0, 'lastAttempt' => 0];
    if (!is_array($rec)) {
        $rec = ['count' => 0, 'lockedUntil' => 0, 'lastAttempt' => 0];
    }

    // Expire stale records so a lock from long ago never persists forever.
    if ($rec['lockedUntil'] > 0 && $rec['lockedUntil'] < $now - 3600) {
        $rec = ['count' => 0, 'lockedUntil' => 0, 'lastAttempt' => 0];
    }
    if (isset($rec['lastAttempt']) && $now - (int)$rec['lastAttempt'] > 900) {
        $rec['count'] = 0;
    }

    $rec['count'] = ((int)($rec['count'] ?? 0)) + 1;
    $rec['lastAttempt'] = $now;
    if ($rec['count'] >= 5) {
        $rec['lockedUntil'] = $now + 60;
        $rec['count'] = 0; // reset so the next lockout window starts fresh
    }
    $data[$key] = $rec;

    // Bound the file to the most recent 1000 entries.
    if (count($data) > 1000) {
        $data = array_slice($data, -1000, null, true);
    }
    loginAttemptsSave($file, $data);
}

/** Clears failed attempts after a successful login. */
function clearLoginFailures(string $ip, string $identifier): void {
    $file = loginAttemptsFile();
    $data = loginAttemptsLoad($file);
    $key = loginAttemptKey($ip, $identifier);
    if (array_key_exists($key, $data)) {
        unset($data[$key]);
        loginAttemptsSave($file, $data);
    }
}

/**
 * Write to system audit logs table
 */
function logAudit(string $userId, string $userName, string $userRole, string $action, string $entity, ?string $entityId, ?string $details): void {
    try {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity, entity_id, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ");
        $id = 'audit-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 4);
        $stmt->execute([$id, $userId, $userName, $userRole, $action, $entity, $entityId, $details]);
    } catch (Exception $e) {
        error_log('[AuditLog Error] ' . $e->getMessage());
    }
}

/**
 * Atomically record stock movement in database
 */
function recordStockMovement(
    PDO $pdo,
    string $productId,
    string $productName,
    string $variantId,
    string $variantSize,
    int $quantityChange,
    int $quantityBefore,
    int $quantityAfter,
    string $movementType,
    string $userId,
    string $userName,
    ?string $reason = null,
    ?string $referenceId = null
): void {
    $id = 'mov-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(4)), 0, 4);
    $stmt = $pdo->prepare("
        INSERT INTO stock_movements (
            id, product_id, product_name, variant_id, variant_size,
            quantity_change, quantity_before, quantity_after,
            movement_type, user_id, user_name, reason, reference_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ");
    $stmt->execute([
        $id, $productId, $productName, $variantId, $variantSize,
        $quantityChange, $quantityBefore, $quantityAfter,
        $movementType, $userId, $userName, $reason, $referenceId
    ]);
}

/**
 * Retrieve system settings from database
 */
function getSystemSettings(): array {
    $pdo = Database::getConnection();
    $stmt = $pdo->query("SELECT * FROM system_settings WHERE id = 1 LIMIT 1");
    $row = $stmt->fetch();

    if (!$row) {
        return [
            'businessName' => 'Royal Green Garden Bar & Restaurant',
            'businessTagline' => 'Fine Liquor, Cuisine & Hospitality',
            'address' => 'No. 42 Beach Road, Puttalam, Sri Lanka',
            'phone' => '+94 32 226 5500 / +94 77 123 4567',
            'email' => 'royalgreengardenputtalam@gmail.com',
            'website' => 'www.royalgreengarden.lk',
            'currency' => 'LKR',
            'currencySymbol' => 'Rs.',
            'taxRate' => 0,
            'serviceChargeRate' => 10,
            'allowNegativeStock' => false,
            'enableDiscounts' => true,
            'maxDiscountPercentage' => 20,
            'invoicePrefix' => 'INV-',
            'billPrefix' => 'BILL-',
            'kotPrefix' => 'KOT-',
            'receiptHeader' => 'Welcome to Royal Green Garden',
            'receiptFooter' => 'Thank you for visiting Royal Green Garden! Please visit again.',
            'lowStockDefaultThreshold' => 5,
            'printerType' => 'thermal',
            'thermalWidth' => '80mm',
            'autoPrintAfterPayment' => false,
            'allowCashierToPrint' => true
        ];
    }

    return [
        'businessName' => $row['business_name'],
        'businessTagline' => $row['business_tagline'],
        'address' => $row['address'],
        'phone' => $row['phone'],
        'email' => $row['email'],
        'website' => $row['website'],
        'currency' => $row['currency'],
        'currencySymbol' => $row['currency_symbol'],
        'taxRate' => (float)$row['tax_rate'],
        'serviceChargeRate' => (float)$row['service_charge_rate'],
        'allowNegativeStock' => (bool)$row['allow_negative_stock'],
        'enableDiscounts' => (bool)$row['enable_discounts'],
        'maxDiscountPercentage' => (float)$row['max_discount_percentage'],
        'invoicePrefix' => $row['invoice_prefix'],
        'billPrefix' => $row['bill_prefix'],
        'kotPrefix' => $row['kot_prefix'],
        'receiptHeader' => $row['receipt_header'],
        'receiptFooter' => $row['receipt_footer'],
        'lowStockDefaultThreshold' => (int)$row['low_stock_default_threshold'],
        'printerType' => $row['printer_type'] ?: 'thermal',
        'thermalWidth' => $row['thermal_width'] ?: '80mm',
        'autoPrintAfterPayment' => (bool)$row['auto_print_after_payment'],
        'allowCashierToPrint' => (bool)$row['allow_cashier_to_print']
    ];
}

/**
 * Generate sequential numbers for Bills, Invoices, and KOTs
 */
function generateNextNumber(string $type): string {
    $pdo = Database::getConnection();
    $settings = getSystemSettings();

    if ($type === 'bill') {
        $prefix = $settings['billPrefix'] ?? 'BILL-';
        $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM bills");
        $count = (int)$stmt->fetch()['cnt'] + 1;
        return sprintf("%s%05d", $prefix, $count);
    } elseif ($type === 'invoice') {
        $prefix = $settings['invoicePrefix'] ?? 'INV-';
        $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM bills");
        $count = (int)$stmt->fetch()['cnt'] + 1;
        return sprintf("%s%05d", $prefix, $count);
    } elseif ($type === 'kot') {
        $prefix = $settings['kotPrefix'] ?? 'KOT-';
        $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM kots");
        $count = (int)$stmt->fetch()['cnt'] + 1;
        return sprintf("%s%04d", $prefix, $count);
    }

    return strtoupper($type) . '-' . time();
}
