<?php
/**
 * Safe Idempotent Super Admin Initializer
 * Creates the initial Super Admin account (Admin / Araliya2000) if no Admin exists.
 * Does not overwrite if already initialized.
 */

require_once __DIR__ . '/middleware.php';

try {
    $pdo = Database::getConnection();

    // Check if super admin user already exists
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

    // Create Initial Super Admin
    $adminId = 'user-admin-' . round(microtime(true) * 1000);
    $username = 'Admin';
    $name = 'Super Administrator';
    $email = 'admin@royalgreengarden.lk';
    $passwordHash = password_hash('Araliya2000', PASSWORD_BCRYPT);
    $pin = '9999';

    $insertStmt = $pdo->prepare("
        INSERT INTO users (id, name, username, email, role, password_hash, pin, is_active, created_at)
        VALUES (?, ?, ?, ?, 'super_admin', ?, ?, 1, NOW())
    ");
    $insertStmt->execute([$adminId, $name, $username, $email, $passwordHash, $pin]);

    logAudit($adminId, $name, 'super_admin', 'INITIALIZE_SYSTEM', 'SYSTEM', $adminId, 'Initialized Super Admin account.');

    sendJson([
        'message' => 'Super Administrator initialized successfully.',
        'username' => $username,
        'status' => 'INITIALIZED'
    ], 201);

} catch (Exception $e) {
    error_log('[Init Admin Error] ' . $e->getMessage());
    sendError('Failed to initialize administrator: ' . $e->getMessage(), 500);
}
