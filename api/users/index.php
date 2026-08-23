<?php
/**
 * User & Cashier Management Endpoint (Super Admin Only)
 * Allows Super Admin to list users, create cashiers, update roles and passwords.
 */

require_once __DIR__ . '/../middleware.php';

$admin = requireSuperAdmin();
$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];

// Handle method spoofing if needed
if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
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

    $sanitized = array_map(function($u) {
        return [
            'id'        => $u['id'],
            'name'      => $u['name'],
            'username'  => $u['username'],
            'email'     => $u['email'],
            'role'      => $u['role'],
            'pin'       => $u['pin'],
            'isActive'  => (bool)$u['isActive'],
            'createdAt' => $u['createdAt'],
            'updatedAt' => $u['updatedAt']
        ];
    }, $users);

    sendJson($sanitized);
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
    $password = trim($input['password'] ?? '');
    $pin = !empty($input['pin']) ? trim($input['pin']) : null;

    if (empty($name) || empty($username) || empty($password)) {
        sendError('Full name, username, and password are required.');
    }

    if (empty($email)) {
        $email = strtolower($username) . '@pos.local';
    }

    // Check duplicate username
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
    $checkStmt->execute([$username]);
    if ($checkStmt->fetch()) {
        sendError('A user with this username already exists.', 400);
    }

    $id = 'user-' . round(microtime(true) * 1000);
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

    $name = trim($input['name'] ?? $user['name']);
    $email = trim($input['email'] ?? $user['email']);
    $role = isset($input['role']) ? ($input['role'] === 'super_admin' ? 'super_admin' : 'cashier') : $user['role'];
    $pin = array_key_exists('pin', $input) ? (empty($input['pin']) ? null : trim($input['pin'])) : $user['pin'];
    $isActive = isset($input['isActive']) ? (bool)$input['isActive'] : (bool)$user['is_active'];

    $passwordHash = $user['password_hash'];
    if (!empty($input['password'])) {
        $passwordHash = password_hash(trim($input['password']), PASSWORD_BCRYPT);
    }

    $upStmt = $pdo->prepare("
        UPDATE users
        SET name = ?, email = ?, role = ?, pin = ?, is_active = ?, password_hash = ?, updated_at = NOW()
        WHERE id = ?
    ");
    $upStmt->execute([$name, $email, $role, $pin, $isActive ? 1 : 0, $passwordHash, $id]);

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
