const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'stock.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb();
  }
  return db;
}

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT '',
      price FLOAT NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier TEXT NOT NULL,
      reference TEXT NOT NULL,
      order_date DATE NOT NULL,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS outgoing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      technician_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      date DATE NOT NULL,
      client TEXT NOT NULL,
      solution TEXT DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      type TEXT DEFAULT '',
      ticket_number TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES technicians(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      adjustment INTEGER NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Initialisation (seed) des techniciens si la table est vide
  // Ajoute quelques techniciens par défaut pour que l'application
  // dispose d'options utilisables dès la première exécution.
  const count = db.prepare('SELECT COUNT(*) as c FROM technicians').get();
  if (count.c === 0) {
    const insert = db.prepare('INSERT INTO technicians (name) VALUES (?)');
    insert.run('Alexandre');
    insert.run('Grégory');
    insert.run('William');
    insert.run('Antonio');
  }
}

module.exports = { getDb };
