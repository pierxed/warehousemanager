<?php
header('Content-Type: application/json');
error_reporting(0);
include 'db.php';

$data = json_decode(file_get_contents("php://input"), true);
if(!$data){ echo json_encode(['error'=>'JSON non valido']); exit; }

$product_id = (int)($data['product_id'] ?? 0);
$qtyToSell = (int)($data['quantity'] ?? 0);

if($product_id<=0 || $qtyToSell<=0){
  echo json_encode(['error'=>'Dati mancanti']);
  exit;
}

// Prendo lotti del prodotto ordinati (FIFO: prima scadenza, poi produzione)
$stmt = $pdo->prepare("
  SELECT id, expiration_date, production_date
  FROM lots
  WHERE product_id = ?
  ORDER BY expiration_date ASC, production_date ASC, id ASC
");
$stmt->execute([$product_id]);
$lots = $stmt->fetchAll();

if(!$lots){
  echo json_encode(['error'=>'Nessun lotto per questo prodotto']);
  exit;
}

// calcolo stock per lotto (production - sale)
$lotStock = [];
foreach($lots as $l){
  $stmt2 = $pdo->prepare("
    SELECT 
      SUM(CASE WHEN type='PRODUCTION' THEN quantity ELSE 0 END) AS prod,
      SUM(CASE WHEN type='SALE' THEN quantity ELSE 0 END) AS sale
    FROM movements
    WHERE lot_id = ?
  ");
  $stmt2->execute([(int)$l['id']]);
  $r = $stmt2->fetch();
  $stock = (int)($r['prod'] ?? 0) - (int)($r['sale'] ?? 0);
  $lotStock[] = ['lot_id'=>(int)$l['id'], 'stock'=>$stock];
}

// stock totale prodotto
$totalAvailable = array_reduce($lotStock, fn($s,$x)=>$s+max(0,$x['stock']), 0);
if($totalAvailable < $qtyToSell){
  echo json_encode(['error'=>"Stock insufficiente. Disponibile: $totalAvailable"]);
  exit;
}

// vendi FIFO distribuendo sui lotti
$remaining = $qtyToSell;
foreach($lotStock as $ls){
  if($remaining <= 0) break;
  $available = max(0, (int)$ls['stock']);
  if($available <= 0) continue;

  $take = min($available, $remaining);

  $stmtIns = $pdo->prepare("
    INSERT INTO movements (product_id, lot_id, quantity, type)
    VALUES (?, ?, ?, 'SALE')
  ");
  $stmtIns->execute([$product_id, (int)$ls['lot_id'], $take]);

  $remaining -= $take;
}

// ricalcolo stock prodotto dopo vendita
$stmt3 = $pdo->prepare("
  SELECT 
    SUM(CASE WHEN type='PRODUCTION' THEN quantity ELSE 0 END) AS prod,
    SUM(CASE WHEN type='SALE' THEN quantity ELSE 0 END) AS sale
  FROM movements
  WHERE product_id = ?
");
$stmt3->execute([$product_id]);
$r2 = $stmt3->fetch();
$remainingProductStock = (int)($r2['prod'] ?? 0) - (int)($r2['sale'] ?? 0);

echo json_encode([
  'success'=>true,
  'sold'=>$qtyToSell,
  'remaining_product_stock'=>$remainingProductStock
]);