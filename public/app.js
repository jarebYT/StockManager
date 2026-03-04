/* ═══════════════════════════════════════════════
    Stock Manager — Application côté client
    ═══════════════════════════════════════════════
    Description : Ce fichier contient toute la logique d'interface
    (affichage, modales, formulaires, chargement de données et
    interactions utilisateur) exécutée dans le navigateur.
*/

const API = '';

// ─── ÉTAT ───────────────────────────────────────
// Variables globales mémorisant l'état applicatif en mémoire
// (listes de produits et de techniciens utilisées par l'UI).
let products = [];
let technicians = [];

// ─── INITIALISATION ──────────────────────────────
// Attache les gestionnaires DOM et charge les données au démarrage.
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initModals();
    initForms();
    loadAll();
});

// ─── ONGLETS / NAVIGATION ─────────────────────────
// Gestion des onglets : bascule l'affichage des sections
// en fonction du bouton activé.
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

// ─── MODALES / DIALOGUES ─────────────────────────
// Initialisation des modales : ouverture, fermeture, interactions
// et préparation des formulaires avant affichage.
function initModals() {
    // Boutons d'ouverture : attache les évènements pour afficher
    // chaque modale et préparer les sélecteurs si nécessaire.
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

    // Boutons de fermeture : ferme la modale par clic sur les
    // éléments marqués avec l'attribut `data-close`.
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal-overlay').classList.remove('open');
        });
    });

    // Fermeture au clic sur l'overlay : si l'utilisateur clique
    // en dehors du contenu, la modale se ferme.
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });
    });

    // Ajout d'une ligne d'article de commande : ajoute dynamiquement
    // une nouvelle ligne pour spécifier produit + quantité.
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

// ─── FORMULAIRES ──────────────────────────────────
// Gestion des soumissions des formulaires (produit, commande,
// sortie) : validation côté client, appel de l'API et feedback.
function initForms() {
    // Ajout de produit : récupère les champs, appelle l'API
    // pour créer le produit, affiche un message et recharge les données.
    document.getElementById('formProduct').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('productName').value.trim();
        const category = document.getElementById('productCategory').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value) || 0;
        try {
            await api('POST', '/api/products', { name, category, price });
            toast('Produit ajouté avec succès', 'success');
            closeModal('modalProduct');
            e.target.reset();
            loadAll();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Ajout de commande : collecte les lignes d'articles, valide
    // leur contenu, envoie la commande au serveur puis recharge.
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

    // Ajout de sortie (outgoing) : collecte les infos de sortie
    // (technicien, produit, client...), envoie au serveur.
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

    // Filtre par technicien : met à jour l'affichage des sorties
    // en fonction du technicien sélectionné.
    document.getElementById('filterTech').addEventListener('change', loadOutgoing);
}

// ─── CHARGEMENT DES DONNÉES ──────────────────────
// Fonctions pour récupérer depuis l'API les données requises
// et les stocker dans l'état local pour affichage.
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

// ─── ONGLET STOCK ─────────────────────────────────
// Rendu du tableau de stock : calcule totaux et génère
// le HTML des lignes en fonction des données produits reçues.
async function loadStock() {
    const data = await api('GET', '/api/products');
    const tbody = document.getElementById('stockBody');
    const empty = document.getElementById('stockEmpty');

    let totalIn = 0, totalOut = 0, totalCurrent = 0, totalValue = 0;

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
            totalValue += p.price * p.current_stock;
            if (totalValue < 0) totalValue = 0;
            console.log(`Données du produit ${p.name} : IN=${p.total_in}, OUT=${p.total_out}, CURRENT=${p.current_stock}, PRICE=${p.price}, VALUE=${totalValue}`);
            return `
        <tr>
          <td><strong>${esc(p.name)}</strong></td>
          <td>${esc(p.category)}</td>
          <td class="num"><span class="badge-in">${p.total_in}</span></td>
          <td class="num"><span class="badge-out">${p.total_out}</span></td>
          <td class="num"><span class="badge-current">${p.current_stock}</span></td>
          <td class="num"><span class="badge-current">${p.price}</span></td>
          <td class="num"><span class="badge-current">${totalValue}</span></td>
          <td>
            <button class="btn btn-icon btn-danger" onclick="deleteProduct(${p.id})" title="Supprimer">🗑</button>
          </td>
        </tr>
      `;
        }).join('');
    }

    document.getElementById('totalIn').textContent = totalIn;
    document.getElementById('totalOut').textContent = totalOut;
    document.getElementById('totalCurrent').textContent = totalCurrent;}

// ─── ONGLET COMMANDES ────────────────────────────
// Rendu des commandes : affiche la liste des commandes ainsi
// qu'un résumé des articles associés.
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

// ─── ONGLET SORTIES ──────────────────────────────
// Rendu des sorties : affiche les mouvements sortants, option
// de filtrage par technicien et mise à jour des totaux.
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

// ─── ACTIONS DE SUPPRESSION ──────────────────────
// Fonctions de suppression pour produits, commandes et sorties.
// Chaque fonction demande confirmation, appelle l'API et recharge.
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

// ─── LIGNES DE COMMANDE (ORDER ITEMS) ───────────
// Manipulation dynamique des lignes d'articles dans le formulaire
// de commande (ajout, suppression, réinitialisation).
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

    // Affiche le bouton de suppression seulement quand il y a
    // plus d'une ligne pour éviter de supprimer la dernière ligne.
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

// ─── REMPLISSAGE DES SÉLECTEURS (SELECTS) ───────
// Remplit les listes déroulantes de produits et techniciens
// utilisées dans les formulaires (commande, sortie, filtre).
function populateProductSelects() {
    const options = products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

    // Sélecteurs des articles de commande : met à jour les options
    // disponibles pour chaque ligne d'article.
    document.querySelectorAll('.item-product').forEach(sel => {
        const currentVal = sel.value;
        sel.innerHTML = `<option value="">-- Produit --</option>${options}`;
        sel.value = currentVal;
    });

    // Sélecteur produit pour les sorties : met la liste des produits
    // disponibles pour enregistrer une sortie.
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

// ─── FONCTIONS UTILITAIRES / AIDE ────────────────
// Fonctions utilitaires partagées : wrapper HTTP, échappement
// de texte pour le DOM, formatage de date et notification toast.
// `api` : wrapper pour les requêtes fetch vers l'API backend.
// Prend la méthode HTTP, l'URL (relative) et un éventuel body.
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

// `esc` : échappe une chaîne pour l'insérer en toute sécurité
// dans le DOM afin d'éviter les injections HTML.
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// `formatDate` : formate une date (YYYY-MM-DD) en représentation
// lisible pour l'UX en français (JJ/MM/AAAA).
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// `toast` : affiche une notification temporaire à l'utilisateur.
// `type` peut être 'success' ou 'error' pour appliquer le style.
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
