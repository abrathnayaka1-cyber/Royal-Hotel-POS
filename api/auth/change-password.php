<?php
/**
 * User Change Password Endpoint
 *
 * The current password is ALWAYS required: without it anyone holding a live
 * session token (or the browser cookie) could silently take over the account.
 */

require_once __DIR__ . '/../middleware.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

$user = requireAuth();
$input = getJsonInput();

$currentPassword = is_string($input['currentPassword'] ?? null) ? $input['currentPassword'] : '';
$newPassword = is_string($input['newPassword'] ?? null) ? trim($input['newPassword']) : '';

if (strlen($newPassword) < 4 || strlen($newPassword) > 128) {
    sendError('New password must be between 4 and 128 characters long.');
}

// Current password is mandatory (mirrors POST /api/auth/change-password in server.ts)
if ($currentPassword === '') {
    sendError('Current password is required.', 400);
}

if ($currentPassword === $newPassword) {
    sendError('New password must be different from the current password.', 400);
}

$pdo = Database::getConnection();

$stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
$stmt->execute([$user['id']]);
$row = $stmt->fetch();

if (!$row || !password_verify($currentPassword, (string)$row['password_hash'])) {
    logAudit($user['id'], $user['name'], $user['role'], 'PASSWORD_CHANGE_FAILED', 'AUTH', $user['id'], 'Incorrect current password supplied.');
    sendError('Current password is incorrect.', 400);
}

$newHash = password_hash($newPassword, PASSWORD_BCRYPT);
$upStmt = $pdo->prepare("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?");
$upStmt->execute([$newHash, $user['id']]);

// Invalidate every other session so a stolen token cannot survive the password change.
// The session currently in use is kept alive so the user is not logged out mid-request.
$delStmt = $pdo->prepare("DELETE FROM user_sessions WHERE user_id = ? AND token <> ?");
$delStmt->execute([$user['id'], $user['token']]);

logAudit($user['id'], $user['name'], $user['role'], 'PASSWORD_CHANGE', 'USER', $user['id'], 'User changed password.');

sendJson(['message' => 'Password updated successfully.']);
