<?php
require_once __DIR__ . '/../../api_bootstrap.php';
require_once __DIR__ . '/../../db.php';

function backup_defaults(): array {
  return [
    'backup_enabled' => true,
    'backup_environment' => 'local', // local | remote
    'backup_frequency' => 'off',     // off | daily | weekly | monthly
    'backup_time' => '02:00',        // HH:MM
    'backup_keep_last' => 14,
    'backup_auto_prune' => true,
    'backup_include_uploads' => true,
  ];
}

function load_settings(PDO $pdo): array {
  $defaults = backup_defaults();
  try {
    $stmt = $pdo->query("SELECT settings_json FROM settings ORDER BY id ASC LIMIT 1");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if(!$row || empty($row['settings_json'])) return $defaults;
    $decoded = json_decode($row['settings_json'], true);
    if(!is_array($decoded)) return $defaults;
    $out = $defaults;
    foreach($defaults as $k=>$v){
      if(array_key_exists($k, $decoded)) $out[$k] = $decoded[$k];
    }
    // normalize
    $env = strtolower(trim((string)$out['backup_environment']));
    $out['backup_environment'] = ($env === 'remote') ? 'remote' : 'local';

    $freq = strtolower(trim((string)$out['backup_frequency']));
    $out['backup_frequency'] = in_array($freq, ['off','daily','weekly','monthly'], true) ? $freq : 'off';

    $t = trim((string)$out['backup_time']);
    if(!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) $t = '02:00';
    $out['backup_time'] = $t;

    $keep = (int)$out['backup_keep_last'];
    if($keep < 1) $keep = 1;
    if($keep > 365) $keep = 365;
    $out['backup_keep_last'] = $keep;

    $out['backup_auto_prune'] = (bool)$out['backup_auto_prune'];
    $out['backup_enabled'] = (bool)$out['backup_enabled'];
    $out['backup_include_uploads'] = (bool)$out['backup_include_uploads'];

    return $out;
  } catch(Throwable $e){
    return $defaults;
  }
}

function backups_path(): string {
  return realpath(__DIR__ . '/../../storage/backups') ?: (__DIR__ . '/../../storage/backups');
}

function ensure_backups_dir(): string {
  $dir = backups_path();
  if(!is_dir($dir)){
    @mkdir($dir, 0775, true);
  }
  return $dir;
}

function sanitize_backup_name(string $name): string {
  // allow only safe characters
  $name = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $name);
  return $name;
}

function list_backup_entries(string $dir): array {
  $out = [];
  foreach(glob($dir . '/*.zip') as $zip){
    $base = basename($zip, '.zip');
    $metaFile = $dir . '/' . $base . '.json';
    $meta = null;
    if(is_file($metaFile)){
      $meta = json_decode(@file_get_contents($metaFile), true);
    }
    $out[] = [
      'name' => basename($zip),
      'size' => filesize($zip),
      'created_at' => $meta['created_at'] ?? date('c', filemtime($zip)),
      'kind' => $meta['kind'] ?? 'unknown',
      'includes' => $meta['includes'] ?? [],
      'app_version' => $meta['app_version'] ?? null,
      'meta' => $meta,
    ];
  }
  // sort newest first
  usort($out, function($a,$b){
    return strcmp($b['created_at'], $a['created_at']);
  });
  return $out;
}

function auto_prune_backups(string $dir, int $keep): array {
  $entries = list_backup_entries($dir);
  $deleted = [];
  if(count($entries) <= $keep) return $deleted;
  $toDelete = array_slice($entries, $keep);
  foreach($toDelete as $e){
    $zip = $dir . '/' . $e['name'];
    $json = $dir . '/' . basename($e['name'], '.zip') . '.json';
    if(is_file($zip)) @unlink($zip);
    if(is_file($json)) @unlink($json);
    $deleted[] = $e['name'];
  }
  return $deleted;
}

