<?php
require_once __DIR__ . '/api_bootstrap.php';
require_once __DIR__ . '/db.php';

// Settings globali (1 riga). Se la tabella non esiste o è vuota, ritorna default.

function default_settings(): array {
  return [
    'expiry_alert_days' => 30,
    'expiry_include_zero_stock' => false,

    'low_stock_alert_enabled' => true,
    'low_stock_threshold_units' => 10,

    'sale_default_mode' => 'FEFO', // FEFO | MANUAL
    'confirm_sale_before_commit' => true,

    'scanner_auto_submit_on_ean' => false,
    'scanner_beep_on_success' => false,
    'scanner_vibrate_on_error' => false,
  ];
}

try {
  $defaults = default_settings();

  // prova a leggere la prima riga
  $row = null;
  try {
    $stmt = $pdo->query("SELECT id, settings_json, updated_at FROM settings ORDER BY id ASC LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
  } catch (Throwable $e) {
    // tabella mancante o errore SQL: fallback ai defaults
    json_out([
      'success' => true,
      'settings' => $defaults,
      'meta' => [ 'source' => 'defaults', 'warning' => 'settings table missing or not readable' ]
    ]);
  }

  if (!$row) {
    // tabella esiste ma vuota: prova a inserirla (non blocca se fallisce)
    try {
      $stmtI = $pdo->prepare("INSERT INTO settings (settings_json) VALUES (:j)");
      $stmtI->execute([':j' => json_encode($defaults, JSON_UNESCAPED_UNICODE)]);
    } catch (Throwable $e) { /* ignore */ }

    json_out([
      'success' => true,
      'settings' => $defaults,
      'meta' => [ 'source' => 'defaults', 'warning' => 'settings row missing' ]
    ]);
  }

  $decoded = json_decode($row['settings_json'] ?? '', true);
  if (!is_array($decoded)) $decoded = [];

  // merge: defaults + valori salvati
  $settings = $defaults;
  foreach ($defaults as $k => $_) {
    if (array_key_exists($k, $decoded)) $settings[$k] = $decoded[$k];
  }

  json_out([
    'success' => true,
    'settings' => $settings,
    'meta' => [ 'source' => 'db', 'updated_at' => $row['updated_at'] ?? null ]
  ]);

} catch (Throwable $e) {
  json_out([
    'success' => true,
    'settings' => default_settings(),
    'meta' => [ 'source' => 'defaults', 'warning' => 'server error', 'detail' => $e->getMessage() ]
  ]);
}
