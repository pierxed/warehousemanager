// ---------- DASHBOARD ----------
let salesChart = null;
let SHOW_ARCHIVED_PRODUCTS = false;

function isMobile(){
  return window.matchMedia("(max-width: 680px)").matches;
}

function renderMobileRows(tbody, rows){
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;">${r.title}</div>
            <div style="color:#64748b;font-size:13px;margin-top:4px;display:grid;gap:2px;">
              ${r.lines.map(x => `<div>${x}</div>`).join("")}
            </div>
          </div>
          <div style="font-weight:900;white-space:nowrap;">${r.right ?? ""}</div>
        </div>
      </td>
    </tr>
  `).join("") || `<tr><td class="muted" style="padding:12px 14px;">Nessuna</td></tr>`;
}

async function loadHomeDashboard(){

  const lots = await fetchJSON('api_lots.php');
  const movements = await fetchJSON('api_movements.php');
  const today = new Date();

  const stockByLot = new Map();

  for(const m of movements){
    const lotId = Number(m.lot_id);
    if(!lotId) continue;

    const qty = Number(m.quantity) || 0;
    const prev = stockByLot.get(lotId) || 0;

    if(m.type === 'PRODUCTION') stockByLot.set(lotId, prev + qty);
    else if(m.type === 'SALE') stockByLot.set(lotId, prev - qty);
    else if(m.type === 'ADJUSTMENT') stockByLot.set(lotId, prev + qty);
  }

  const lotsWithStock = lots.map(l => ({
    ...l,
    stock: stockByLot.get(Number(l.lot_id)) || 0
  }));

  const totalStock = lotsWithStock.reduce((s,l)=> s + Math.max(0, Number(l.stock)||0), 0);
  document.getElementById('card_total_stock').innerText = totalStock;

  // ---------- TAB STOCK ----------
  const stockBody = document.querySelector('#stock_table tbody');
  if(stockBody){
    stockBody.innerHTML = '';

    const stockByProduct = new Map();

    for(const l of lotsWithStock){
      const pid = Number(l.product_id);
      const prev = stockByProduct.get(pid) || 0;
      stockByProduct.set(pid, prev + (Number(l.stock)||0));
    }

    const productsMap = new Map();
    for(const l of lotsWithStock){
      productsMap.set(Number(l.product_id), {
        fish_type: l.fish_type,
        name: l.product_name,
        format: l.format,
        ean: l.ean
      });
    }

    [...productsMap.entries()].forEach(([pid, info])=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${info.fish_type}</td>
        <td>${info.name}</td>
        <td>${info.format}</td>
        <td>${info.ean}</td>
        <td>${stockByProduct.get(pid) || 0}</td>
      `;
      stockBody.appendChild(tr);
    });
  }

  // ---------- TAB LOTTI ----------
  const lotsBody = document.querySelector('#lots_table tbody');
  if(lotsBody){
    lotsBody.innerHTML = '';

    lotsWithStock
      .sort((a,b)=> new Date(a.expiration_date) - new Date(b.expiration_date))
      .forEach(l=>{

        const diffDays = Math.ceil((new Date(l.expiration_date) - today)/(1000*60*60*24));

        let bg = '';
        if(diffDays<=30) bg='#e84118';
        else if(diffDays<=90) bg='#fbc531';
        else bg='#44bd32';

        const tr = document.createElement('tr');
        tr.style.backgroundColor = bg;
        tr.style.color = 'white';

        tr.innerHTML = `
          <td>${l.fish_type}</td>
          <td>${l.product_name}</td>
          <td>${l.format}</td>
          <td>${l.ean}</td>
          <td>${l.lot_number}</td>
          <td>${l.stock}</td>
          <td>${formatDateIT(l.production_date)}</td>
          <td>${formatDateIT(l.expiration_date)}</td>
        `;

        lotsBody.appendChild(tr);
      });
  }

  const totalTodayProduction = movements
    .filter(m => m.type === 'PRODUCTION' && isSameLocalDay(m.created_at, today))
    .reduce((s,m)=> s + (Number(m.quantity)||0), 0);

  document.getElementById('card_today_production').innerText = totalTodayProduction;

  const expiringLots = lotsWithStock.filter(l=>{
    const diffDays = Math.ceil((new Date(l.expiration_date) - today)/(1000*60*60*24));
    return diffDays <= 30 && (Number(l.stock)||0) > 0;
  });

  document.getElementById('card_expiring').innerText = expiringLots.length;

  const tb7 = document.getElementById('expiry_7_table');
  const tb30 = document.getElementById('expiry_30_table');

  if(tb7 && tb30){
    tb7.innerHTML = '';
    tb30.innerHTML = '';

    const inDays = (d) => Math.ceil((new Date(d) - today) / (1000*60*60*24));

    const exp7 = [];
    const exp30 = [];

    expiringLots
      .sort((a,b)=> new Date(a.expiration_date) - new Date(b.expiration_date))
      .forEach(l=>{
        const days = inDays(l.expiration_date);

        if(days >= 0 && days <= 7) exp7.push(l);
        else if(days >= 8 && days <= 30) exp30.push(l);
      });

    if(isMobile()){
      renderMobileRows(tb7, exp7.slice(0,8).map(l => ({
        title: l.product_name,
        lines: [
          `Lotto: <strong>${l.lot_number}</strong>`,
          `Scadenza: <strong>${formatDateIT(l.expiration_date)}</strong>`
        ],
        right: `${l.stock}`
      })));

      renderMobileRows(tb30, exp30.slice(0,8).map(l => ({
        title: l.product_name,
        lines: [
          `Lotto: <strong>${l.lot_number}</strong>`,
          `Scadenza: <strong>${formatDateIT(l.expiration_date)}</strong>`
        ],
        right: `${l.stock}`
      })));
    } else {
      tb7.innerHTML = exp7.slice(0,8).map(l => `
        <tr>
          <td>${l.product_name}</td>
          <td>${l.lot_number}</td>
          <td>${l.stock}</td>
          <td>${formatDateIT(l.expiration_date)}</td>
        </tr>
      `).join('') || `<tr><td colspan="4" class="muted">Nessuna</td></tr>`;

      tb30.innerHTML = exp30.slice(0,8).map(l => `
        <tr>
          <td>${l.product_name}</td>
          <td>${l.lot_number}</td>
          <td>${l.stock}</td>
          <td>${formatDateIT(l.expiration_date)}</td>
        </tr>
      `).join('') || `<tr><td colspan="4" class="muted">Nessuna</td></tr>`;
    }
  }

 // ---- HOME: ultimi movimenti (10) ----
