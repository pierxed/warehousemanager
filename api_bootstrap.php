<?php
// api_bootstrap.php

require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// ===== ERROR HANDLING =====
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function json_response($data, int $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function error_response($message, int $status = 400) {
    json_response([
        "success" => false,
        "error" => $message
    ], $status);
}

function require_method($method) {
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        error_response("Metodo non consentito", 405);
    }
}

function get_json_input() {
    $input = json_decode(file_get_contents("php://input"), true);

    if (!$input) {
        error_response("JSON non valido");
    }

    return $input;
}

// compatibilità vecchie API
function json_out($data, int $status = 200) {
    json_response($data, $status);
}

// compatibilità helper legacy
function str_in(array $src, string $key, $default = null): ?string {
    if (!isset($src[$key])) return $default;
    $v = $src[$key];
    if (is_array($v)) return $default;
    $v = trim((string)$v);
    return $v === '' ? $default : $v;
}

function int_in(array $src, string $key, $default = null): ?int {
    $v = str_in($src, $key, null);
    if ($v === null) return $default;
    if (!preg_match('/^-?\d+$/', $v)) return $default;
    return (int)$v;
}

function require_param_str(array $src, string $key): string {
    $v = str_in($src, $key, null);
    if ($v === null) error_response("Parametro mancante o vuoto: $key", 400);
    return $v;
}

function require_param_int(array $src, string $key): int {
    $v = int_in($src, $key, null);
    if ($v === null) error_response("Parametro mancante o non valido: $key", 400);
    return $v;
}

// compatibilità legacy
function read_json_body(): array {
  return get_json_input();
}