const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── PRODUCTS ────────────────────────────────────────────────────────

// Get all products with IN / OUT / CURRENT
app.get('/api/products', (req, res) => {
    const db = getDb();
    const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.category,
      COALESCE(i.total_in, 0) AS total_in,
      COALESCE(o.total_out, 0) AS total_out,
      COALESCE(a.total_adj, 0) AS total_adj,
      (COALESCE(i.total_in, 0) - COALESCE(o.total_out, 0) + COALESCE(a.total_adj, 0)) AS current_stock
    FROM products p
    LEFT JOIN (
      SELECT oi.product_id, SUM(oi.quantity) AS total_in
      FROM order_items oi
      GROUP BY oi.product_id
    ) i ON i.product_id = p.id
    LEFT JOIN (
      SELECT og.product_id, SUM(og.quantity) AS total_out
      FROM outgoing og
      GROUP BY og.product_id
    ) o ON o.product_id = p.id
    LEFT JOIN (
      SELECT sa.product_id, SUM(sa.adjustment) AS total_adj
      FROM stock_adjustments sa
      GROUP BY sa.product_id
    ) a ON a.product_id = p.id
    ORDER BY p.name
  `).all();
    res.json(rows);
});

// Add a new product
app.post('/api/products', (req, res) => {
    const db = getDb();
    const { name, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom du produit est requis' });
    try {
        const info = db.prepare('INSERT INTO products (name, category) VALUES (?, ?)').run(name, category || '');
        res.json({ id: info.lastInsertRowid, name, category: category || '' });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Ce produit existe déjà' });
        }
        res.status(500).json({ error: e.message });
    }
});

// Delete a product
app.delete('/api/products/:id', (req, res) => {
    const db = getDb();
    try {
        db.prepare('DELETE FROM order_items WHERE product_id = ?').run(req.params.id);
        db.prepare('DELETE FROM outgoing WHERE product_id = ?').run(req.params.id);
        db.prepare('DELETE FROM stock_adjustments WHERE product_id = ?').run(req.params.id);
        db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Adjust stock manually
app.put('/api/stock/:productId', (req, res) => {
    const db = getDb();
    const { adjustment, reason } = req.body;
    if (adjustment === undefined) return res.status(400).json({ error: 'Ajustement requis' });
    db.prepare('INSERT INTO stock_adjustments (product_id, adjustment, reason) VALUES (?, ?, ?)')
        .run(req.params.productId, adjustment, reason || '');
    res.json({ success: true });
});

// ─── ORDERS (Commandes — entrées de stock) ───────────────────────────

// Get all orders
app.get('/api/orders', (req, res) => {
    const db = getDb();
    const orders = db.prepare(`
    SELECT o.*, GROUP_CONCAT(p.name || ' x' || oi.quantity, ', ') AS items_summary
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    GROUP BY o.id
    ORDER BY o.order_date DESC
  `).all();

    // Also get detailed items for each order
    const stmt = db.prepare(`
    SELECT oi.id, oi.product_id, oi.quantity, p.name AS product_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `);

    const result = orders.map(order => ({
        ...order,
        items: stmt.all(order.id)
    }));

    res.json(result);
});

// Create an order
app.post('/api/orders', (req, res) => {
    const db = getDb();
    const { supplier, reference, order_date, notes, items } = req.body;
    if (!supplier || !reference || !order_date) {
        return res.status(400).json({ error: 'Fournisseur, référence et date sont requis' });
    }
    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Au moins un article est requis' });
    }

    const insertOrder = db.prepare(
        'INSERT INTO orders (supplier, reference, order_date, notes) VALUES (?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)'
    );

    const transaction = db.transaction(() => {
        const info = insertOrder.run(supplier, reference, order_date, notes || '');
        const orderId = info.lastInsertRowid;
        for (const item of items) {
            insertItem.run(orderId, item.product_id, item.quantity);
        }
        return orderId;
    });

    try {
        const orderId = transaction();
        res.json({ id: orderId, success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete an order
app.delete('/api/orders/:id', (req, res) => {
    const db = getDb();
    try {
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
        db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── OUTGOING (Sorties de stock) ─────────────────────────────────────

// Get all outgoing entries
app.get('/api/outgoing', (req, res) => {
    const db = getDb();
    const techId = req.query.technician_id;
    let sql = `
    SELECT og.*, t.name AS technician_name, p.name AS product_name
    FROM outgoing og
    JOIN technicians t ON t.id = og.technician_id
    JOIN products p ON p.id = og.product_id
  `;
    const params = [];
    if (techId) {
        sql += ' WHERE og.technician_id = ?';
        params.push(techId);
    }
    sql += ' ORDER BY og.date DESC';
    res.json(db.prepare(sql).all(...params));
});

// Create an outgoing entry
app.post('/api/outgoing', (req, res) => {
    const db = getDb();
    const { technician_id, product_id, date, client, solution, quantity, type, ticket_number } = req.body;
    if (!technician_id || !product_id || !date || !client) {
        return res.status(400).json({ error: 'Technicien, produit, date et client sont requis' });
    }
    try {
        const info = db.prepare(`
      INSERT INTO outgoing (technician_id, product_id, date, client, solution, quantity, type, ticket_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(technician_id, product_id, date, client, solution || '', quantity || 1, type || '', ticket_number || '');
        res.json({ id: info.lastInsertRowid, success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete an outgoing entry
app.delete('/api/outgoing/:id', (req, res) => {
    const db = getDb();
    try {
        db.prepare('DELETE FROM outgoing WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── TECHNICIANS ─────────────────────────────────────────────────────

app.get('/api/technicians', (req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM technicians ORDER BY name').all());
});

app.post('/api/technicians', (req, res) => {
    const db = getDb();
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });
    try {
        const info = db.prepare('INSERT INTO technicians (name) VALUES (?)').run(name);
        res.json({ id: info.lastInsertRowid, name });
    } catch (e) {
        if (e.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Ce technicien existe déjà' });
        }
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/technicians/:id', (req, res) => {
    const db = getDb();
    try {
        db.prepare('DELETE FROM outgoing WHERE technician_id = ?').run(req.params.id);
        db.prepare('DELETE FROM technicians WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Technician stats
app.get('/api/technicians/stats', (req, res) => {
    const db = getDb();
    const rows = db.prepare(`
    SELECT t.id, t.name,
      COALESCE(SUM(og.quantity), 0) AS total_out
    FROM technicians t
    LEFT JOIN outgoing og ON og.technician_id = t.id
    GROUP BY t.id
    ORDER BY t.name
  `).all();
    res.json(rows);
});

// ─── START ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`🚀 Stock Manager running at http://localhost:${PORT}`);
});
