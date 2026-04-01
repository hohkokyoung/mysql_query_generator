const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

// ─── Read schema from file ─────────────────────────────────────────────────
app.post('/schema', (req, res) => {
  const { filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: `file not found: ${resolved}` });
  }

  try {
    const content = fs.readFileSync(resolved, 'utf8');
    res.json({ schema: content, path: resolved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test DB connection ────────────────────────────────────────────────────
app.post('/db/test', async (req, res) => {
  const { host, port, user, password, database } = req.body;
  let conn;
  try {
    conn = await mysql.createConnection({ host, port: port || 3306, user, password, database });
    await conn.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

// ─── Dry-run SQL via BEGIN / ROLLBACK ─────────────────────────────────────
app.post('/db/dryrun', async (req, res) => {
  const { host, port, user, password, database, sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'sql required' });

  // block destructive statements always
  const upper = sql.trim().toUpperCase();
  const blocked = ['DROP ', 'TRUNCATE ', 'ALTER ', 'CREATE '];
  const hit = blocked.find(k => upper.startsWith(k));
  if (hit) return res.status(400).json({ error: `${hit.trim()} statements are blocked in dry-run mode` });

  let conn;
  try {
    conn = await mysql.createConnection({ host, port: port || 3306, user, password, database });
    await conn.beginTransaction();

    const [rows, fields] = await conn.execute(sql);

    await conn.rollback(); // always rollback — never commits

    const columns = (fields || []).map(f => f.name);
    const data = Array.isArray(rows) ? rows.slice(0, 50) : [];

    res.json({ ok: true, rowCount: data.length, columns, rows: data });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    res.status(400).json({ error: err.message });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

// ─── Call Ollama ───────────────────────────────────────────────────────────
app.post('/llm', async (req, res) => {
  const { model = 'qwen2.5-coder:14b', messages, system, ollamaUrl = 'http://localhost:11434' } = req.body;

  try {
    const payload = {
      model,
      messages: system
        ? [{ role: 'system', content: system }, ...messages]
        : messages,
      stream: false,
      options: { temperature: 0.1 }
    };

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(500).json({ error: `ollama error: ${text}` });
    }

    const data = await response.json();
    res.json({ content: data.message?.content || '' });
  } catch (err) {
    res.status(500).json({ error: `cannot reach ollama at ${req.body.ollamaUrl || 'http://localhost:11434'} — is it running?` });
  }
});

// ─── List available Ollama models ──────────────────────────────────────────
app.get('/llm/models', async (req, res) => {
  const ollamaUrl = req.query.url || 'http://localhost:11434';
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    const data = await response.json();
    const models = (data.models || []).map(m => m.name);
    res.json({ models });
  } catch {
    res.json({ models: [], error: 'cannot reach ollama' });
  }
});

const PORT = 3333;
app.listen(PORT, () => console.log(`nl-sql-agent backend running on http://localhost:${PORT}`));