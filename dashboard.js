// ---------- DASHBOARD ----------
let salesChart = null;

function isMobile(){
  return window.matchMedia("(max-width: 680px)").matches;
}

function renderMobileRows(tbody, rows){
  // rows: array di oggetti {title, lines:[...], right}
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

  // stock per lotto
  const stockByLot = new Map();

  for(const m of movements){
    const lotId = Number(m.lot_id);
    if(!lotId) continue;

    const qty = Number(m.quantity) || 0;
    const prev = stockByLot.get(lotId) || 0;

    if(m.type === 'PRODUCTION') stockByLot.set(lotId, prev + qty);
    else if(m.type === 'SALE') stockByLot.set(lotId, prev - qty);
  }

  const lotsWithStock = lots.map(l => ({
    ...l,
    stock: stockByLot.get(Number(l.lot_id)) || 0
    
  }

));




  // stock totale
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

  // produzione oggi
  const totalTodayProduction = movements
    .filter(m => m.type === 'PRODUCTION' && isSameLocalDay(m.created_at, today))
    .reduce((s,m)=> s + (Number(m.quantity)||0), 0);

  document.getElementById('card_today_production').innerText = totalTodayProduction;

  // scadenze
  const expiringLots = lotsWithStock.filter(l=>{
    const diffDays = Math.ceil((new Date(l.expiration_date) - today)/(1000*60*60*24));
    return diffDays <= 30 && (Number(l.stock)||0) > 0;
  });

  document.getElementById('card_expiring').innerText = expiringLots.length;
// ---- HOME: scadenze divise 0-7 / 8-30 ----
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

  const typeLabel = (t) => t === 'SALE' ? 'Vendita' : (t === 'PRODUCTION' ? 'Produzione' : t);

  if(isMobile()){
    renderMobileRows(movesTb, sortedMoves.map(m => {
      const lot = lotById.get(Number(m.lot_id)) || null;
      return {
        title: lot?.product_name || '—',
        lines: [
          `${typeLabel(m.type)} • <strong>${formatDateIT(m.created_at)}</strong>`,
          `Lotto: <strong>${lot?.lot_number || '—'}</strong>`
        ],
        right: `${Number(m.quantity)||0}`
      };
    }));
  } else {
    sortedMoves.forEach(m=>{
      const lot = lotById.get(Number(m.lot_id)) || null;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDateIT(m.created_at)}</td>
        <td>${typeLabel(m.type)}</td>
        <td>${lot?.product_name || '—'}</td>
        <td>${lot?.lot_number || '—'}</td>
        <td>${Number(m.quantity)||0}</td>
      `;
      movesTb.appendChild(tr);
    });

    if(sortedMoves.length === 0){
      movesTb.innerHTML = `<tr><td colspan="5" class="muted">Nessun movimento</td></tr>`;
    }
  }
}

// ---- HOME: grafico Top vendite per prodotto (ultimi 30 giorni) ----
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

  // ✅ NASCONDI ARCHIVIATI (paracadute)
  PRODUCTS = (PRODUCTS || []).filter(p => Number(p.is_active ?? 1) === 1);

  const nameSelect = document.getElementById('product_name_select');
  const formatSelect = document.getElementById('prod_select');
  const info = document.getElementById('prod_info');

  if(!nameSelect || !formatSelect) return;

  // 🔹 Nomi unici ordinati alfabeticamente
  const productNames = [...new Set(PRODUCTS.map(p => p.name))]
    .sort((a,b)=> a.localeCompare(b));

  nameSelect.innerHTML = `<option value="">-- Seleziona prodotto --</option>`;

  productNames.forEach(name=>{
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    nameSelect.appendChild(opt);
  });

  
  // 🔹 Quando scelgo nome
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

  // 🔹 Quando scelgo formato
     formatSelect.addEventListener('change', async ()=>{

      const opt = formatSelect.options[formatSelect.selectedIndex];

      if(!opt || !opt.value){
        lockLotFields();
        return;
      }

      // compila EAN
      document.getElementById('prod_ean').value = opt.dataset.ean || '';

      // mostra info
      document.getElementById('prod_info').textContent =
        `Unità per vassoio: ${opt.dataset.units}`;

      // sblocca lotto e scadenza
      unlockLotFields();

      // aggiorna suggerimenti lotto filtrati
      await refreshTodayBatches();
    });
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

  // 🔥 Se non è selezionato formato, mostra messaggio neutro
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

    // lotto valido
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

  // 🔥 filtro per fish_type
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
document.getElementById('btn_sale')?.addEventListener('click', async ()=>{
  const msg = document.getElementById('sale_message');
  msg.className='message';
  msg.textContent='';

  const code = document.getElementById('barcode').value.trim();
  const quantity = parseInt(document.getElementById('sale_qty').value,10)||1;

  if(!code){
    msg.classList.add('error');
    msg.textContent='Inserisci EAN.';
    return;
  }

  try{
    const product = await fetchProductByEAN(code);
    if(product.error){
      msg.classList.add('error');
      msg.textContent = product.error;
      return;
    }

    const data = await fetchJSON('api_sale.php',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({product_id:product.id,quantity})
    });

    console.log("api_sale response:", data);

    if(data.error){
  msg.classList.add('error');
  msg.textContent = data.detail ? `${data.error}: ${data.detail}` : data.error;
  return;
}

    msg.classList.add('success');
    msg.textContent = `Venduti ${data.sold} barattoli`;

    document.getElementById('barcode').value='';
    document.getElementById('sale_qty').value=1;

    await loadHomeDashboard();
    await loadProductsTable();

  }catch(err){
    console.error(err);
  }
});

// ---------- PRODOTTI TAB ----------
async function loadProductsTable(){
  const rows = await fetchJSON('api_products_with_stock.php');
  const container = document.getElementById('products_container');
  if(!container) return;

  container.innerHTML='';

  rows.forEach(p=>{

    const imageSrc = p.image_path 
      ? p.image_path 
      : 'uploads/stock.jpg';

    const card=document.createElement('div');
    card.className='product-card';
    card.dataset.id = p.id;

    card.innerHTML=`
      <div class="product-header">
        <img src="${imageSrc}" class="product-img">

        <div class="product-info">
          <div class="view-mode">
            <div class="product-name">${p.name}</div>
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
        <button class="btn-small btn-danger btn-delete">Elimina</button>
      </div>

      <div class="product-actions edit-mode hidden">
        <button class="btn-small btn-save">Salva</button>
        <button class="btn-small btn-cancel">Annulla</button>
      </div>
    `;

    // --- ELEMENTI ---
    const editBtn = card.querySelector('.btn-edit');
    const deleteBtn = card.querySelector('.btn-delete');
    const saveBtn = card.querySelector('.btn-save');
    const cancelBtn = card.querySelector('.btn-cancel');

    const viewModes = card.querySelectorAll('.view-mode');
    const editModes = card.querySelectorAll('.edit-mode');

    // --- ATTIVA MODIFICA ---
   editBtn.addEventListener('click', ()=>{
  card.classList.add('editing');
  viewModes.forEach(el=>el.classList.add('hidden'));
  editModes.forEach(el=>el.classList.remove('hidden'));
});

    // --- ANNULLA ---
  cancelBtn.addEventListener('click', ()=>{
  card.classList.remove('editing');
  editModes.forEach(el=>el.classList.add('hidden'));
  viewModes.forEach(el=>el.classList.remove('hidden'));
});
    // --- SALVA ---
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

      if(res.error){
        alert(res.error);
        return;
      }

    card.classList.remove('editing');
    card.classList.add('saved');

    setTimeout(()=>{
      card.classList.remove('saved');
    },600);

    await loadProducts();
    await loadProductsTable();

    });

   // --- DELETE ---
deleteBtn.addEventListener('click', async () => {
  if (!confirm("Eliminare il prodotto?")) return;

  const res = await fetchJSON('api_delete_product.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id })
  });

  // Gestione errori (robusta)
  if (res?.success === false) {
    alert(res.error || 'Errore eliminazione');
    return;
  }
  if (res?.error) { // fallback se qualche endpoint usa ancora error senza success
    alert(res.error);
    return;
  }

  // Messaggio chiaro
  if (res?.mode === 'soft') {
    alert('Prodotto archiviato! (aveva lotti/movimenti).');
  } else if (res?.mode === 'hard') {
    alert('Prodotto eliminato.');
  } else {
    alert('Operazione completata.');
  }

  // Refresh UI
  await loadProducts();
  await loadProductsTable();
});

    container.appendChild(card);
  });
}

async function editProduct(id){
  const name = prompt("Nuovo nome:");
  const format = prompt("Nuovo formato:");
  const units = prompt("Unità per vassoio:");

  if(!name || !format || !units) return;

  const res = await fetchJSON('api_update_product.php',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({id,name,format,units})
  });

  if(res.error) return alert(res.error);

  await loadProducts();
  await loadProductsTable();
}

async function deleteProduct(id){
  if(!confirm("Eliminare il prodotto?")) return;

  const res = await fetchJSON('api_delete_product.php',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({id})
  });

  if(res.error) return alert(res.error);

  await loadProducts();
  await loadProductsTable();
}

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', async ()=>{

 // ---------- TABS STABILI ----------
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

  });
});

  lockLotFields();
  await loadProducts();
  await loadHomeDashboard();
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

    // reset campi
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
lotInput.addEventListener('input', async (e)=>{
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

      // 1️⃣ seleziona nome prodotto
      nameSelect.value = product.name;
      nameSelect.dispatchEvent(new Event('change'));

      // 2️⃣ seleziona formato
      formatSelect.value = product.id;
      formatSelect.dispatchEvent(new Event('change'));

      // sblocca
      unlockLotFields();

      await refreshTodayBatches();

    }, 300);

  });
}
});

