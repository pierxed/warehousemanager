<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api_bootstrap.php';

try {
  require_method('GET');

  $start = str_in($_GET, 'start', null);
  $end   = str_in($_GET, 'end', null);
  $fish  = str_in($_GET, 'fish_type', null);
  $unit  = strtolower((string)str_in($_GET, 'unit', 'units'));

  if (!$start || !$end) {
    error_response("Parametri richiesti: start, end (YYYY-MM-DD)", 400);
  }
  if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end)) {
    error_response("Formato date non valido. Usa YYYY-MM-DD", 400);
  }
  if (!in_array($unit, ['units','trays'], true)) {
    error_response("unit deve essere 'units' o 'trays'", 400);
  }

  $where = [];
  $params = [];

  $where[] = "m.created_at >= :start_dt";
  $where[] = "m.created_at <  DATE_ADD(:end_dt, INTERVAL 1 DAY)";
  $where[] = "m.type = 'SALE'";
  $params[':start_dt'] = $start . " 00:00:00";
  $params[':end_dt']   = $end   . " 00:00:00";

  if ($fish !== null) {
    $where[] = "p.fish_type = :fish";
    $params[':fish'] = $fish;
  }

$qtyExpr = ($unit === 'trays')
    ? "FLOOR(m.quantity / NULLIF(p.units_per_tray, 0))"
    : "m.quantity";

  $sql = "
    SELECT
      p.id AS product_id,
      p.name,
      p.format,
      COALESCE(SUM($qtyExpr), 0) AS qty
    FROM movements m
    JOIN lots l ON l.id = m.lot_id
    JOIN products p ON p.id = l.product_id
    WHERE " . implode(' AND ', $where) . "
    GROUP BY p.id, p.name, p.format
    ORDER BY qty DESC
    LIMIT 10
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $out = array_map(function($r){
    $label = trim((string)$r['name'] . ' ' . (string)$r['format']);
    return [
      "product_id" => (int)$r['product_id'],
      "label" => $label,
      "qty" => (float)$r['qty'],
    ];
  }, $rows);

  json_out(["success"=>true, "data"=>$out]);
} catch (Throwable $e) {
  json_out(["success"=>false, "error"=>"Errore server", "detail"=>$e->getMessage()], 500);
}
