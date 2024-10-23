const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());

// SQLite Database setup
const db = new sqlite3.Database(':memory:');

// Create tables for transactions and categories
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('income', 'expense')) NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
    category INTEGER,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (category) REFERENCES categories(id)
  )`);
});

// Add a new transaction
app.post('/transactions', (req, res) => {
  const { type, category, amount, date, description } = req.body;
  if (!type || !category || !amount || !date) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const stmt = db.prepare(`INSERT INTO transactions (type, category, amount, date, description)
                           VALUES (?, ?, ?, ?, ?)`);
  stmt.run(type, category, amount, date, description, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, type, category, amount, date, description });
  });
  stmt.finalize();
});

// Get all transactions
app.get('/transactions', (req, res) => {
  db.all(`SELECT * FROM transactions`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get a transaction by ID
app.get('/transactions/:id', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM transactions WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Transaction not found' });
    res.json(row);
  });
});

// Update a transaction by ID
app.put('/transactions/:id', (req, res) => {
  const { id } = req.params;
  const { type, category, amount, date, description } = req.body;

  db.run(`UPDATE transactions SET type = ?, category = ?, amount = ?, date = ?, description = ? WHERE id = ?`,
    [type, category, amount, date, description, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
      res.json({ message: 'Transaction updated successfully' });
    });
});

// Delete a transaction by ID
app.delete('/transactions/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM transactions WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ message: 'Transaction deleted successfully' });
  });
});

// Get a summary of transactions
app.get('/summary', (req, res) => {
  const { startDate, endDate, category } = req.query;
  let query = `SELECT 
                 SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS totalIncome,
                 SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS totalExpenses
               FROM transactions WHERE 1=1`;

  const params = [];
  if (startDate && endDate) {
    query += ` AND date BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  db.get(query, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    const balance = (row.totalIncome || 0) - (row.totalExpenses || 0);
    res.json({ totalIncome: row.totalIncome || 0, totalExpenses: row.totalExpenses || 0, balance });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
