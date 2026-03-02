<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api_bootstrap.php';

try {
  require_method('GET');

  $fish  = str_in($_GET, 'fish_type', null);
  $product_id = int_in($_GET, 'product_id', null);
  $unit  = strtolower((string)str_in($_GET, 'unit', 'units'));

  if (!in_array($unit, ['units','trays'], true)) {
    error_response("unit deve essere 'units' o 'trays'", 400);
  }

  // ===== Settings (DB) =====
  // Usa gli stessi default di api_settings_get.php (solo ciò che serve qui).
  $defaults = [
    'expiry_alert_days' => 30,
    'expiry_include_zero_stock' => false,
  ];
  $settings = $defaults;

  try {
    $stmtS = $pdo->query("SELECT settings_json FROM settings ORDER BY id ASC LIMIT 1");
    $rowS = $stmtS->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($rowS && !empty($rowS['settings_json'])) {
      $decoded = json_decode((string)$rowS['settings_json'], true);
      if (is_array($decoded)) {
        foreach ($defaults as $k => $_) {
          if (array_key_exists($k, $decoded)) $settings[$k] = $decoded[$k];
        }
      }
    }
  } catch (Throwable $e) {
    // tabella settings mancante o non leggibile: fallback ai default
  }

  $alertDays = (int)$settings['expiry_alert_days'];
  if ($alertDays < 1) $alertDays = 1;
  if ($alertDays > 365) $alertDays = 365;

  $includeZero = (bool)$settings['expiry_include_zero_stock'];

  $where = [];
  $params = [];

  if ($fish !== null) {
    $where[] = "p.fish_type = :fish";
    $params[':fish'] = $fish;
  }
  if ($product_id !== null) {
    $where[] = "p.id = :pid";
    $params[':pid'] = $product_id;
  }

   // ===== Stock expression =====
  // Sommo SEMPRE in unità, poi se unit=trays divido una sola volta e faccio FLOOR (arrotonda per difetto).
  $qtyExprUnits = "(CASE
        WHEN m.type='PRODUCTION' THEN m.quantity
        WHEN m.type='SALE' THEN -m.quantity
        WHEN m.type='ADJUSTMENT' THEN m.quantity
        ELSE 0
      END)";

  $stockSelect = ($unit === 'trays')
    ? "FLOOR(COALESCE(SUM($qtyExprUnits), 0) / NULLIF(p.units_per_tray,0))"
    : "COALESCE(SUM($qtyExprUnits), 0)";

  $having = $includeZero ? "stock >= 0" : "stock > 0";

  $sql = "
    SELECT
      l.id AS lot_id,
      COALESCE(b.lot_number, CONCAT('LOT#', l.id)) AS lot_number,
      b.expiration_date,
      p.name,
      p.format,
      $stockSelect AS stock
    FROM lots l
    JOIN products p ON p.id = l.product_id
    JOIN batches b ON b.id = l.batch_id
    LEFT JOIN movements m ON m.lot_id = l.id
    " . (count($where) ? "WHERE " . implode(' AND ', $where) : "") . "
    GROUP BY l.id, b.lot_number, b.expiration_date, p.name, p.format
    HAVING $having
    ORDER BY b.expiration_date ASC
    LIMIT 500
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // counts: in base alla data di scadenza (stock attuale)
  $counts = [
    // chiavi nuove + alias per compatibilità
    "within_3_days" => 0.0,
    "within_alert_days" => 0.0,

    // alias legacy (per non spaccare il frontend se si aspetta "within_7")
    "within_3" => 0.0,
    "within_7_days" => 0.0,
    "within_7" => 0.0,

    "expired" => 0.0,
  ];

  $today = new DateTimeImmutable('today');
  $outRows = [];

  foreach ($rows as $r) {
    $exp = (string)$r['expiration_date']; // YYYY-MM-DD
    $stock = (float)$r['stock'];

    $expDt = DateTimeImmutable::createFromFormat('Y-m-d', substr($exp, 0, 10)) ?: null;
    $diffDays = null;

    if ($expDt) {
      $diffDays = (int)$today->diff($expDt)->format('%r%a'); // negativo se scaduto

      if ($diffDays < 0) {
        $counts["expired"] += $stock;
      } else {
        if ($diffDays <= 7) {
          $counts["within_3_days"] += $stock;
          $counts["within_3"] += $stock;
        }
        if ($diffDays <= $alertDays) {
          $counts["within_alert_days"] += $stock;

          // compat: mappo anche sui "within_7" così l'UI vecchia continua a funzionare
          $counts["within_7_days"] += $stock;
          $counts["within_7"] += $stock;
        }
      }
    }

    // Tabella: mostra solo scaduti o entro alertDays (settings).
    if ($diffDays === null) continue;
    if (!($diffDays < 0 || $diffDays <= $alertDays)) continue;

    $outRows[] = [
      "product" => trim((string)$r['name'] . ' ' . (string)$r['format']),
      "lot" => (string)$r['lot_number'],
      "expiration_date" => substr((string)$r['expiration_date'], 0, 10),
      "stock" => $stock,
      "days_to_expiry" => $diffDays,
    ];
  }

  json_out([
    "success" => true,
    "data" => [
      "meta" => [
        "alert_days" => $alertDays,
        "critical_days" => 7,
        "include_zero_stock" => $includeZero
      ],
      "counts" => $counts,
      "rows" => $outRows
    ]
  ]);

} catch (Throwable $e) {
  json_out(["success"=>false, "error"=>"Errore server", "detail"=>$e->getMessage()], 500);
}
