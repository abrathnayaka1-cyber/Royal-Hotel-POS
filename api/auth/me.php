<?php
/**
 * Current Authenticated User Endpoint
 */

require_once __DIR__ . '/../middleware.php';

$user = requireAuth();

sendJson([
    'user' => [
        'id'        => $user['id'],
        'name'      => $user['name'],
        'username'  => $user['username'],
        'email'     => $user['email'],
        'role'      => $user['role'],
        'isActive'  => $user['isActive'],
        'pin'       => $user['pin']
    ]
]);
