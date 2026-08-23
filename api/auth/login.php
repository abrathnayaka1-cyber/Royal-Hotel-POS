<?php
/**
 * User Login Endpoint
 * Verifies credentials, generates secure session token, logs audit event
 */

require_once __DIR__ . '/../middleware.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$input = getJsonInput();
$username = trim($input['username'] ?? '');
$password = trim($input['password'] ?? '');
$pin = trim($input['pin'] ?? '');

if (empty($username) && empty($pin)) {
    sendError('Username and password (or PIN) are required.');
}

$pdo = Database::getConnection();

// Look up user
if (!empty($username)) {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
    $stmt->execute([$username]);
} else {
    $stmt = $pdo->prepare("SELECT * FROM users WHERE pin = ? LIMIT 1");
    $stmt->execute([$pin]);
}

$user = $stmt->fetch();

if (!$user) {
    sendError('Invalid username or password.', 401);
}

if (!(bool)$user['is_active']) {
    sendError('This account has been disabled. Please contact the Super Admin.', 403);
}

// Verify password or PIN
$authenticated = false;
if (!empty($password) && password_verify($password, $user['password_hash'])) {
    $authenticated = true;
} elseif (!empty($pin) && !empty($user['pin']) && $pin === $user['pin']) {
    $authenticated = true;
}

if (!$authenticated) {
    sendError('Invalid username or password.', 401);
}

// Generate secure session token (24-hour validity)
$token = 'pos_tok_' . round(microtime(true) * 1000) . '_' . bin2hex(random_bytes(16));
$expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));
$ip = $_SERVER['REMOTE_ADDR'] ?? 'client';
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';

$sessStmt = $pdo->prepare("
    INSERT INTO user_sessions (token, user_id, ip_address, user_agent, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
");
$sessStmt->execute([$token, $user['id'], $ip, $ua, $expiresAt]);

// Set cookie for browser sessions
setcookie('pos_auth_token', $token, [
    'expires'  => time() + 86400,
    'path'     => '/',
    'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
    'httponly' => false,
    'samesite' => 'Lax'
]);

logAudit($user['id'], $user['name'], $user['role'], 'USER_LOGIN', 'AUTH', $user['id'], "Logged in from {$ip}");

sendJson([
    'token' => $token,
    'user' => [
        'id'        => $user['id'],
        'name'      => $user['name'],
        'username'  => $user['username'],
        'email'     => $user['email'],
        'role'      => $user['role'],
        'isActive'  => (bool)$user['is_active'],
        'pin'       => $user['pin'],
        'createdAt' => $user['created_at']
    ]
]);
