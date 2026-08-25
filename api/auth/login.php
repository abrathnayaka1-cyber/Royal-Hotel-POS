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

// Brute-force protection: throttle by client IP + identifier (username or PIN).
$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$identifier = !empty($username) ? $username : ('pin:' . $pin);
$lockRemaining = checkLoginThrottle($clientIp, $identifier);
if ($lockRemaining !== null) {
    sendError("Too many failed login attempts. Please wait {$lockRemaining} seconds and try again.", 429);
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
    recordLoginFailure($clientIp, $identifier);
    sendError('Invalid username or password.', 401);
}

if (!(bool)$user['is_active']) {
    sendError('This account has been disabled. Please contact the Super Admin.', 403);
}

// Verify password or PIN
$authenticated = false;
if (!empty($password) && !empty($user['password_hash']) && password_verify($password, $user['password_hash'])) {
    $authenticated = true;
} elseif (!empty($pin) && !empty($user['pin']) && hash_equals((string)$user['pin'], (string)$pin)) {
    $authenticated = true;
}

if (!$authenticated) {
    recordLoginFailure($clientIp, $identifier);
    sendError('Invalid username or password.', 401);
}

clearLoginFailures($clientIp, $identifier);

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

// Set cookie for browser sessions. HttpOnly so client-side JavaScript cannot
// read the token (an XSS would otherwise be able to exfiltrate it). The
// frontend authenticates with the Authorization header, which is unaffected.
setcookie('pos_auth_token', $token, [
    'expires'  => time() + 86400,
    'path'     => '/',
    'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
    'httponly' => true,
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
