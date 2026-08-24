<?php
/**
 * User & Cashier Management Endpoint (Super Admin Only)
 * Allows Super Admin to list users, create cashiers, update roles and passwords,
 * and toggle a user's active state.
 */

require_once __DIR__ . '/../middleware.php';

$admin = requireSuperAdmin();
$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Handle method spoofing for shared hosts that block PATCH/DELETE
if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
}

/**
 * Strip the password hash before sending a user record to the client.
 */
function sanitizeUser(array $u): array {
    return [
        'id'        => $u['id'],
        'name'      => $u['name'],
        'username'  => $u['username'],
        'email'     => $u['email'],
        'role'      => $u['role'],
        'pin'       => $u['pin'] ?? null,
        'isActive'  => (bool)($u['isActive'] ?? $u['is_active'] ?? true),
        'createdAt' => $u['createdAt'] ?? $u['created_at'] ?? null,
        'updatedAt' => $u['updatedAt'] ?? $u['updated_at'] ?? null
    ];
}

// --------------------------------------------------------------------------
// GET /api/users - List all users
// --------------------------------------------------------------------------
if ($method === 'GET') {
    $stmt = $pdo->query("
        SELECT id, name, username, email, role, pin, is_active as isActive, created_at as createdAt, updated_at as updatedAt
        FROM users
        ORDER BY created_at ASC
    ");
    $users = $stmt->fetchAll();

    sendJson(array_map('sanitizeUser', $users));
}

// --------------------------------------------------------------------------
// POST /api/users - Create new cashier or admin
// --------------------------------------------------------------------------
if ($method === 'POST') {
    $input = getJsonInput();
    $name = trim($input['name'] ?? '');
    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    $role = ($input['role'] ?? 'cashier') === 'super_admin' ? 'super_admin' : 'cashier';
    $password = is_string($input['password'] ?? null) ? trim($input['password']) : '';
    $pin = !empty($input['pin']) ? trim((string)$input['pin']) : null;

    if (empty($name) || empty($username) || empty($password)) {
        sendError('Full name, username, and password are required.');
    }

    if (strlen($name) < 2) {
        sendError('Name must be at least 2 characters.');
    }

    if (strlen($password) < 4 || strlen($password) > 128) {
        sendError('Password must be between 4 and 128 characters.');
    }

    if (empty($email)) {
        $email = strtolower($username) . '@pos.local';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('Invalid email format.');
    }

    // Check duplicate username
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
    $checkStmt->execute([$username]);
    if ($checkStmt->fetch()) {
        sendError('A user with this username already exists.', 400);
    }

    // Check duplicate email (mirrors the Node API - keeps login recovery unambiguous)
    $emailStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
    $emailStmt->execute([$email]);
    if ($emailStmt->fetch()) {
        sendError('A user with this email already exists.', 400);
    }

    $id = 'user-' . round(microtime(true) * 1000) . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    $insStmt = $pdo->prepare("
        INSERT INTO users (id, name, username, email, role, password_hash, pin, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW())
    ");
    $insStmt->execute([$id, $name, $username, $email, $role, $passwordHash, $pin]);

    logAudit($admin['id'], $admin['name'], $admin['role'], 'CREATE_USER', 'USER', $id, "Created new {$role}: {$name} ({$username})");

    sendJson([
        'id'        => $id,
        'name'      => $name,
        'username'  => $username,
        'email'     => $email,
        'role'      => $role,
        'pin'       => $pin,
        'isActive'  => true,
        'createdAt' => date('Y-m-d H:i:s')
    ], 201);
}

// --------------------------------------------------------------------------
// PATCH /api/users/:id/toggle - Enable / disable a user
// --------------------------------------------------------------------------
if ($method === 'PATCH') {
    $input = getJsonInput();
    $id = $input['id'] ?? ($_GET['id'] ?? null);

    if (!$id) {
        sendError('User ID is required.');
    }

    if ((string)$id === (string)$admin['id']) {
        sendError('You cannot disable your own Super Admin account.', 400);
    }

    $findStmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $findStmt->execute([$id]);
    $target = $findStmt->fetch();

    if (!$target) {
        sendError('User not found.', 404);
    }

    $newState = !(bool)$target['is_active'];

    $upStmt = $pdo->prepare("UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?");
    $upStmt->execute([$newState ? 1 : 0, $id]);

    // A disabled user must not keep an active session
    if (!$newState) {
        $delStmt = $pdo->prepare("DELETE FROM user_sessions WHERE user_id = ?");
        $delStmt->execute([$id]);
    }

    logAudit($admin['id'], $admin['name'], $admin['role'], 'TOGGLE_USER_STATUS', 'USER', $id,
        "Set status of {$target['username']} to " . ($newState ? 'ACTIVE' : 'DISABLED'));

    $target['is_active'] = $newState ? 1 : 0;
    sendJson(sanitizeUser($target));
}

// --------------------------------------------------------------------------
// PUT /api/users - Update user details
// --------------------------------------------------------------------------
if ($method === 'PUT') {
    $input = getJsonInput();
    $id = $input['id'] ?? ($_GET['id'] ?? null);

    if (!$id) {
        sendError('User ID is required for update.');
    }

    $findStmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $findStmt->execute([$id]);
    $user = $findStmt->fetch();

    if (!$user) {
        sendError('User not found.', 404);
    }

    $name = array_key_exists('name', $input) ? trim((string)$input['name']) : $user['name'];
    if (strlen($name) < 2) {
        sendError('Name must be at least 2 characters.');
    }

    $email = array_key_exists('email', $input) ? trim((string)$input['email']) : $user['email'];
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('Invalid email format.');
    }
    if ($email !== '' && strtolower($email) !== strtolower((string)$user['email'])) {
        $emailStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1");
        $emailStmt->execute([$email, $id]);
        if ($emailStmt->fetch()) {
            sendError('Email already in use.', 400);
        }
    }

    $role = isset($input['role']) ? ($input['role'] === 'super_admin' ? 'super_admin' : 'cashier') : $user['role'];
    $pin = array_key_exists('pin', $input) ? (empty($input['pin']) ? null : trim((string)$input['pin'])) : $user['pin'];
    $isActive = isset($input['isActive']) ? (bool)$input['isActive'] : (bool)$user['is_active'];

    // Never let an admin lock themselves out of the system
    if ((string)$id === (string)$admin['id']) {
        if (!$isActive) {
            sendError('You cannot disable your own Super Admin account.', 400);
        }
        if ($role !== 'super_admin') {
            sendError('You cannot remove your own Super Admin role.', 400);
        }
    }

    $passwordHash = $user['password_hash'];
    if (!empty($input['password'])) {
        $newPassword = trim((string)$input['password']);
        if (strlen($newPassword) < 4 || strlen($newPassword) > 128) {
            sendError('Password must be between 4 and 128 characters.');
        }
        $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
    }

    $upStmt = $pdo->prepare("
        UPDATE users
        SET name = ?, email = ?, role = ?, pin = ?, is_active = ?, password_hash = ?, updated_at = NOW()
        WHERE id = ?
    ");
    $upStmt->execute([$name, $email, $role, $pin, $isActive ? 1 : 0, $passwordHash, $id]);

    if (!$isActive) {
        $delStmt = $pdo->prepare("DELETE FROM user_sessions WHERE user_id = ?");
        $delStmt->execute([$id]);
    }

    logAudit($admin['id'], $admin['name'], $admin['role'], 'UPDATE_USER', 'USER', $id, "Updated user profile: {$name}");

    sendJson([
        'id'        => $id,
        'name'      => $name,
        'username'  => $user['username'],
        'email'     => $email,
        'role'      => $role,
        'pin'       => $pin,
        'isActive'  => $isActive
    ]);
}

sendError('Method not allowed', 405);