// --- DB dump (PDO-based, portable) ---
function dump_database_sql(PDO $pdo): string {
  $sql = "";
  $sql .= "SET NAMES utf8mb4;\n";
  $sql .= "SET foreign_key_checks = 0;\n\n";

  $tables = [];
  $res = $pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  while($row = $res->fetch(PDO::FETCH_NUM)){
    $tables[] = $row[0];
  }

  foreach($tables as $table){
    $stmt = $pdo->query("SHOW CREATE TABLE `{$table}`");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $create = $row['Create Table'] ?? array_values($row)[1] ?? null;
    if($create){
      $sql .= "-- Table: `{$table}`\n";
      $sql .= "DROP TABLE IF EXISTS `{$table}`;\n";
      $sql .= $create . ";\n\n";
    }

    // dump data
    $dataStmt = $pdo->query("SELECT * FROM `{$table}`");
    $cols = [];
    $colCount = $dataStmt->columnCount();
    for($i=0;$i<$colCount;$i++){
      $meta = $dataStmt->getColumnMeta($i);
      $cols[] = '`' . $meta['name'] . '`';
    }
    $colList = implode(',', $cols);

    $rows = 0;
    while($r = $dataStmt->fetch(PDO::FETCH_ASSOC)){
      $vals = [];
      foreach($r as $v){
        if($v === null){
          $vals[] = "NULL";
        } else if(is_int($v) || is_float($v)){
          $vals[] = (string)$v;
        } else if(is_string($v) && preg_match('/^-?\d+(\.\d+)?$/', $v)){
          // numeric string, keep as is (avoid quotes for speed)
          $vals[] = $v;
        } else {
          $vals[] = $pdo->quote((string)$v);
        }
      }
      $sql .= "INSERT INTO `{$table}` ({$colList}) VALUES (" . implode(',', $vals) . ");\n";
      $rows++;
      if($rows % 500 == 0){
        $sql .= "\n";
      }
    }
    $sql .= "\n";
  }

  $sql .= "SET foreign_key_checks = 1;\n";
  return $sql;
}


function create_backup(PDO $pdo, array $settings, string $kind='manual', ?bool $includeUploadsOverride=null): array {
  $kind = strtolower(trim($kind));
  if(!in_array($kind, ['manual','auto'], true)) $kind = 'manual';
  $includeUploads = ($includeUploadsOverride !== null) ? (bool)$includeUploadsOverride : (bool)$settings['backup_include_uploads'];

  $dir = ensure_backups_dir();
  if(!is_writable($dir)) {
    throw new Exception('Cartella backup non scrivibile: ' . $dir);
  }

  $ts = date('Y-m-d_H-i');
  $baseName = "backup_{$ts}_{$kind}";
  $zipName = sanitize_backup_name($baseName) . ".zip";
  $zipPath = $dir . "/" . $zipName;

  $tmpRoot = sys_get_temp_dir() . '/wm_backup_' . uniqid();
  @mkdir($tmpRoot, 0775, true);

  $includes = ['db'=>true,'uploads'=>$includeUploads];

  // DB
  $dbSql = dump_database_sql($pdo);
  file_put_contents($tmpRoot . '/db.sql', $dbSql);

  // uploads optional
  if($includeUploads){
    $uploadsPath = realpath(__DIR__ . '/../../uploads');
    if($uploadsPath && is_dir($uploadsPath)){
      $dest = $tmpRoot . '/uploads';
      @mkdir($dest, 0775, true);
      $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($uploadsPath, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
      );
      foreach($it as $file){
        $rel = substr($file->getPathname(), strlen($uploadsPath)+1);
        $target = $dest . '/' . $rel;
        if($file->isDir()){
          @mkdir($target, 0775, true);
        } else {
          @mkdir(dirname($target), 0775, true);
          @copy($file->getPathname(), $target);
        }
      }
    }
  }

  $manifest = [
    'created_at' => date('c'),
    'kind' => $kind,
    'includes' => $includes,
    'app_version' => 'v0.1',
  ];
  file_put_contents($tmpRoot . '/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));

  $zip = new ZipArchive();
  if($zip->open($zipPath, ZipArchive::CREATE|ZipArchive::OVERWRITE) !== true){
    throw new Exception('Impossibile creare lo zip');
  }
  $it2 = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($tmpRoot, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
  );
  foreach($it2 as $file){
    $rel = substr($file->getPathname(), strlen($tmpRoot)+1);
    if($file->isDir()){
      $zip->addEmptyDir($rel);
    } else {
      $zip->addFile($file->getPathname(), $rel);
    }
  }
  $zip->close();

  $metaPath = $dir . '/' . basename($zipName, '.zip') . '.json';
  file_put_contents($metaPath, json_encode($manifest, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES));

  // cleanup temp
  $it3 = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($tmpRoot, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
  );
  foreach($it3 as $f){
    if($f->isDir()) @rmdir($f->getPathname()); else @unlink($f->getPathname());
  }
  @rmdir($tmpRoot);

  $deleted = [];
  if((bool)$settings['backup_auto_prune']) {
    $deleted = auto_prune_backups($dir, (int)$settings['backup_keep_last']);
  }

  return [
    'zipName' => $zipName,
    'zipPath' => $zipPath,
    'manifest' => $manifest,
    'deleted' => $deleted,
  ];
}
