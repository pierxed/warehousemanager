<?php
header('Content-Type: application/json');
require 'db.php';

$stmt = $pdo->query("
    SELECT 
        id,
        lot_number,
        fish_type,
        production_date
    FROM batches
    WHERE production_date = CURDATE()
    ORDER BY id DESC
");

echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));