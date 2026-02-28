<?php
declare(strict_types=1);

require_once __DIR__ . '/api_bootstrap.php';

try {
  require_method('GET');

  $ean = str_in($_GET, 'ean', '');
  if ($ean === '') {
    error_response('EAN mancante', 400);
  }

$stmt = $pdo->prepare("
  SELECT id, name, ean, units_per_tray
  FROM products
  WHERE ean = ? AND is_active = 1
");
  $stmt->execute([$ean]);
  $p = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$p) {
    error_response('Prodotto non trovato', 404);
  }

  json_response([
    'success' => true,
    'id' => (int)$p['id'],
    'name' => $p['name'],
    'ean' => $p['ean'],
    'units_per_tray' => (int)$p['units_per_tray']
  ]);

} catch (Throwable $e) {
  json_response(['success'=>false,'error'=>'Errore server','detail'=>$e->getMessage()], 500);
}