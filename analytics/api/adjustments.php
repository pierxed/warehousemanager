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

  $where[] = "m.created_at >= :start_dt";
  $where[] = "m.created_at <  DATE_ADD(:end_dt, INTERVAL 1 DAY)";
  $where[] = "m.type = 'ADJUSTMENT'";
  $where[] = "m.quantity < 0";
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

  $qtyAbsExpr = ($unit === 'trays')
    ? "ABS(m.quantity / NULLIF(p.units_per_tray, 0))"
    : "ABS(m.quantity)";

  $sqlReasons = "
    SELECT
      COALESCE(m.reason,'(SENZA MOTIVO)') AS reason,
      COALESCE(SUM($qtyAbsExpr), 0) AS qty_out
    FROM movements m
    JOIN lots l ON l.id = m.lot_id
    JOIN products p ON p.id = l.product_id
    WHERE " . implode(' AND ', $where) . "
    GROUP BY COALESCE(m.reason,'(SENZA MOTIVO)')
    ORDER BY qty_out DESC
  ";

  $stmt = $pdo->prepare($sqlReasons);
  $stmt->execute($params);
  $reasons = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $outReasons = array_map(function($r){
    return [
      "reason" => (string)$r['reason'],
      "qty_out" => (float)$r['qty_out'],
    ];
  }, $reasons);

  json_out([
    "success" => true,
    "data" => [
      "reasons" => $outReasons
    ]
  ]);
} catch (Throwable $e) {
  json_out(["success"=>false, "error"=>"Errore server", "detail"=>$e->getMessage()], 500);
}
