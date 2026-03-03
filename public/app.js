/* ═══════════════════════════════════════════════
   Stock Manager — Client-side Application
   ═══════════════════════════════════════════════ */

const API = '';

// ─── STATE ───────────────────────────────────────
let products = [];
let technicians = [];

// ─── INIT ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initModals();
    initForms();
    loadAll();
});

// ─── TABS ────────────────────────────────────────
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('section' + capitalize(btn.dataset.tab)).classList.add('active');
        });
    });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── MODALS ──────────────────────────────────────
function initModals() {
    // Open buttons
    document.getElementById('btnAddProduct').addEventListener('click', () => openModal('modalProduct'));
    document.getElementById('btnAddOrder').addEventListener('click', () => {
        populateProductSelects();
        setDefaultDate('orderDate');
        openModal('modalOrder');
    });
    document.getElementById('btnAddOutgoing').addEventListener('click', () => {
        populateProductSelects();
        populateTechnicianSelects();
        setDefaultDate('outDate');
        openModal('modalOutgoing');
    });

    // Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal-overlay').classList.remove('open');
        });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });
    });

    // Order item add
    document.getElementById('btnAddOrderItem').addEventListener('click', addOrderItemRow);
}

function openModal(id) {
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

function setDefaultDate(inputId) {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById(inputId).value = today;
}

// ─── FORMS ───────────────────────────────────────
function initForms() {
    // Add product
    document.getElementById('formProduct').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('productName').value.trim();
        const category = document.getElementById('productCategory').value.trim();
        try {
            await api('POST', '/api/products', { name, category });
            toast('Produit ajouté avec succès', 'success');
            closeModal('modalProduct');
            e.target.reset();
            loadAll();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Add order
    document.getElementById('formOrder').addEventListener('submit', async (e) => {
        e.preventDefault();
        const supplier = document.getElementById('orderSupplier').value.trim();
        const reference = document.getElementById('orderRef').value.trim();
        const order_date = document.getElementById('orderDate').value;
        const notes = document.getElementById('orderNotes').value.trim();

        const itemRows = document.querySelectorAll('#orderItems .order-item-row');
        const items = [];
        for (const row of itemRows) {
            const product_id = parseInt(row.querySelector('.item-product').value);
            const quantity = parseInt(row.querySelector('.item-qty').value);
            if (!product_id || !quantity || quantity < 1) {
                toast('Veuillez remplir tous les articles correctement', 'error');
                return;
            }
            items.push({ product_id, quantity });
        }

        try {
            await api('POST', '/api/orders', { supplier, reference, order_date, notes, items });
            toast('Commande enregistrée', 'success');
            closeModal('modalOrder');
            e.target.reset();
            resetOrderItems();
            loadAll();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Add outgoing
    document.getElementById('formOutgoing').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            technician_id: parseInt(document.getElementById('outTech').value),
            product_id: parseInt(document.getElementById('outProduct').value),
            date: document.getElementById('outDate').value,
            client: document.getElementById('outClient').value.trim(),
            solution: document.getElementById('outSolution').value.trim(),
            quantity: parseInt(document.getElementById('outQty').value) || 1,
            type: document.getElementById('outType').value.trim(),
            ticket_number: document.getElementById('outTicket').value.trim(),
        };

        try {
            await api('POST', '/api/outgoing', data);
            toast('Sortie enregistrée', 'success');
            closeModal('modalOutgoing');
            e.target.reset();
            loadAll();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Technician filter
    document.getElementById('filterTech').addEventListener('change', loadOutgoing);
}

// ─── DATA LOADING ────────────────────────────────
async function loadAll() {
    await Promise.all([
        loadProducts(),
        loadTechnicians(),
    ]);
    await Promise.all([
        loadStock(),
        loadOrders(),
        loadOutgoing(),
        loadTechStats(),
    ]);
}

async function loadProducts() {
    products = await api('GET', '/api/products');
}

async function loadTechnicians() {
    technicians = await api('GET', '/api/technicians');
    populateFilterTechnician();
}

// ─── STOCK TAB ───────────────────────────────────
async function loadStock() {
    const data = await api('GET', '/api/products');
    const tbody = document.getElementById('stockBody');
    const empty = document.getElementById('stockEmpty');

    let totalIn = 0, totalOut = 0, totalCurrent = 0;

    if (data.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        document.getElementById('stockTable').style.display = 'none';
    } else {
        empty.style.display = 'none';
        document.getElementById('stockTable').style.display = '';
        tbody.innerHTML = data.map(p => {
            totalIn += p.total_in;
            totalOut += p.total_out;
            totalCurrent += p.current_stock;
            return `
        <tr>
          <td><strong>${esc(p.name)}</strong></td>
          <td>${esc(p.category)}</td>
          <td class="num"><span class="badge-in">${p.total_in}</span></td>
          <td class="num"><span class="badge-out">${p.total_out}</span></td>
          <td class="num"><span class="badge-current">${p.current_stock}</span></td>
          <td>
            <button class="btn btn-icon btn-danger" onclick="deleteProduct(${p.id})" title="Supprimer">🗑</button>
          </td>
        </tr>
      `;
        }).join('');
    }

    document.getElementById('totalIn').textContent = totalIn;
    document.getElementById('totalOut').textContent = totalOut;
    document.getElementById('totalCurrent').textContent = totalCurrent;
}

// ─── ORDERS TAB ──────────────────────────────────
async function loadOrders() {
    const data = await api('GET', '/api/orders');
    const tbody = document.getElementById('ordersBody');
    const empty = document.getElementById('ordersEmpty');

    if (data.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        document.getElementById('ordersTable').style.display = 'none';
    } else {
        empty.style.display = 'none';
        document.getElementById('ordersTable').style.display = '';
        tbody.innerHTML = data.map(o => `
      <tr>
        <td>${formatDate(o.order_date)}</td>
        <td><strong>${esc(o.supplier)}</strong></td>
        <td>${esc(o.reference)}</td>
        <td>${esc(o.items_summary || '—')}</td>
        <td>${esc(o.notes || '')}</td>
        <td>
          <button class="btn btn-icon btn-danger" onclick="deleteOrder(${o.id})" title="Supprimer">🗑</button>
        </td>
      </tr>
    `).join('');
    }
}

// ─── OUTGOING TAB ────────────────────────────────
async function loadOutgoing() {
    const techId = document.getElementById('filterTech').value;
    const url = techId ? `/api/outgoing?technician_id=${techId}` : '/api/outgoing';
    const data = await api('GET', url);
    const tbody = document.getElementById('outgoingBody');
    const empty = document.getElementById('outgoingEmpty');

    if (data.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        document.getElementById('outgoingTable').style.display = 'none';
    } else {
        empty.style.display = 'none';
        document.getElementById('outgoingTable').style.display = '';
        tbody.innerHTML = data.map(o => `
      <tr>
        <td>${formatDate(o.date)}</td>
        <td><strong>${esc(o.technician_name)}</strong></td>
        <td>${esc(o.client)}</td>
        <td>${esc(o.product_name)}</td>
        <td class="num"><span class="badge-out">${o.quantity}</span></td>
        <td>${esc(o.type)}</td>
        <td>${esc(o.solution)}</td>
        <td>${esc(o.ticket_number)}</td>
        <td>
          <button class="btn btn-icon btn-danger" onclick="deleteOutgoing(${o.id})" title="Supprimer">🗑</button>
        </td>
      </tr>
    `).join('');
    }
}

async function loadTechStats() {
    const data = await api('GET', '/api/technicians/stats');
    const container = document.getElementById('techStats');
    container.innerHTML = data.map(t => `
    <div class="tech-card">
      <span class="tech-name">👤 ${esc(t.name)}</span>
      <span class="tech-count">${t.total_out} sortie${t.total_out !== 1 ? 's' : ''}</span>
    </div>
  `).join('');
}

// ─── DELETE ACTIONS ──────────────────────────────
async function deleteProduct(id) {
    if (!confirm('Supprimer ce produit et toutes ses données associées ?')) return;
    try {
        await api('DELETE', `/api/products/${id}`);
        toast('Produit supprimé', 'success');
        loadAll();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteOrder(id) {
    if (!confirm('Supprimer cette commande ? Le stock IN sera mis à jour.')) return;
    try {
        await api('DELETE', `/api/orders/${id}`);
        toast('Commande supprimée', 'success');
        loadAll();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteOutgoing(id) {
    if (!confirm('Supprimer cette sortie ? Le stock OUT sera mis à jour.')) return;
    try {
        await api('DELETE', `/api/outgoing/${id}`);
        toast('Sortie supprimée', 'success');
        loadAll();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ─── ORDER ITEMS ─────────────────────────────────
function addOrderItemRow() {
    const container = document.getElementById('orderItems');
    const row = document.createElement('div');
    row.className = 'order-item-row';
    row.innerHTML = `
    <select class="select-input item-product" required>
      <option value="">-- Produit --</option>
      ${products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
    </select>
    <input type="number" class="form-input item-qty" min="1" value="1" placeholder="Qté" required>
    <button type="button" class="btn btn-icon btn-danger remove-item" title="Retirer">&times;</button>
  `;
    row.querySelector('.remove-item').addEventListener('click', () => row.remove());
    container.appendChild(row);

    // Show remove buttons when more than 1 row
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const rows = document.querySelectorAll('#orderItems .order-item-row');
    rows.forEach((row, i) => {
        const btn = row.querySelector('.remove-item');
        btn.style.visibility = rows.length > 1 ? 'visible' : 'hidden';
    });
}

function resetOrderItems() {
    const container = document.getElementById('orderItems');
    container.innerHTML = `
    <div class="order-item-row">
      <select class="select-input item-product" required>
        <option value="">-- Produit --</option>
      </select>
      <input type="number" class="form-input item-qty" min="1" value="1" placeholder="Qté" required>
      <button type="button" class="btn btn-icon btn-danger remove-item" title="Retirer" style="visibility:hidden;">&times;</button>
    </div>
  `;
}

// ─── POPULATE SELECTS ────────────────────────────
function populateProductSelects() {
    const options = products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

    // Order items
    document.querySelectorAll('.item-product').forEach(sel => {
        const currentVal = sel.value;
        sel.innerHTML = `<option value="">-- Produit --</option>${options}`;
        sel.value = currentVal;
    });

    // Outgoing product
    const outProd = document.getElementById('outProduct');
    if (outProd) {
        outProd.innerHTML = `<option value="">-- Sélectionner --</option>${options}`;
    }
}

function populateTechnicianSelects() {
    const options = technicians.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    const outTech = document.getElementById('outTech');
    if (outTech) {
        outTech.innerHTML = `<option value="">-- Sélectionner --</option>${options}`;
    }
}

function populateFilterTechnician() {
    const sel = document.getElementById('filterTech');
    const currentVal = sel.value;
    sel.innerHTML = `<option value="">Tous</option>` +
        technicians.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    sel.value = currentVal;
}

// ─── HELPERS ─────────────────────────────────────
async function api(method, url, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(API + url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(40px)';
        el.style.transition = '0.3s ease';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}
