<?php
require_once __DIR__ . '/_common.php';

try {
  $dir = ensure_backups_dir();
  $entries = list_backup_entries($dir);
  json_out(['success'=>true,'backups'=>$entries]);
} catch(Throwable $e){
  error_response('Errore list: ' . $e->getMessage(), 500);
}
