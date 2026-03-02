<?php
require_once __DIR__ . '/_common.php';
require_method('POST');

try {
  $settings = load_settings($pdo);
  if(!$settings['backup_enabled']) {
    json_out(['success'=>false,'error'=>'Backup disattivato nelle impostazioni']);
  }

  $input = read_json_body();
  $kind = (string)($input['kind'] ?? 'manual');
  $includeUploads = array_key_exists('include_uploads', $input) ? (bool)$input['include_uploads'] : null;

  $r = create_backup($pdo, $settings, $kind, $includeUploads);

  json_out([
    'success' => true,
    'backup' => [
      'name' => $r['zipName'],
      'created_at' => $r['manifest']['created_at'],
      'size' => filesize($r['zipPath']),
      'kind' => $r['manifest']['kind'],
      'includes' => $r['manifest']['includes'],
    ],
    'download_url' => 'backup/api/download.php?name=' . urlencode($r['zipName']),
    'deleted' => $r['deleted'],
  ]);

} catch(Throwable $e){
  error_response('Errore backup: ' . $e->getMessage(), 500);
}
