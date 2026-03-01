/**
 * Analytics Tab (UI integrated)
 * - Standalone module: does not touch legacy codepaths.
 * - Uses existing Chart.js include from index.html
 */
(function () {
  'use strict';

  const API_BASE = 'analytics/api';

  // Charts (kept private to avoid clashing with dashboard.js globals)
  let chartTrends = null;
  let chartTopProducts = null;
  let chartAdjustments = null;

  // Elements (lazy)
  const els = {};

  function $(id){ return document.getElementById(id); }

  function fmtISODate(d){
    const pad = (n) => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function parseISODate(s){
    // yyyy-mm-dd
    if(!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y,m,dd] = s.split('-').map(Number);
    const dt = new Date(y, m-1, dd);
    // basic sanity
    if(dt.getFullYear()!==y || dt.getMonth()!==m-1 || dt.getDate()!==dd) return null;
    return dt;
  }

  function startOfDay(d){
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x;
  }

  function addDays(d, days){
    const x = new Date(d);
    x.setDate(x.getDate()+days);
    return x;
  }

  function today(){
    return startOfDay(new Date());
  }

  function getPresetRange(preset){
    const t = today();
    if(preset === 'today'){
      return { start: t, end: t };
    }
    if(preset === '7d'){
      return { start: addDays(t, -6), end: t };
    }
    if(preset === '30d'){
      return { start: addDays(t, -29), end: t };
    }
    if(preset === 'month'){
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      const end = t;
      return { start, end };
    }
    return { start: addDays(t, -6), end: t };
  }

  function getFilters(){
    const start = els.a_start.value;
    const end = els.a_end.value;
    const fish_type = (els.a_fish_type.value || '').trim();
    const product_id = (els.a_product_id.value || '').trim();
    const unit = (els.a_unit.value || 'units').trim();

    const params = new URLSearchParams();
    if(start) params.set('start', start);
    if(end) params.set('end', end);
    if(fish_type) params.set('fish_type', fish_type);
    if(product_id) params.set('product_id', product_id);
    if(unit) params.set('unit', unit);
    return params;
  }

  async function fetchJSON(url){
    const res = await fetch(url, { credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    if(!res.ok || !data){
      throw new Error(`HTTP ${res.status}`);
    }
    if(data.ok === false){
      throw new Error(data.error || 'Errore API');
    }
    return data.data ?? data;
  }

  function setLoading(isLoading){
    const panel = els.a_panel;
    if(!panel) return;
    panel.classList.toggle('is-loading', !!isLoading);
    els.a_refresh.disabled = !!isLoading;
  }

  function setError(msg){
    els.a_error.textContent = msg || '';
    els.a_error.style.display = msg ? 'block' : 'none';
  }

  function destroyChart(ch){
    try { if(ch) ch.destroy(); } catch(_) {}
  }

  function ensureCharts(){
    // called after tab markup exists
    const ctxTrends = els.a_chart_trends.getContext('2d');
    const ctxTop = els.a_chart_top.getContext('2d');
    const ctxAdj = els.a_chart_adjust.getContext('2d');

    // (Re)create empty charts so resize works nicely
    destroyChart(chartTrends);
    destroyChart(chartTopProducts);
    destroyChart(chartAdjustments);

    chartTrends = new Chart(ctxTrends, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'Produzione', data: [] },
        { label: 'Vendita', data: [] },
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: { y: { beginAtZero: true } }
      }
    });

    chartTopProducts = new Chart(ctxTop, {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Quantità venduta', data: [] }
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } }
      }
    });

    chartAdjustments = new Chart(ctxAdj, {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Rettifiche OUT', data: [] }
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderSummary(data){
    els.a_kpi_sold.textContent = String(data.total_sold ?? 0);
    els.a_kpi_produced.textContent = String(data.total_produced ?? 0);
    els.a_kpi_adjust_out.textContent = String(data.total_adjust_out ?? 0);
    els.a_kpi_net.textContent = String(data.net_balance ?? 0);
  }

  function renderTrends(rows){
    const labels = [];
    const produced = [];
    const sold = [];
    (rows || []).forEach(r => {
      labels.push(r.day);
      produced.push(Number(r.produced ?? 0));
      sold.push(Number(r.sold ?? 0));
    });
    chartTrends.data.labels = labels;
    chartTrends.data.datasets[0].data = produced;
    chartTrends.data.datasets[1].data = sold;
    chartTrends.update();
  }

  function renderTopProducts(rows){
    const labels = [];
    const values = [];
    (rows || []).forEach(r => {
      labels.push(r.label);
      values.push(Number(r.qty ?? 0));
    });
    chartTopProducts.data.labels = labels;
    chartTopProducts.data.datasets[0].data = values;
    chartTopProducts.update();
  }

  function renderExpiries(data){
    const counts = data.counts || {};
    const meta = data.meta || {};
    const alertDays = Number(meta.alert_days ?? meta.alertDays ?? 7);

    // Compatibilità: l'API può esporre chiavi diverse
    const within3 = (counts.within_3_days ?? counts.within_3 ?? 0);
    const withinAlert = (counts.within_alert_days ?? counts.within_7_days ?? counts.within_7 ?? 0);
    const expired = (counts.expired ?? 0);

    // aggiorna label "Entro Xgg"
    if(els.a_exp_alert_days){
      els.a_exp_alert_days.textContent = String(isFinite(alertDays) ? alertDays : 7);
    }

    els.a_exp_3.textContent = String(within3);
    els.a_exp_7.textContent = String(withinAlert);
    els.a_exp_expired.textContent = String(expired);

    const tbody = els.a_exp_table;
    tbody.innerHTML = '';
    const rows = data.rows || [];
    if(rows.length === 0){
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="muted" colspan="4">Nessun lotto a rischio</td>';
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');

      const expDateStr = (r.expiration_date || r.expiration || '').slice(0,10);
      const daysToExpiry = (typeof r.days_to_expiry === 'number')
        ? r.days_to_expiry
        : computeDaysToExpiry(expDateStr);

      const expClass = (daysToExpiry !== null && daysToExpiry < 0) ? 'badge danger'
        : (daysToExpiry !== null && daysToExpiry <= 7) ? 'badge danger'
        : 'badge warn';
      const expLabel = (daysToExpiry === null) ? '—' : (daysToExpiry < 0 ? 'SCADUTO' : `${daysToExpiry}g`);

      const productLabel = (r.product_label || r.product || '').trim();
      const lotNumber = (r.lot_number || r.lot || r.lotNumber || '').trim();

      tr.innerHTML = `
        <td>${escapeHtml(productLabel)}</td>
        <td><span class="pill">${escapeHtml(lotNumber)}</span></td>
        <td><span class="${expClass}">${escapeHtml(expLabel)}</span> <span class="muted">${escapeHtml(expDateStr)}</span></td>
        <td style="text-align:right;"><strong>${Number(r.stock ?? 0)}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function computeDaysToExpiry(yyyyMmDd){
    if(!yyyyMmDd) return null;
    const parts = yyyyMmDd.split('-').map(Number);
    if(parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
    const [y,m,d] = parts;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const exp = new Date(y, m-1, d);
    const ms = exp.getTime() - today.getTime();
    return Math.floor(ms / 86400000);
  }

  function renderAdjustments(data){
    const rows = data.rows || data.reasons || data.data?.reasons || [];
    const labels = rows.map(r => r.reason || 'SENZA_MOTIVO');
    const values = rows.map(r => Number(r.qty_out ?? 0));
    chartAdjustments.data.labels = labels;
    chartAdjustments.data.datasets[0].data = values;
    chartAdjustments.update();
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  async function loadFiltersOptions(){
    // fish types + products list for the dropdown, using existing endpoints to avoid new logic
    // We keep it resilient: if API fails, UI still works.
    try{
      const res = await fetch('api_products.php?include_archived=0', { credentials: 'same-origin' });
      const js = await res.json();
      const products = (js && js.ok !== false ? (js.data ?? js) : []) || [];

      // products dropdown
      els.a_product_id.innerHTML = '<option value="">Tutti i prodotti</option>';
      products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id ?? p.product_id ?? '';
        const label = [p.name, p.format].filter(Boolean).join(' ');
        opt.textContent = label || `Prodotto #${opt.value}`;
        els.a_product_id.appendChild(opt);
      });

      // fish types (unique)
      const set = new Set();
      products.forEach(p => { if(p.fish_type) set.add(p.fish_type); });
      const types = Array.from(set).sort((a,b)=>String(a).localeCompare(String(b)));
      els.a_fish_type.innerHTML = '<option value="">Tutti i tipi</option>';
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        els.a_fish_type.appendChild(opt);
      });

    } catch(_) {
      // ignore
    }
  }

  async function refresh(){
    setError('');
    setLoading(true);

    try{
      const params = getFilters().toString();
      const qs = params ? `?${params}` : '';

      const [summary, trends, top, expiries, adjustments] = await Promise.all([
        fetchJSON(`${API_BASE}/summary.php${qs}`),
        fetchJSON(`${API_BASE}/trends.php${qs}`),
        fetchJSON(`${API_BASE}/top_products.php${qs}`),
        fetchJSON(`${API_BASE}/expiries.php${qs}`),
        fetchJSON(`${API_BASE}/adjustments.php${qs}`),
      ]);

      renderSummary(summary);
      renderTrends(trends.rows || trends);
      renderTopProducts(top.rows || top);
      renderExpiries(expiries);
      renderAdjustments(adjustments);

    } catch(err){
      setError('Errore nel caricamento Analisi. Controlla la console o riprova.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(preset){
    const { start, end } = getPresetRange(preset);
    els.a_start.value = fmtISODate(start);
    els.a_end.value = fmtISODate(end);
  }

  function hookTabActivation(){
    // Ensure charts resize correctly when tab becomes visible
    const tabBtn = document.querySelector('.tab-btn[data-target="tab_analytics"]');
    if(!tabBtn) return;

    tabBtn.addEventListener('click', () => {
      // small delay so layout is visible before Chart recalculates sizes
      setTimeout(() => {
        try{
          if(!chartTrends) ensureCharts();
          chartTrends?.resize?.();
          chartTopProducts?.resize?.();
          chartAdjustments?.resize?.();
        }catch(_){}
        // first load lazy
        if(!els.__loaded_once){
          els.__loaded_once = true;
          loadFiltersOptions().finally(refresh);
        }
      }, 50);
    });
  }

  function init(){
    // Guard if tab doesn't exist
    const tab = $('tab_analytics');
    if(!tab) return;

    // Cache elements
    Object.assign(els, {
      a_panel: $('analytics_panel'),
      a_error: $('analytics_error'),
      a_start: $('analytics_start'),
      a_end: $('analytics_end'),
      a_preset: $('analytics_preset'),
      a_fish_type: $('analytics_fish_type'),
      a_product_id: $('analytics_product_id'),
      a_unit: $('analytics_unit'),
      a_refresh: $('analytics_refresh'),

      a_kpi_sold: $('analytics_kpi_sold'),
      a_kpi_produced: $('analytics_kpi_produced'),
      a_kpi_adjust_out: $('analytics_kpi_adjust_out'),
      a_kpi_net: $('analytics_kpi_net'),

      a_chart_trends: $('analytics_chart_trends'),
      a_chart_top: $('analytics_chart_top'),
      a_chart_adjust: $('analytics_chart_adjust'),

      a_exp_3: $('analytics_exp_3'),
      a_exp_7: $('analytics_exp_7'),
      a_exp_alert_days: $('analytics_exp_alert_days'),
      a_exp_expired: $('analytics_exp_expired'),
      a_exp_table: $('analytics_exp_table'),
    });

    // Defaults
    applyPreset('7d');
    els.a_preset.value = '7d';

    ensureCharts();
    hookTabActivation();

    // Events
    els.a_preset.addEventListener('change', () => {
      applyPreset(els.a_preset.value);
      refresh();
    });

    const onFilterChange = () => refresh();
    ['change'].forEach(ev => {
      els.a_fish_type.addEventListener(ev, onFilterChange);
      els.a_product_id.addEventListener(ev, onFilterChange);
      els.a_unit.addEventListener(ev, onFilterChange);
    });

    els.a_start.addEventListener('change', () => {
      // validate range
      const s = parseISODate(els.a_start.value);
      const e = parseISODate(els.a_end.value);
      if(s && e && s > e){
        els.a_end.value = els.a_start.value;
      }
      refresh();
    });
    els.a_end.addEventListener('change', () => {
      const s = parseISODate(els.a_start.value);
      const e = parseISODate(els.a_end.value);
      if(s && e && e < s){
        els.a_start.value = els.a_end.value;
      }
      refresh();
    });

    els.a_refresh.addEventListener('click', refresh);

    // load options + initial refresh ONLY when user opens tab (to avoid impacting initial load of dashboard)

    // If analytics tab is already active on load (restored from localStorage), load immediately
    if(tab.classList.contains('active')){
      els.__loaded_once = true;
      loadFiltersOptions().finally(refresh);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
