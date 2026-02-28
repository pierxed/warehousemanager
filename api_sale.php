<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
ini_set('display_errors', '0');
error_reporting(0);

function out(array $payload): void {
  echo json_encode($payload, JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  include 'db.php'; // deve SOLO creare $pdo, niente echo

  $raw = file_get_contents("php://input");
  $data = json_decode($raw, true);

  if (!is_array($data)) out(['error' => 'JSON non valido']);

  $product_id = (int)($data['product_id'] ?? 0);
  $qtyToSell  = (int)($data['quantity'] ?? 0);

  if ($product_id <= 0 || $qtyToSell <= 0) out(['error' => 'Dati mancanti']);

  // Prendo lotti del prodotto ordinati (FIFO: prima scadenza, poi produzione)
  $stmt = $pdo->prepare("
    SELECT id, expiration_date, production_date
    FROM lots
    WHERE product_id = ?
    ORDER BY expiration_date ASC, production_date ASC, id ASC
  ");
  $stmt->execute([$product_id]);
  $lots = $stmt->fetchAll(PDO::FETCH_ASSOC);

  if (!$lots) out(['error' => 'Nessun lotto per questo prodotto']);

  // calcolo stock per lotto (production - sale)
  $lotStock = [];
  $stmt2 = $pdo->prepare("
    SELECT 
      COALESCE(SUM(CASE WHEN type='PRODUCTION' THEN quantity END),0) AS prod,
      COALESCE(SUM(CASE WHEN type='SALE' THEN quantity END),0) AS sale
    FROM movements
    WHERE lot_id = ?
  ");

  foreach ($lots as $l) {
    $lotId = (int)$l['id'];
    $stmt2->execute([$lotId]);
    $r = $stmt2->fetch(PDO::FETCH_ASSOC) ?: ['prod'=>0,'sale'=>0];
    $stock = (int)$r['prod'] - (int)$r['sale'];
    $lotStock[] = ['lot_id' => $lotId, 'stock' => $stock];
  }

  // stock totale prodotto
  $totalAvailable = 0;
  foreach ($lotStock as $x) $totalAvailable += max(0, (int)$x['stock']);

  if ($totalAvailable < $qtyToSell) {
    out(['error' => "Stock insufficiente. Disponibile: $totalAvailable"]);
  }

  // vendi FIFO distribuendo sui lotti (transazione)
  $pdo->beginTransaction();

  $remaining = $qtyToSell;

  $stmtIns = $pdo->prepare("
    INSERT INTO movements (product_id, lot_id, quantity, type)
    VALUES (?, ?, ?, 'SALE')
  ");

  foreach ($lotStock as $ls) {
    if ($remaining <= 0) break;

    $available = max(0, (int)$ls['stock']);
    if ($available <= 0) continue;

    $take = min($available, $remaining);

    $stmtIns->execute([$product_id, (int)$ls['lot_id'], $take]);

    $remaining -= $take;
  }

  $pdo->commit();

  // ricalcolo stock prodotto dopo vendita
  $stmt3 = $pdo->prepare("
    SELECT 
      COALESCE(SUM(CASE WHEN type='PRODUCTION' THEN quantity END),0) AS prod,
      COALESCE(SUM(CASE WHEN type='SALE' THEN quantity END),0) AS sale
    FROM movements
    WHERE product_id = ?
  ");
  $stmt3->execute([$product_id]);
  $r2 = $stmt3->fetch(PDO::FETCH_ASSOC) ?: ['prod'=>0,'sale'=>0];
  $remainingProductStock = (int)$r2['prod'] - (int)$r2['sale'];

  out([
    'success' => true,
    'sold' => $qtyToSell,
    'remaining_product_stock' => $remainingProductStock
  ]);

} catch (Throwable $e) {
  // se la transazione è aperta, rollback
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }
  out([
  'error' => 'Errore server',
  'detail' => $e->getMessage()
]);
}