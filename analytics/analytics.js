/* analytics/analytics.js
   Pagina Analisi isolata: usa endpoint dedicati in analytics/api/.
*/

let chartTrends = null;
let chartTop = null;
let chartAdjust = null;

function fmtInt(n){
  if (n === null || n === undefined) return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('it-IT').format(Math.round(x));
}

function toISODate(d){
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function getPresetRange(preset){
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today'){
    return { start: today, end: today };
  }
  if (preset === '7d' || preset === '30d'){
    const days = preset === '7d' ? 6 : 29; // inclusivo
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    return { start, end: today };
  }
  if (preset === 'month'){
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = today;
    return { start, end };
  }
  return null;
}

function buildParams(){
  const start = document.getElementById('start_date').value;
  const end = document.getElementById('end_date').value;
  const fishType = document.getElementById('fish_type').value.trim();
  const productId = document.getElementById('product_id').value.trim();
  const unit = document.getElementById('unit_mode').value;

  const p = new URLSearchParams();
  if (start) p.set('start', start);
  if (end) p.set('end', end);
  if (fishType) p.set('fish_type', fishType);
  if (productId) p.set('product_id', productId);
  if (unit) p.set('unit', unit);
  return p;
}

async function apiGet(path, params){
  const url = `${path}?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json){
    throw new Error('Errore di rete');
  }
  if (json.success === false){
    throw new Error(json.error || 'Errore server');
  }
  return json.data ?? json;
}

function setSubtitle(){
  const start = document.getElementById('start_date').value;
  const end = document.getElementById('end_date').value;
  const unit = document.getElementById('unit_mode').value === 'trays' ? 'vassoi' : 'unità';
  document.getElementById('subtitle').textContent = `Periodo ${start || '—'} → ${end || '—'} • vista in ${unit}`;
}

function destroyCharts(){
  if (chartTrends){ chartTrends.destroy(); chartTrends = null; }
  if (chartTop){ chartTop.destroy(); chartTop = null; }
  if (chartAdjust){ chartAdjust.destroy(); chartAdjust = null; }
}

function renderSummary(data){
  document.getElementById('kpi_sold').textContent = fmtInt(data.total_sold);
  document.getElementById('kpi_produced').textContent = fmtInt(data.total_produced);
  document.getElementById('kpi_adjust_out').textContent = fmtInt(data.total_adjust_out);
  document.getElementById('kpi_net').textContent = fmtInt(data.net_balance);
}

function renderTrends(rows){
  const labels = rows.map(r => r.day);
  const produced = rows.map(r => Number(r.produced) || 0);
  const sold = rows.map(r => Number(r.sold) || 0);

  const ctx = document.getElementById('chart_trends');
  chartTrends = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Prodotto', data: produced, tension: 0.25 },
        { label: 'Venduto', data: sold, tension: 0.25 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true },
      }
    }
  });
}

function renderTop(rows){
  const labels = rows.map(r => r.label);
  const values = rows.map(r => Number(r.qty) || 0);
  const ctx = document.getElementById('chart_top');
  chartTop = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Venduto', data: values }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderExpiries(data){
  document.getElementById('exp_3').textContent = fmtInt(data.counts.within_3_days);
  document.getElementById('exp_7').textContent = fmtInt(data.counts.within_7_days);
  document.getElementById('exp_0').textContent = fmtInt(data.counts.expired);

  const tbody = document.querySelector('#exp_table tbody');
  tbody.innerHTML = '';
  (data.rows || []).forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.product)}</td>
      <td>${escapeHtml(r.lot)}</td>
      <td>${escapeHtml(r.expiration_date)}</td>
      <td style="text-align:right;">${fmtInt(r.stock)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdjustments(data){
  const labels = (data.reasons || []).map(r => r.reason);
  const values = (data.reasons || []).map(r => Number(r.qty_out) || 0);

  const ctx = document.getElementById('chart_adjust');
  chartAdjust = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'OUT', data: values }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

async function refresh(){
  setSubtitle();
  destroyCharts();

  const params = buildParams();

  const [summary, trends, top, expiries, adjustments] = await Promise.all([
    apiGet('./api/summary.php', params),
    apiGet('./api/trends.php', params),
    apiGet('./api/top_products.php', params),
    apiGet('./api/expiries.php', params),
    apiGet('./api/adjustments.php', params),
  ]);

  renderSummary(summary);
  renderTrends(trends);
  renderTop(top);
  renderExpiries(expiries);
  renderAdjustments(adjustments);
}

function initDates(){
  const preset = document.getElementById('range_preset').value;
  const rng = getPresetRange(preset);
  const startEl = document.getElementById('start_date');
  const endEl = document.getElementById('end_date');

  if (rng){
    startEl.value = toISODate(rng.start);
    endEl.value = toISODate(rng.end);
    startEl.disabled = true;
    endEl.disabled = true;
  } else {
    startEl.disabled = false;
    endEl.disabled = false;
    if (!startEl.value || !endEl.value){
      const fallback = getPresetRange('30d');
      startEl.value = toISODate(fallback.start);
      endEl.value = toISODate(fallback.end);
    }
  }
}

document.getElementById('range_preset').addEventListener('change', () => {
  initDates();
});

document.getElementById('btn_apply').addEventListener('click', async () => {
  try{
    await refresh();
  }catch(err){
    alert(err.message || 'Errore');
  }
});

(function boot(){
  initDates();
  refresh().catch(err => alert(err.message || 'Errore'));
})();
