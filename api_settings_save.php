<?php
require_once __DIR__ . '/api_bootstrap.php';
require_once __DIR__ . '/db.php';

require_method('POST');

function default_settings(): array {
  return [
    'expiry_alert_days' => 30,
    'expiry_include_zero_stock' => false,

    'low_stock_alert_enabled' => true,
    'low_stock_threshold_units' => 10,

    'sale_default_mode' => 'FEFO',
    'confirm_sale_before_commit' => true,

    'scanner_auto_submit_on_ean' => false,
    'scanner_beep_on_success' => false,
    'scanner_vibrate_on_error' => false,
  ];
}

function to_bool($v): bool {
  if (is_bool($v)) return $v;
  if (is_int($v)) return $v !== 0;
  $s = strtolower(trim((string)$v));
  return in_array($s, ['1','true','yes','on'], true);
}

try {
  $input = read_json_body();
  $in = $input['settings'] ?? $input;
  if (!is_array($in)) error_response('Payload non valido', 400);

  $defaults = default_settings();
  $out = $defaults;

  // validate + normalize
  if (array_key_exists('expiry_alert_days', $in)) {
    $d = (int)$in['expiry_alert_days'];
    if ($d < 1) $d = 1;
    if ($d > 365) $d = 365;
    $out['expiry_alert_days'] = $d;
  }
  if (array_key_exists('expiry_include_zero_stock', $in)) {
    $out['expiry_include_zero_stock'] = to_bool($in['expiry_include_zero_stock']);
  }
  if (array_key_exists('low_stock_alert_enabled', $in)) {
    $out['low_stock_alert_enabled'] = to_bool($in['low_stock_alert_enabled']);
  }
  if (array_key_exists('low_stock_threshold_units', $in)) {
    $t = (int)$in['low_stock_threshold_units'];
    if ($t < 0) $t = 0;
    $out['low_stock_threshold_units'] = $t;
  }
  if (array_key_exists('sale_default_mode', $in)) {
    $m = strtoupper(trim((string)$in['sale_default_mode']));
    $out['sale_default_mode'] = ($m === 'MANUAL') ? 'MANUAL' : 'FEFO';
  }
  if (array_key_exists('confirm_sale_before_commit', $in)) {
    $out['confirm_sale_before_commit'] = to_bool($in['confirm_sale_before_commit']);
  }
  if (array_key_exists('scanner_auto_submit_on_ean', $in)) {
    $out['scanner_auto_submit_on_ean'] = to_bool($in['scanner_auto_submit_on_ean']);
  }
  if (array_key_exists('scanner_beep_on_success', $in)) {
    $out['scanner_beep_on_success'] = to_bool($in['scanner_beep_on_success']);
  }
  if (array_key_exists('scanner_vibrate_on_error', $in)) {
    $out['scanner_vibrate_on_error'] = to_bool($in['scanner_vibrate_on_error']);
  }

  // Ensure table exists? If not, throw clean error.
  // Upsert 1 riga
  $pdo->beginTransaction();

  $row = null;
  $stmt = $pdo->query("SELECT id FROM settings ORDER BY id ASC LIMIT 1 FOR UPDATE");
  $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

  $json = json_encode($out, JSON_UNESCAPED_UNICODE);

  if ($row) {
    $stmtU = $pdo->prepare("UPDATE settings SET settings_json = :j WHERE id = :id");
    $stmtU->execute([':j' => $json, ':id' => (int)$row['id']]);
  } else {
    $stmtI = $pdo->prepare("INSERT INTO settings (settings_json) VALUES (:j)");
    $stmtI->execute([':j' => $json]);
  }

  $pdo->commit();

  json_out([
    'success' => true,
    'settings' => $out
  ]);

} catch (Throwable $e) {
  if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
  json_out([
    'success' => false,
    'error' => 'Errore server',
    'detail' => $e->getMessage()
  ], 500);
}
