<?php
/**
 * User Logout Endpoint
 * Revokes active session token
 */

require_once __DIR__ . '/../middleware.php';

$user = requireAuth();
$token = getBearerToken();

if ($token) {
    $pdo = Database::getConnection();
    $stmt = $pdo->prepare("DELETE FROM user_sessions WHERE token = ?");
    $stmt->execute([$token]);
}

// Clear cookie
setcookie('pos_auth_token', '', [
    'expires'  => time() - 3600,
    'path'     => '/',
    'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
    'httponly' => false,
    'samesite' => 'Lax'
]);

logAudit($user['id'], $user['name'], $user['role'], 'USER_LOGOUT', 'AUTH', $user['id'], 'User logged out.');

sendJson(['message' => 'Logged out successfully.']);
