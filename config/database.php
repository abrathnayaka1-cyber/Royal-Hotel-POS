<?php
/**
 * Hostinger MySQL Database Connection Provider
 * Provides robust PDO connection with prepared statement security
 */

// Prevent direct execution or file path leakage
if (basename($_SERVER['PHP_SELF'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    die(json_encode(['error' => 'Direct access forbidden.']));
}

class Database {
    private static ?PDO $pdo = null;

    public static function getConnection(): PDO {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $config = [];
        $configFile = __DIR__ . '/config.php';
        $exampleFile = __DIR__ . '/config.php.example';

        if (file_exists($configFile)) {
            $loaded = require $configFile;
            if (is_array($loaded)) {
                $config = $loaded;
            }
        } elseif (file_exists($exampleFile)) {
            $loaded = require $exampleFile;
            if (is_array($loaded)) {
                $config = $loaded;
            }
        }

        $host = getenv('DB_HOST') ?: ($config['db']['host'] ?? 'localhost');
        $port = getenv('DB_PORT') ?: ($config['db']['port'] ?? '3306');
        $dbName = getenv('DB_NAME') ?: ($config['db']['database'] ?? 'u123456789_pos_db');
        $user = getenv('DB_USER') ?: ($config['db']['username'] ?? 'root');
        $pass = getenv('DB_PASS') ?: ($config['db']['password'] ?? '');
        $charset = $config['db']['charset'] ?? 'utf8mb4';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset} COLLATE utf8mb4_unicode_ci"
        ];

        try {
            self::$pdo = new PDO($dsn, $user, $pass, $options);
            return self::$pdo;
        } catch (PDOException $e) {
            error_log('[POS DB Connection Error] ' . $e->getMessage());
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'error' => 'Database connection failed. Please check Hostinger MySQL credentials in config/config.php.'
            ]);
            exit;
        }
    }
}
