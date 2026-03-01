<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api_bootstrap.php';

try {
  require_method('GET');

  $start = str_in($_GET, 'start', null);
  $end   = str_in($_GET, 'end', null);
  $fish  = str_in($_GET, 'fish_type', null);
  $product_id = int_in($_GET, 'product_id', null);
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

  // filtro movimenti per periodo (inclusivo)
  $where[] = "m.created_at >= :start_dt";
  $where[] = "m.created_at <  DATE_ADD(:end_dt, INTERVAL 1 DAY)";
  $params[':start_dt'] = $start . " 00:00:00";
  $params[':end_dt']   = $end   . " 00:00:00";

  if ($fish !== null) {
    $where[] = "p.fish_type = :fish";
    $params[':fish'] = $fish;
  }
  if ($product_id !== null) {
    $where[] = "p.id = :pid";
    $params[':pid'] = $product_id;
  }

  $qtyExpr = ($unit === 'trays')
    ? "(m.quantity / NULLIF(p.units_per_tray, 0))"
    : "m.quantity";

  $sql = "
    SELECT
      COALESCE(SUM(CASE WHEN m.type='SALE' THEN $qtyExpr ELSE 0 END), 0) AS total_sold,
      COALESCE(SUM(CASE WHEN m.type='PRODUCTION' THEN $qtyExpr ELSE 0 END), 0) AS total_produced,
      COALESCE(SUM(CASE WHEN m.type='ADJUSTMENT' AND m.quantity < 0 THEN ABS($qtyExpr) ELSE 0 END), 0) AS total_adjust_out,
      COALESCE(SUM(CASE
        WHEN m.type='PRODUCTION' THEN $qtyExpr
        WHEN m.type='SALE' THEN -($qtyExpr)
        WHEN m.type='ADJUSTMENT' THEN $qtyExpr
        ELSE 0
      END), 0) AS net_balance
    FROM movements m
    JOIN lots l ON l.id = m.lot_id
    JOIN products p ON p.id = l.product_id
    WHERE " . implode(' AND ', $where) . "
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

  json_out([
    "success" => true,
    "data" => [
      "total_sold" => (float)$row['total_sold'],
      "total_produced" => (float)$row['total_produced'],
      "total_adjust_out" => (float)$row['total_adjust_out'],
      "net_balance" => (float)$row['net_balance'],
    ]
  ]);
} catch (Throwable $e) {
  json_out(["success"=>false, "error"=>"Errore server", "detail"=>$e->getMessage()], 500);
}
