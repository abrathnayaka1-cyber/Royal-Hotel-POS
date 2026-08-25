<?php
/**
 * User Change Password Endpoint
 */

require_once __DIR__ . '/../middleware.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$user = requireAuth();
$input = getJsonInput();

$currentPassword = $input['currentPassword'] ?? '';
$newPassword = trim($input['newPassword'] ?? '');

if (empty($newPassword) || strlen($newPassword) < 4) {
    sendError('New password must be at least 4 characters long.');
}

$pdo = Database::getConnection();

// The current password is ALWAYS required. Previously it was optional — an
// empty currentPassword silently skipped verification, so anyone holding a
// session token (or a stolen cookie) could change the password and take over
// the account without knowing it.
if (empty($currentPassword)) {
    sendError('Current password is required.', 400);
}

$stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
$stmt->execute([$user['id']]);
$row = $stmt->fetch();
if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
    sendError('Current password is incorrect.', 400);
}

$newHash = password_hash($newPassword, PASSWORD_BCRYPT);
$upStmt = $pdo->prepare("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?");
$upStmt->execute([$newHash, $user['id']]);

logAudit($user['id'], $user['name'], $user['role'], 'PASSWORD_CHANGE', 'USER', $user['id'], 'User changed password.');

sendJson(['message' => 'Password updated successfully.']);