const movesTb = document.getElementById('last_moves_table');
if(movesTb){
  movesTb.innerHTML = '';

  const lotById = new Map(lotsWithStock.map(l => [Number(l.lot_id), l]));

  const sortedMoves = [...movements].sort((a,b)=>{
    const da = new Date((a.created_at||'').replace(' ', 'T'));
    const db = new Date((b.created_at||'').replace(' ', 'T'));
    return db - da;
  }).slice(0, 10);

  const typeLabel = (t) =>
    t === 'SALE' ? 'Vendita' :
    (t === 'PRODUCTION' ? 'Produzione' :
    (t === 'ADJUSTMENT' ? 'Rettifica' : t));

  if(isMobile()){
      renderMobileRows(movesTb, sortedMoves.map(m => {

      const lot = lotById.get(Number(m.lot_id)) || null;

      const typeClass =
        m.type === 'SALE'
          ? 'sale'
          : (m.type === 'PRODUCTION' ? 'production' : (m.type === 'ADJUSTMENT' ? 'adjustment' : ''));

      const expiration = lot?.expiration_date
        ? formatDateIT(lot.expiration_date)
        : '—';

      const qty = Number(m.quantity)||0;
      const qtyDisplay =
        m.type === 'SALE'
          ? `−${Math.abs(qty)}`
          : (m.type === 'ADJUSTMENT'
              ? (qty < 0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`)
              : `+${Math.abs(qty)}`);

      const reasonTxt = (m.type === 'ADJUSTMENT' && m.reason)
        ? `Motivo: <strong>${String(m.reason).replaceAll('_',' ')}</strong>`
        : null;

      return {
        title: `${lot?.product_name || '—'} ${lot?.format ? '• ' + lot.format : ''}`,
        lines: [
          `<span class="badge-move ${typeClass}">
            ${typeLabel(m.type)}
          </span> • <strong>${formatDateIT(m.created_at)}</strong>`,

          `Lotto: <strong>${lot?.lot_number || '—'}</strong>`,

          `Scadenza: <strong>${expiration}</strong>`,

          ...(reasonTxt ? [reasonTxt] : []),

          ...(m.type === 'ADJUSTMENT' && m.note ? [`Nota: ${escapeHtml(String(m.note))}`] : [])
        ],
        right: qtyDisplay
      };
    }));
  } else {
sortedMoves.forEach(m=>{
  const lot = lotById.get(Number(m.lot_id)) || null;

  const typeClass =
    m.type === 'SALE'
      ? 'sale'
      : (m.type === 'PRODUCTION' ? 'production' : (m.type === 'ADJUSTMENT' ? 'adjustment' : ''));

  const typeText = typeLabel(m.type);

  const expiration = lot?.expiration_date
    ? formatDateIT(lot.expiration_date)
    : '—';

  const qty = Number(m.quantity)||0;
  const qtyDisplay =
    m.type === 'SALE'
      ? `−${Math.abs(qty)}`
      : (m.type === 'ADJUSTMENT'
          ? (qty < 0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`)
          : `+${Math.abs(qty)}`);

  const reasonCell = (m.type === 'ADJUSTMENT')
    ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">
         ${m.reason ? `Motivo: <strong>${escapeHtml(String(m.reason).replaceAll('_',' '))}</strong>` : ''}
         ${m.note ? `<div>Nota: ${escapeHtml(String(m.note))}</div>` : ''}
       </div>`
    : '';

  const tr = document.createElement('tr');
  tr.className = `move-row ${typeClass}`;

  tr.innerHTML = `
  <td>${formatDateIT(m.created_at)}</td>

  <td>
    <span class="badge-move ${typeClass}">
      ${typeText}
    </span>
  </td>

  <td>
  <div style="font-weight:700;">
    ${lot?.product_name || '—'}
  </div>
  <div style="font-size:12px;color:#94a3b8;">
    ${lot?.format || ''}
  </div>
  ${reasonCell}
</td>

  <td><strong>${lot?.lot_number || '—'}</strong></td>

  <td>${expiration}</td>

  <td style="font-weight:900;">${qtyDisplay}</td>
`;

  movesTb.appendChild(tr);
});

    if(sortedMoves.length === 0){
      movesTb.innerHTML = `<tr><td colspan="6" class="muted">Nessun movimento</td></tr>`;
    }
  }
}

  const salesEl = document.getElementById('salesChart');
  if(salesEl){
    const lotById = new Map(lotsWithStock.map(l => [Number(l.lot_id), l]));

    const from = new Date(today);
    from.setDate(from.getDate() - 30);

    const soldByProduct = new Map();

    movements.forEach(m=>{
      if(m.type !== 'SALE') return;

      const d = new Date((m.created_at||'').replace(' ', 'T'));
      if(isNaN(d) || d < from) return;

      const lot = lotById.get(Number(m.lot_id)) || null;
      const productName = lot?.product_name || 'Sconosciuto';

      const qty = Number(m.quantity)||0;
      soldByProduct.set(productName, (soldByProduct.get(productName)||0) + qty);
    });

    const top = [...soldByProduct.entries()]
      .sort((a,b)=> b[1]-a[1])
      .slice(0, 10);

    const labels = top.map(x=> x[0]);
    const data = top.map(x=> x[1]);

    if(salesChart) salesChart.destroy();

    salesChart = new Chart(salesEl, {
      type: 'bar',
      data:{
        labels,
        datasets:[{ label:'Barattoli venduti', data }]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        scales:{ y:{ beginAtZero:true } }
      }
    });
  }

  showExpiryToasts(expiringLots);
}

function showExpiryToasts(expiringLots){
  const container = document.getElementById('expiry_toasts');
  if(!container) return;
  container.innerHTML = '';

  expiringLots.slice(0, 6).forEach(l=>{
    const today = new Date();
    const diffDays = Math.ceil((new Date(l.expiration_date)-today)/(1000*60*60*24));

    const div = document.createElement('div');
    div.className = 'expiry_toast';
    div.innerText =
      `⚠ Lotto ${l.lot_number} (${l.product_name}) scade il ${formatDateIT(l.expiration_date)} (${diffDays} giorni)!`;

    container.appendChild(div);

    setTimeout(()=>{
      div.style.animation='slideOut 0.5s forwards';
      setTimeout(()=>div.remove(),500);
    },6000);
  });
}

// ---------- UTILS ----------
function lockLotFields(){
  const lot = document.getElementById('lot_number');
  const exp = document.getElementById('expiration_date');

  lot.disabled = true;
  exp.disabled = true;

  lot.value = '';
  exp.value = '';

  lot.style.background = '#eee';
  exp.style.background = '#eee';
}

function unlockLotFields(){
  const lot = document.getElementById('lot_number');
  const exp = document.getElementById('expiration_date');

  lot.disabled = false;
  exp.disabled = false;

  lot.style.background = '';
  exp.style.background = '';
}

function formatDateIT(dateString){
  if(!dateString) return '';
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function isSameLocalDay(mysqlDateTime, today = new Date()){
  if(!mysqlDateTime) return false;
  const d = new Date(mysqlDateTime.replace(' ', 'T'));
  return d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
}

async function fetchJSON(url, options){
  const res = await fetch(url, options);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e){ throw new Error(`Risposta non JSON da ${url}: ${text.slice(0,200)}`); }
}

async function fetchProductByEAN(ean){
  return await fetchJSON('api_get_product.php?ean=' + encodeURIComponent(ean));
}

// ---------- PRODUCTS DROPDOWN ----------
let PRODUCTS = [];

function extractWeight(format){
  if(!format) return 0;
  const match = format.match(/(\d+)/);
  return match ? parseInt(match[1],10) : 0;
}

async function loadProducts() {

PRODUCTS = await fetchJSON('api_products.php');
PRODUCTS = PRODUCTS || [];

  const productNames = [...new Set(PRODUCTS.map(p => p.name))]
    .sort((a,b)=> a.localeCompare(b));

  // ----- PRODUZIONE: clona select per evitare listener duplicati -----
  const nameSelect0 = document.getElementById('product_name_select');
  const formatSelect0 = document.getElementById('prod_select');
  const info = document.getElementById('prod_info');

  if(!nameSelect0 || !formatSelect0) return;

  const nameSelect = nameSelect0.cloneNode(true);
  nameSelect0.parentNode.replaceChild(nameSelect, nameSelect0);

  const formatSelect = formatSelect0.cloneNode(true);
  formatSelect0.parentNode.replaceChild(formatSelect, formatSelect0);

  nameSelect.innerHTML = `<option value="">-- Seleziona prodotto --</option>`;
  productNames.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    nameSelect.appendChild(opt);
  });

  nameSelect.addEventListener('change', ()=>{
    const selectedName = nameSelect.value;

    formatSelect.innerHTML = `<option value="">-- Seleziona formato --</option>`;
    info.textContent = '';
    document.getElementById('prod_ean').value = '';

    if(!selectedName) return;

    const filtered = PRODUCTS
      .filter(p => p.name === selectedName)
      .sort((a,b)=> extractWeight(a.format) - extractWeight(b.format));

    filtered.forEach(p=>{
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.format} - ${p.units_per_tray} per vassoio`;
      opt.dataset.units = p.units_per_tray;
      opt.dataset.ean = p.ean;
      formatSelect.appendChild(opt);
    });
  });

  formatSelect.addEventListener('change', async ()=>{
    const opt = formatSelect.options[formatSelect.selectedIndex];

    if(!opt || !opt.value){
      lockLotFields();
      return;
    }

    document.getElementById('prod_ean').value = opt.dataset.ean || '';
    document.getElementById('prod_info').textContent = `Unità per vassoio: ${opt.dataset.units}`;

    unlockLotFields();
    await refreshTodayBatches();
  });

  // ----- VENDITA: popola select nome + formato -----
  (function initSaleSelectors(){
    const ns0 = document.getElementById('sale_product_name_select');
    const fs0 = document.getElementById('sale_prod_select');
    if(!ns0 || !fs0) return;

    const ns = ns0.cloneNode(true);
    ns0.parentNode.replaceChild(ns, ns0);

    const fs = fs0.cloneNode(true);
    fs0.parentNode.replaceChild(fs, fs0);

    ns.innerHTML = `<option value="">-- Seleziona prodotto --</option>`;
    productNames.forEach(name=>{
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      ns.appendChild(opt);
    });

    ns.addEventListener('change', ()=>{
      const selectedName = ns.value;
      fs.innerHTML = `<option value="">-- Seleziona formato --</option>`;
      if(!selectedName) return;

      const filtered = PRODUCTS
        .filter(p => p.name === selectedName)
        .sort((a,b)=> extractWeight(a.format) - extractWeight(b.format));

      filtered.forEach(p=>{
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.format} - ${p.units_per_tray} per vassoio`;
        opt.dataset.ean = p.ean || '';
        fs.appendChild(opt);
      });
    });

    fs.addEventListener('change', ()=>{
      const opt = fs.options[fs.selectedIndex];
      if(!opt || !opt.value) return;
      const barcode = document.getElementById('barcode');
      if (barcode && opt.dataset.ean) barcode.value = opt.dataset.ean;
    });
  })();
}

// ---------- LOT MANAGEMENT ----------
async function checkBatchWarning(lotNumber){

  const warningDiv = document.getElementById('lot_warning');
  const expirationInput = document.getElementById('expiration_date');
  const formatSelect = document.getElementById('prod_select');

  warningDiv.innerHTML = '';

  if(!lotNumber){
    return;
  }

  if(!formatSelect.value){
    warningDiv.innerHTML = `
      <div class="message" style="background:#e3f2fd;color:#0d47a1;">
        ℹ Seleziona prima prodotto e formato.
      </div>
    `;
    return;
  }

  const selectedProduct = PRODUCTS.find(p => p.id == formatSelect.value);
  if(!selectedProduct) return;

  const selectedFishType = selectedProduct.fish_type;

  const data = await fetchJSON(
    'api_check_batch.php?lot_number=' + encodeURIComponent(lotNumber)
  );

  if(data.exists){

    if(data.fish_type !== selectedFishType){

      warningDiv.innerHTML = `
        <div class="message error">
          ⚠ Questo lotto appartiene a ${data.fish_type}.
          Non puoi usarlo per ${selectedFishType}.
        </div>
      `;

      expirationInput.value = '';
      expirationInput.readOnly = true;
      expirationInput.style.background = '#eee';

      return;
    }

    warningDiv.innerHTML = `
      <div class="message success">
        ✔ Lotto esistente (${data.fish_type}) creato il ${formatDateIT(data.production_date)}
      </div>
    `;

    expirationInput.value = data.expiration_date;
    expirationInput.readOnly = true;
    expirationInput.style.background = '#eee';

  } else {

    warningDiv.innerHTML = `
      <div class="message" style="background:#e3f2fd;color:#0d47a1;">
        ℹ Lotto nuovo. Inserisci la scadenza.
      </div>
    `;

    expirationInput.readOnly = false;
    expirationInput.style.background = '';
  }
}

async function refreshTodayBatches(){

  const dl = document.getElementById('lot_suggestions');
  const quick = document.getElementById('lot_quick');
  const formatSelect = document.getElementById('prod_select');

  if(!dl || !formatSelect.value) return;

  const selectedProduct = PRODUCTS.find(p => p.id == formatSelect.value);
  if(!selectedProduct) return;

  const selectedFishType = selectedProduct.fish_type;

  const rows = await fetchJSON('api_batches_today.php');

  const filtered = rows.filter(r => r.fish_type === selectedFishType);

  dl.innerHTML = '';
  quick.innerHTML = '';

  filtered.forEach(r=>{
    const opt = document.createElement('option');
    opt.value = r.lot_number;
    dl.appendChild(opt);
  });

  filtered.slice(0,12).forEach(r=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lot-chip';
    b.textContent = r.lot_number;

    b.addEventListener('click', async ()=>{
      const lotInput = document.getElementById('lot_number');
      if(!lotInput) return;

      lotInput.value = r.lot_number;
      await checkBatchWarning(r.lot_number);
    });

    quick.appendChild(b);
  });

  if(filtered.length === 0){
    quick.innerHTML = `<span style="color:#777;">Nessun lotto recente per questo tipo di pesce.</span>`;
  }
}

document.getElementById('lot_number')?.addEventListener('focus', refreshTodayBatches);

// ---------- PRODUZIONE ----------
document.getElementById('btn_production')?.addEventListener('click', async ()=>{

  const msg = document.getElementById('prod_message');
  msg.className = 'message';
  msg.textContent = '';

  const ean = document.getElementById('prod_ean').value.trim();
  const lot_number = document.getElementById('lot_number').value.trim();
  const expiration_date = document.getElementById('expiration_date').value;

  const quantityType = document.getElementById('quantity_type').value;
  const quantityInput = parseInt(document.getElementById('quantity_input').value, 10);

  if(!lot_number || !expiration_date || !quantityInput || quantityInput <= 0){
    msg.classList.add('error');
    msg.textContent = 'Compila lotto, scadenza e quantità.';
    return;
  }

  try{
    let product_id = null;

    if(ean){
      const product = await fetchProductByEAN(ean);
      if(product.error){
        msg.classList.add('error');
        msg.textContent = product.error;
        return;
      }
      product_id = product.id;
    } else {
      const sel = document.getElementById('prod_select');
      product_id = parseInt(sel.value, 10);

      if(!product_id){
        msg.classList.add('error');
        msg.textContent = 'Seleziona prima prodotto e formato.';
        return;
      }
    }

    const data = await fetchJSON('api_production.php',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        product_id,
        quantity_input: quantityInput,
        quantity_type: quantityType,
        lot_number,
        expiration_date
      })
    });

    if(data.error){
      msg.classList.add('error');
      msg.textContent = data.error;
      return;
    }

    msg.classList.add('success');
    msg.textContent = data.batch_reused
      ? `+${data.quantity} barattoli aggiunti al lotto ${data.lot_number}`
      : `Nuovo lotto ${data.lot_number} creato — ${data.quantity} barattoli prodotti`;

    await loadHomeDashboard();
    await loadProductsTable();

  }catch(err){
    console.error(err);
    msg.classList.add('error');
    msg.textContent = 'Errore produzione.';
  }
});

// ---------- VENDITA ----------
// ---------- VENDITA ----------
const SaleUI = (() => {
  let currentProduct = null;
  let suggestedLots = [];
  let selectedLots = new Map();

  const el = (id) => document.getElementById(id);
  const getQty = () => parseInt(el('sale_qty')?.value, 10) || 1;
  const isManual = () => !!el('sale_manual_toggle')?.checked;

  const setMsg = (type, text) => {
    const msg = el('sale_message');
    if (!msg) return;
    msg.className = 'message';
    msg.textContent = '';
    if(type) msg.classList.add(type);
    msg.textContent = text;
  };

  const ensureConfirmBox = () => {
    if (el('sale_confirm_box')) return;

    const btn = el('btn_sale');
    if(!btn) return;

    const card = btn.closest('.card') || btn.parentElement;
    if(!card) return;

    const box = document.createElement('div');
    box.id = 'sale_confirm_box';
    box.style.marginTop = '12px';
    card.appendChild(box);
  };

  const clearConfirmBox = () => {
    const box = el('sale_confirm_box');
    if(box) box.innerHTML = '';
  };

  const renderConfirmBox = ({ title, subtitle, planLines, onConfirm, onCancel }) => {
    ensureConfirmBox();
    const box = el('sale_confirm_box');
    if(!box) return;

    box.innerHTML = `
      <div style="
        border:1px solid rgba(255,255,255,.12);
        border-radius:14px;
        padding:12px;
        background:rgba(255,255,255,.04);
      ">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <div style="font-weight:900;">${title}</div>
            <div class="muted" style="margin-top:4px;">${subtitle || ''}</div>
          </div>
          <button type="button" id="sale_confirm_close" class="btn-secondary"
            style="border-radius:999px;padding:6px 10px;">✕</button>
        </div>

        <div style="margin-top:10px; display:grid; gap:6px;">
          ${(planLines || []).map(t => `
            <div style="
              padding:10px 12px;
              border-radius:12px;
              background:rgba(255,255,255,.06);
              border:1px solid rgba(255,255,255,.10);
            ">${t}</div>
          `).join('')}
        </div>

        <div style="display:flex; gap:10px; margin-top:12px;">
          <button type="button" id="sale_confirm_btn" class="btn-primary"
            style="flex:1; border-radius:12px;">Conferma vendita</button>
          <button type="button" id="sale_cancel_btn" class="btn-secondary"
            style="border-radius:12px;">Annulla</button>
        </div>
      </div>
    `;

    box.querySelector('#sale_confirm_btn')?.addEventListener('click', onConfirm);
    box.querySelector('#sale_cancel_btn')?.addEventListener('click', () => {
      clearConfirmBox();
      onCancel?.();
    });
    box.querySelector('#sale_confirm_close')?.addEventListener('click', () => {
      clearConfirmBox();
      onCancel?.();
    });
  };

  const selectedSum = () => {
    let s = 0;
    selectedLots.forEach(v => s += Number(v || 0));
    return s;
  };

  const remainingNeeded = () => Math.max(0, getQty() - selectedSum());

  const resetManualUI = () => {
    selectedLots.clear();
    if (el('sale_lot_chips')) el('sale_lot_chips').innerHTML = '';
    if (el('sale_selected_chips')) el('sale_selected_chips').innerHTML = '';
    if (el('sale_manual_status')) el('sale_manual_status').textContent = '';
  };

  const resetAllUI = () => {
    suggestedLots = [];
    resetManualUI();
    if (el('sale_plan_hint')) el('sale_plan_hint').textContent = '';
    clearConfirmBox();
  };

  const renderManualStatus = () => {
    const st = el('sale_manual_status');
    if (!st) return;

    const need = remainingNeeded();
    if (need === 0) st.textContent = '✅ OK: quantità completa. Ora premi “Registra Vendita”.';
    else st.textContent = `⏳ Mancano ${need}. Seleziona altri lotti.`;
  };

  // ------- CHIP UI (manuale) -------
  const chipStyle = `
    display:inline-flex;align-items:center;gap:8px;
    padding:8px 12px;border-radius:999px;
    border:1px solid rgba(255,255,255,0.12);
    background:rgba(255,255,255,0.06);
    cursor:pointer;user-select:none;
  `;
  const pillStyle = `
    padding:2px 8px;border-radius:999px;font-size:12px;
    background:rgba(0,0,0,0.18);
    border:1px solid rgba(255,255,255,0.10);
  `;
  const btnMini = `
    width:26px;height:26px;border-radius:999px;
    border:1px solid rgba(255,255,255,0.12);
    background:rgba(255,255,255,0.06);
    cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  `;

  const renderSuggestedChips = () => {
    const box = el('sale_lot_chips');
    if (!box) return;

    box.innerHTML = '';
    box.style.display = 'flex';
    box.style.flexWrap = 'wrap';
    box.style.gap = '8px';

    if (!suggestedLots.length) {
      const span = document.createElement('div');
      span.className = 'muted';
      span.textContent = 'Nessun lotto disponibile.';
      box.appendChild(span);
      return;
    }

    suggestedLots.forEach(l => {
      const available = Number(l.stock || 0);
      const already = Number(selectedLots.get(l.lot_id) || 0);
      const canAdd = Math.max(0, available - already);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.style.cssText = chipStyle + (canAdd <= 0 ? 'opacity:.45;cursor:not-allowed;' : '');

      const expTxt = l.expiration_date ? `Scad. ${formatDateIT(l.expiration_date)}` : 'Scad. —';
      chip.innerHTML = `
        <strong>${l.lot_number ?? ('lot#'+l.lot_id)}</strong>
        <span style="${pillStyle}">${available} disp.</span>
        <span style="font-size:12px;color:#94a3b8;">${expTxt}</span>
      `;

      chip.onclick = () => {
        if (canAdd <= 0) return;
        const need = remainingNeeded();
        if (need <= 0) return;

        const add = Math.min(canAdd, need);
        selectedLots.set(l.lot_id, already + add);

        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      };

      box.appendChild(chip);
    });
  };

  const renderSelectedChips = () => {
    const box = el('sale_selected_chips');
    if (!box) return;

    box.innerHTML = '';
    box.style.display = 'flex';
    box.style.flexWrap = 'wrap';
    box.style.gap = '8px';

    if (selectedLots.size === 0) {
      const span = document.createElement('div');
      span.className = 'muted';
      span.textContent = 'Nessun lotto selezionato.';
      box.appendChild(span);
      return;
    }

    selectedLots.forEach((qty, lot_id) => {
      const lot = suggestedLots.find(x => Number(x.lot_id) === Number(lot_id));
      const name = lot?.lot_number ?? ('lot#' + lot_id);
      const maxStock = Number(lot?.stock ?? qty);

      const chip = document.createElement('div');
      chip.style.cssText = chipStyle + 'cursor:default;background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.25);';

      const left = document.createElement('span');
      left.innerHTML = `<strong>${name}</strong> <span style="${pillStyle}">${qty}</span>`;

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';
      actions.style.marginLeft = '6px';

      const mkBtn = (txt, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = btnMini;
        b.textContent = txt;
        b.onclick = onClick;
        return b;
      };

      actions.appendChild(mkBtn('−', () => {
        const v = Number(selectedLots.get(lot_id) || 0);
        if (v <= 1) selectedLots.delete(lot_id);
        else selectedLots.set(lot_id, v - 1);
        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      }));

      actions.appendChild(mkBtn('+', () => {
        const need = remainingNeeded();
        if (need <= 0) return;
        const v = Number(selectedLots.get(lot_id) || 0);
        if (v >= maxStock) return;
        selectedLots.set(lot_id, v + 1);
        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      }));

      actions.appendChild(mkBtn('×', () => {
        selectedLots.delete(lot_id);
        renderSuggestedChips();
        renderSelectedChips();
        renderManualStatus();
      }));

      chip.appendChild(left);
      chip.appendChild(actions);
      box.appendChild(chip);
    });
  };

  // ------- API -------
  const fetchSuggestedLots = async (product_id) => {
    const quantity = getQty();
    const res = await fetchJSON('api_sale_preview_v2.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'auto', product_id, quantity })
    });

    suggestedLots = res.suggested_lots || [];
  };

  const buildManualLotsPayload = () => {
    const lots = [];
    selectedLots.forEach((qty, lot_id) => {
      lots.push({ lot_id: Number(lot_id), qty: Number(qty) });
    });
    return lots;
  };

  const resolveProductForSale = async () => {
    const fs = document.getElementById('sale_prod_select');
    const selectedProductId = Number(fs?.value || 0);

    if (selectedProductId > 0) {
      const p = (PRODUCTS || []).find(x => Number(x.id) === selectedProductId) || null;
      if (!p) return { error: 'Prodotto selezionato non valido' };
      return p;
    }

    const code = el('barcode')?.value.trim() || '';
    if (!code) return { error: 'Seleziona prodotto/formato o inserisci EAN' };

    return await fetchProductByEAN(code);
  };

  const humanPlanLines = (plan=[]) => {
    return plan.map(x => {
      const qty = Number(x.qty ?? x.taken ?? 0);
      const lot = x.lot_number ?? ('lot#'+x.lot_id);
      const exp = x.expiration_date ? ` • scad ${formatDateIT(x.expiration_date)}` : '';
      return `Lotto <strong>${lot}</strong>${exp}: <strong>-${qty}</strong> barattoli`;
    });
  };

  // -------- AUTO (2 step) --------
  const doAuto = async () => {
    const quantity = getQty();

    const preview = await fetchJSON('api_sale_preview_v2.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'auto', product_id: currentProduct.id, quantity })
    });

    if (preview.success === false) {
      clearConfirmBox();
      setMsg('error', preview.error || 'Stock insufficiente');
      return;
    }

    const productLabel =
      `${currentProduct.name || ('Prodotto #' + currentProduct.id)}${currentProduct.format ? ` (${currentProduct.format})` : ''}`;

    const lines = humanPlanLines(preview.plan || []);
    if (el('sale_plan_hint')) el('sale_plan_hint').textContent = `Scarico automatico: ${lines.length} lotto/i`;

    renderConfirmBox({
      title: `Stai per vendere ${quantity} barattoli`,
      subtitle: `Prodotto: ${productLabel}. Conferma per registrare la vendita.`,
      planLines: lines,
      onConfirm: async () => {
        const commit = await fetchJSON('api_sale_commit_v2.php', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ mode:'auto', product_id: currentProduct.id, quantity })
        });

        if (commit?.success === false || commit?.error) {
          setMsg('error', commit.available != null
            ? `Stock insufficiente: disponibili ${commit.available}. Riprova.`
            : (commit.detail ? `${commit.error}: ${commit.detail}` : (commit.error || 'Errore vendita')));
          return;
        }

        clearConfirmBox();
        setMsg('success', `✅ Vendita registrata: ${commit.sold} barattoli. Scaricato da: ${lines.map(l=>l.replace(/<[^>]*>/g,'')).join(' | ')}`);

        el('barcode').value = '';
        el('sale_qty').value = 1;
        resetAllUI();

        await loadHomeDashboard();
        await loadProductsTable();
      },
      onCancel: () => setMsg('muted', 'Operazione annullata.')
    });
  };

  // -------- MANUAL (2 step + chip) --------
  const doManual = async () => {
    const quantity = getQty();

    if (selectedSum() !== quantity) {
      renderManualStatus();
      setMsg('error', `In manuale devi coprire tutta la quantità (${quantity}).`);
      return;
    }

    const lots = buildManualLotsPayload();

    const preview = await fetchJSON('api_sale_preview_v2.php', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ mode:'manual', product_id: currentProduct.id, quantity, lots })
    });

    if (preview.success === false) {
      setMsg('error', preview.error || 'Errore preview manuale');
      return;
    }

    const planLines = lots.map(x => {
      const lot = suggestedLots.find(s => Number(s.lot_id) === Number(x.lot_id));
      const lotLabel = lot?.lot_number ?? ('lot#'+x.lot_id);
      const exp = lot?.expiration_date ? ` • scad ${formatDateIT(lot.expiration_date)}` : '';
      return `Lotto <strong>${lotLabel}</strong>${exp}: <strong>-${x.qty}</strong> barattoli`;
    });

    renderConfirmBox({
      title: `Conferma vendita manuale (${quantity})`,
      subtitle: `Prodotto: ${currentProduct.name || ('Prodotto #' + currentProduct.id)}`,
      planLines,
      onConfirm: async () => {
        const commit = await fetchJSON('api_sale_commit_v2.php', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ mode:'manual', product_id: currentProduct.id, quantity, lots })
        });

        if (commit.success === false || commit.error) {
          setMsg('error', commit.available != null
            ? `Stock insufficiente: disponibili ${commit.available}.`
            : (commit.detail ? `${commit.error}: ${commit.detail}` : (commit.error || 'Errore')));
          return;
        }

        clearConfirmBox();
        setMsg('success', `✅ Vendita manuale registrata: ${commit.sold} barattoli.`);

        el('barcode').value = '';
        el('sale_qty').value = 1;
        resetAllUI();

        await loadHomeDashboard();
        await loadProductsTable();
      },
      onCancel: () => setMsg('muted', 'Operazione annullata.')
    });
  };

  const openManualBoxAndLoadLots = async () => {
    const manualBox = el('sale_manual_box');
    if (manualBox) manualBox.style.display = 'block';

    if (!currentProduct?.id) return;

    await fetchSuggestedLots(currentProduct.id);
    renderSuggestedChips();
    renderSelectedChips();
    renderManualStatus();
  };

  const closeManualBox = () => {
    const manualBox = el('sale_manual_box');
    if (manualBox) manualBox.style.display = 'none';
    resetManualUI();
  };

  const init = () => {
    const btn = el('btn_sale');
    const toggle = el('sale_manual_toggle');
    const saleFormat = el('sale_prod_select');
    const saleName = el('sale_product_name_select');

    ensureConfirmBox();

    // toggle manuale
    if (toggle) {
      toggle.addEventListener('change', async () => {
        clearConfirmBox();
        setMsg('', '');
        resetManualUI();

        if (isManual()) {
          await openManualBoxAndLoadLots();
        } else {
          closeManualBox();
        }
      });
    }

    // cambio prodotto/formato
    if (saleFormat) {
      saleFormat.addEventListener('change', async () => {
        const pid = Number(saleFormat.value || 0);
        currentProduct = pid ? (PRODUCTS || []).find(x => Number(x.id) === pid) || null : null;

        clearConfirmBox();
        setMsg('', '');
        resetManualUI();

        if (isManual() && currentProduct?.id) {
          await openManualBoxAndLoadLots();
        }
      });
    }

    // barcode scanner-friendly
    let barcodeTimer = null;
    el('barcode')?.addEventListener('input', () => {
      clearTimeout(barcodeTimer);
      barcodeTimer = setTimeout(async () => {
        const code = el('barcode')?.value.trim() || '';
        if (!code) return;

        const p = await fetchProductByEAN(code);
        if (p?.error || p?.success === false) return;

        currentProduct = p;

        if (saleName) {
          saleName.value = p.name;
          saleName.dispatchEvent(new Event('change'));
        }
        if (saleFormat) {
          saleFormat.value = String(p.id);
          saleFormat.dispatchEvent(new Event('change'));
        }

        if (isManual() && currentProduct?.id) {
          await openManualBoxAndLoadLots();
        }
      }, 180);
    });

    // qty cambia: se manuale ricalcola status e ricarica suggeriti
    el('sale_qty')?.addEventListener('input', async () => {
      clearConfirmBox();
      if (!isManual()) return;
      if (!currentProduct?.id) return;
      // non resetto selectedLots (sennò ti incazzi), però aggiorno status
      renderManualStatus();
      await fetchSuggestedLots(currentProduct.id);
      renderSuggestedChips();
      renderSelectedChips();
      renderManualStatus();
    });

    if (!btn) return;

    btn.onclick = async () => {
      btn.disabled = true;
      try {
        clearConfirmBox();
        setMsg('', '');

        const quantity = getQty();
        if (quantity <= 0) { setMsg('error', 'Quantità non valida.'); return; }

        const product = await resolveProductForSale();
        if (product?.error) { setMsg('error', product.error); return; }
        if (product?.success === false) { setMsg('error', product.error || 'Prodotto non trovato'); return; }

        currentProduct = product;

        if (isManual()) {
          await openManualBoxAndLoadLots();
          await doManual();
        } else {
          await doAuto();
        }
      } catch (err) {
        console.error(err);
        setMsg('error', 'Errore imprevisto');
      } finally {
        btn.disabled = false;
      }
    };
  };

  return { init };
})();

// ---------- PRODOTTI TAB ----------
async function loadProductsTable(e){
  const res = await fetchJSON('api_products_with_stock.php');

  // ✅ normalizza: accetta array puro oppure oggetto {rows:[...]}
  const rows = Array.isArray(res) ? res : (Array.isArray(res?.rows) ? res.rows : []);

  if(!Array.isArray(rows)){
    console.error('api_products_with_stock.php returned non-array:', res);
    return;
  }

  const container = document.getElementById('products_container');
  if(!container) return;

  const toggle = document.getElementById('toggle_archived_products');
  const showArchived = (e?.target?.id === 'toggle_archived_products')
    ? !!e.target.checked
    : !!toggle?.checked;

  container.innerHTML='';

  rows
    .filter(p => showArchived ? true : Number(p.is_active ?? 1) === 1)
    .forEach(p=>{

      const imageSrc = p.image_path ? p.image_path : 'uploads/stock.jpg';

      const card=document.createElement('div');
      card.className='product-card';
      card.dataset.id = p.id;

      card.innerHTML=`
        <div class="product-header">
          <img src="${imageSrc}" class="product-img">

          <div class="product-info">
            <div class="view-mode">
              <div class="product-name">
                ${p.name}
                ${Number(p.is_active ?? 1) === 0
                  ? `<span style="
                      margin-left:8px;
                      font-size:11px;
                      padding:2px 8px;
                      border-radius:999px;
                      background:#ef4444;
                      color:white;
                    ">ARCHIVIATO</span>`
                  : ''}
              </div>
              <div class="product-meta">Formato: ${p.format || ''}</div>
              <div class="product-meta">
                Unità per vassoio: <strong>${p.units_per_tray}</strong>
              </div>
              <div class="product-meta">EAN: ${p.ean}</div>
            </div>

            <div class="edit-mode hidden">
              <input class="edit-name" value="${p.name}">
              <input class="edit-format" value="${p.format || ''}">
              <input class="edit-units" type="number" value="${p.units_per_tray}" min="1">
            </div>
          </div>
        </div>

        <div class="product-stock">
          Stock totale: ${p.stock} barattoli
        </div>

        <div class="product-actions view-mode">
          <button class="btn-small btn-edit">Modifica</button>

          <button class="btn-small btn-danger btn-delete">
            ${Number(p.is_active ?? 1) === 1 ? 'Archivia' : 'Elimina definitivamente'}
          </button>

          ${Number(p.is_active ?? 1) === 0
            ? `<button class="btn-small btn-restore">Riattiva</button>`
            : ''
          }
        </div>

        <div class="product-actions edit-mode hidden">
          <button class="btn-small btn-save">Salva</button>
          <button class="btn-small btn-cancel">Annulla</button>
        </div>
      `;

      const editBtn = card.querySelector('.btn-edit');
      const deleteBtn = card.querySelector('.btn-delete');
      const restoreBtn = card.querySelector('.btn-restore');
      const saveBtn = card.querySelector('.btn-save');
      const cancelBtn = card.querySelector('.btn-cancel');

      const viewModes = card.querySelectorAll('.view-mode');
      const editModes = card.querySelectorAll('.edit-mode');

      editBtn.addEventListener('click', ()=>{
        card.classList.add('editing');
        viewModes.forEach(el=>el.classList.add('hidden'));
        editModes.forEach(el=>el.classList.remove('hidden'));
      });

      restoreBtn?.addEventListener('click', async ()=>{
        const res = await fetchJSON('api_restore_product.php',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id:p.id })
        });

        if(res?.error){
          alert(res.error);
          return;
        }

        await loadProducts();
        await loadProductsTable();
      });

      cancelBtn.addEventListener('click', ()=>{
        card.classList.remove('editing');
        editModes.forEach(el=>el.classList.add('hidden'));
        viewModes.forEach(el=>el.classList.remove('hidden'));
      });

      saveBtn.addEventListener('click', async ()=>{
        const newName = card.querySelector('.edit-name').value.trim();
        const newFormat = card.querySelector('.edit-format').value.trim();
        const newUnits = parseInt(card.querySelector('.edit-units').value,10);

        if(!newName || newUnits <= 0){
          alert("Dati non validi");
          return;
        }

        const res = await fetchJSON('api_update_product.php',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            id:p.id,
            name:newName,
            format:newFormat,
            units:newUnits
          })
        });

        if(res?.error){
          alert(res.error);
          return;
        }

        card.classList.remove('editing');
        card.classList.add('saved');

        setTimeout(()=>{ card.classList.remove('saved'); },600);

        await loadProducts();
        await loadProductsTable();
      });

      deleteBtn.addEventListener('click', async () => {

  const isArchived = Number(p.is_active ?? 1) === 0;

  const question = isArchived
    ? "Eliminare DEFINITIVAMENTE il prodotto?\n(se ha movimenti/lotti verrà solo mantenuto archiviato)"
    : "Archiviare il prodotto?";

  if (!confirm(question)) return;

  const res = await fetchJSON('api_delete_product.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id })
  });

  // se il backend ritorna success:false o error
  if (res?.success === false) {
    alert(res.error || 'Errore eliminazione');
    return;
  }
  if (res?.error) {
    alert(res.error);
    return;
  }

  // UX chiara
  if (res?.mode === 'soft') {
    alert(isArchived
      ? '⚠ Non posso eliminare definitivamente: ha lotti/movimenti. Rimane archiviato.'
      : '✅ Prodotto archiviato.'
    );
  } else if (res?.mode === 'hard') {
    alert('✅ Prodotto eliminato definitivamente.');
  } else {
    alert('✅ Operazione completata.');
  }

  await loadProducts();
  await loadProductsTable();
});

      container.appendChild(card);
    });
}

// ---------- RETTIFICHE (ADJUSTMENT) ----------
let ADJUST_TAB_READY = false;

async function loadAdjustTab(){

  const lotSelect = document.getElementById('adjust_lot');
  const qtyInput = document.getElementById('adjust_qty');
  const dirOut = document.getElementById('adjust_dir_out');
  const reasonSelect = document.getElementById('adjust_reason');
  const noteInput = document.getElementById('adjust_note');
  const btn = document.getElementById('btn_adjust_commit');
  const msg = document.getElementById('adjust_message');
  const stockBadge = document.getElementById('adjust_stock_badge');
  const tb = document.getElementById('adjust_table_body');

  if(!lotSelect || !tb) return;

  const lots = await fetchJSON('api_lots.php');
  const movements = await fetchJSON('api_movements.php');

  const stockByLot = new Map();

  movements.forEach(m=>{
    const id = Number(m.lot_id);
    if(!id) return;

    const prev = stockByLot.get(id) || 0;
    const qty = Number(m.quantity)||0;

    if(m.type === 'PRODUCTION') stockByLot.set(id, prev + qty);
    else if(m.type === 'SALE') stockByLot.set(id, prev - qty);
    else if(m.type === 'ADJUSTMENT') stockByLot.set(id, prev + qty);
  });

  const lotsWithStock = lots.map(l => ({
    ...l,
    stock: stockByLot.get(Number(l.lot_id)) || 0
  }));

  lotSelect.innerHTML = '<option value="">Seleziona lotto…</option>';

  lotsWithStock.forEach(l=>{
    const opt = document.createElement('option');
    opt.value = l.lot_id;
    opt.textContent =
      `${l.product_name} • ${l.format} • Lotto ${l.lot_number} • Stock ${l.stock}`;
    opt.dataset.stock = l.stock;
    lotSelect.appendChild(opt);
  });

  lotSelect.addEventListener('change', ()=>{
    const opt = lotSelect.options[lotSelect.selectedIndex];
    stockBadge.textContent = opt?.dataset?.stock || 0;
  });

  if(!ADJUST_TAB_READY){
    btn.addEventListener('click', async ()=>{

      msg.className = 'message';
      msg.textContent = '';

      const lot_id = Number(lotSelect.value||0);
      const quantity = Number(qtyInput.value||0);
      const direction = dirOut?.checked ? 'OUT' : 'IN';
      const reason = reasonSelect.value;
      const note = noteInput.value;

      if(!lot_id || quantity<=0){
        msg.classList.add('error');
        msg.textContent = 'Dati non validi.';
        return;
      }

      const res = await fetchJSON('api_adjust_stock.php',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          lot_id,
          quantity,
          direction,
          reason,
          note
        })
      });

      if(!res.success){
        msg.classList.add('error');
        msg.textContent = res.error || 'Errore.';
        return;
      }

      msg.classList.add('success');
      msg.textContent = 'Rettifica registrata.';

      qtyInput.value='';
      noteInput.value='';

      await loadHomeDashboard();
      await loadAdjustTab();
    });

    ADJUST_TAB_READY = true;
  }

  const adjustments = movements
    .filter(m=>m.type==='ADJUSTMENT')
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
    .slice(0,30);

  const lotMap = new Map(lotsWithStock.map(l=>[Number(l.lot_id),l]));

  tb.innerHTML = adjustments.map(m=>{
    const lot = lotMap.get(Number(m.lot_id));
    const exp = lot?.expiration_date
      ? formatDateIT(lot.expiration_date)
      : '—';

    const qty = Number(m.quantity)||0;
    const qDisp = qty<0 ? `−${Math.abs(qty)}` : `+${Math.abs(qty)}`;

    return `
      <tr>
        <td>${formatDateIT(m.created_at)}</td>
        <td>${lot?.product_name || '—'}</td>
        <td><strong>${lot?.lot_number || '—'}</strong></td>
        <td>${exp}</td>
        <td style="font-weight:900;">${qDisp}</td>
        <td>${m.reason || '—'}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="6" class="muted">Nessuna rettifica</td></tr>`;
}

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', async ()=>{

  document
  .getElementById('toggle_archived_products')
  ?.addEventListener('change', (e)=>{
    SHOW_ARCHIVED_PRODUCTS = e.target.checked;
    loadProductsTable();
  });

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if(!target) return;

      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab').forEach(tab=>{
        tab.classList.remove('active');
      });

      target.classList.add('active');

      // lazy-load tab content
        if(targetId === 'tab_adjust'){
          setTimeout(loadAdjustTab, 0);
        }
    });
  });

  lockLotFields();

  await loadProducts();
  SaleUI.init();

  await loadHomeDashboard();
SHOW_ARCHIVED_PRODUCTS =
  document.getElementById('toggle_archived_products')?.checked === true;

await loadProductsTable();
  await refreshTodayBatches();

  // ---------- CREA PRODOTTO ----------
  document.getElementById('btn_add_product')?.addEventListener('click', async ()=>{

    const msg = document.getElementById('product_message');
    msg.className = 'message';
    msg.textContent = '';

    const name = document.getElementById('new_product_name').value.trim();
    const format = document.getElementById('new_product_format').value.trim();
    const fish_type = document.getElementById('new_product_fish').value.trim().toUpperCase();
    const ean = document.getElementById('new_product_ean').value.trim();
    const units = parseInt(document.getElementById('new_product_units').value, 10);
    const imageInput = document.getElementById('new_product_image');

    if(!name || !format || !fish_type || !ean || !units || units <= 0){
      msg.classList.add('error');
      msg.textContent = 'Compila tutti i campi obbligatori.';
      return;
    }

    try{
      const formData = new FormData();
      formData.append('name', name);
      formData.append('format', format);
      formData.append('fish_type', fish_type);
      formData.append('ean', ean);
      formData.append('units_per_tray', units);

      if(imageInput.files.length > 0){
        formData.append('image', imageInput.files[0]);
      }

      const res = await fetch('api_create_product.php', {
        method:'POST',
        body: formData
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch(e){
        console.error(text);
        msg.classList.add('error');
        msg.textContent = 'Errore server (vedi console).';
        return;
      }

      if(data.error){
        msg.classList.add('error');
        msg.textContent = data.error;
        return;
      }

      msg.classList.add('success');
      msg.textContent = 'Prodotto creato con successo.';

      document.getElementById('new_product_name').value = '';
      document.getElementById('new_product_format').value = '';
      document.getElementById('new_product_ean').value = '';
      document.getElementById('new_product_units').value = '';
      imageInput.value = '';

      await loadProducts();
      await loadProductsTable();

    }catch(err){
      console.error(err);
      msg.classList.add('error');
      msg.textContent = 'Errore creazione prodotto.';
    }
  });

  const lotInput = document.getElementById('lot_number');
  const formatSelect = document.getElementById('prod_select');

  lotInput?.addEventListener('input', async (e)=>{
    await checkBatchWarning(e.target.value.trim());
  });

  if(lotInput){
    lotInput.disabled = true;
    lotInput.style.background = '#eee';
  }

  if(formatSelect){
    formatSelect.addEventListener('change', ()=>{
      if(formatSelect.value){
        lotInput.disabled = false;
        lotInput.style.background = '';
      } else {
        lotInput.disabled = true;
        lotInput.value = '';
        lotInput.style.background = '#eee';
      }
    });
  }

  const eanInput = document.getElementById('prod_ean');
  if(eanInput){

    let timeout = null;

    eanInput.addEventListener('input', (e)=>{

      clearTimeout(timeout);

      timeout = setTimeout(async ()=>{

        const code = e.target.value.trim();

        if(!code){
          lockLotFields();
          return;
        }

        const product = await fetchProductByEAN(code);

        if(product.error){
          lockLotFields();
          return;
        }

        const nameSelect = document.getElementById('product_name_select');
        const formatSelect = document.getElementById('prod_select');

        nameSelect.value = product.name;
        nameSelect.dispatchEvent(new Event('change'));

        formatSelect.value = product.id;
        formatSelect.dispatchEvent(new Event('change'));

        unlockLotFields();
        await refreshTodayBatches();

      }, 300);

    });
  }
});