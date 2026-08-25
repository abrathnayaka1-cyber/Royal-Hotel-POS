<?php
/**
 * Safe Idempotent Super Admin Initializer (secret-gated).
 *
 * SECURITY (fixed): this endpoint previously ran with NO authentication and
 * created the Super Admin account with the publicly-known credentials
 * `Admin / Araliya2000` and PIN `9999`. If the PHP backend was deployed, an
 * attacker could simply hit /api/init-admin.php before the owner did and take
 * over the whole system.
 *
 * Now:
 *   - It refuses to run unless INIT_ADMIN_SECRET is set in the environment and
 *     the request presents it (X-Init-Secret header or ?secret= query param).
 *   - It generates a random one-time password (returned once in the response)
 *     instead of the hardcoded default. No default PIN is set.
 *   - It remains idempotent: it will NOT overwrite an existing Super Admin.
 *
 * Run it once from the server / over HTTPS with the secret, then log in with
 * the returned password and change it immediately.
 */

require_once __DIR__ . '/middleware.php';

$requiredSecret = getenv('INIT_ADMIN_SECRET');
if (!$requiredSecret || strlen($requiredSecret) < 16) {
    sendError('Admin initialization is disabled. Set INIT_ADMIN_SECRET (16+ characters) to enable it.', 403);
}

$providedSecret = $_SERVER['HTTP_X_INIT_SECRET'] ?? ($_GET['secret'] ?? '');
if (!hash_equals((string)$requiredSecret, (string)$providedSecret)) {
    sendError('Forbidden: invalid or missing initialization secret.', 403);
}

try {
    $pdo = Database::getConnection();

    // Check if a super admin user already exists
    $stmt = $pdo->prepare("SELECT id, username, name FROM users WHERE role = 'super_admin' LIMIT 1");
    $stmt->execute();
    $existingAdmin = $stmt->fetch();

    if ($existingAdmin) {
        sendJson([
            'message' => 'Super Administrator account is already initialized.',
            'username' => $existingAdmin['username'],
            'status' => 'ALREADY_INITIALIZED'
        ]);
    }

    // Create Initial Super Admin with a random one-time password
    $adminId = 'user-admin-' . round(microtime(true) * 1000);
    $username = 'Admin';
    $name = 'Super Administrator';
    $email = 'admin@royalgreengarden.lk';

    // Generate a strong random password (24 chars) instead of the hardcoded one.
    $generatedPassword = substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(24))), 0, 24);
    $passwordHash = password_hash($generatedPassword, PASSWORD_BCRYPT);

    // No default PIN: PIN login is intentionally not enabled for the admin,
    // so a known 4-digit PIN cannot be brute-forced.
    $pin = null;

    $insertStmt = $pdo->prepare("
        INSERT INTO users (id, name, username, email, role, password_hash, pin, is_active, created_at)
        VALUES (?, ?, ?, ?, 'super_admin', ?, ?, 1, NOW())
    ");
    $insertStmt->execute([$adminId, $name, $username, $email, $passwordHash, $pin]);

    logAudit($adminId, $name, 'super_admin', 'INITIALIZE_SYSTEM', 'SYSTEM', $adminId, 'Initialized Super Admin account.');

    sendJson([
        'message' => 'Super Administrator initialized successfully. Log in now and change this password immediately.',
        'username' => $username,
        'password' => $generatedPassword,
        'status' => 'INITIALIZED'
    ], 201);

} catch (Exception $e) {
    error_log('[Init Admin Error] ' . $e->getMessage());
    sendError('Failed to initialize administrator: ' . $e->getMessage(), 500);
}
