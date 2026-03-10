import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const db = new Database('votes.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    texte TEXT,
    lien TEXT,
    status TEXT DEFAULT 'active'
  );
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE,
    reponses TEXT
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE,
    active INTEGER DEFAULT 1
  );
`);

// Migration: Add status column to questions if it doesn't exist
try {
  db.prepare("ALTER TABLE questions ADD COLUMN status TEXT DEFAULT 'active'").run();
} catch (e) {
  // Column already exists or other error
}

// Seed initial data if empty
const qCount = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };
if (qCount.count === 0) {
  const initialQuestions = [
    { texte: "Niagara - J'ai vu", lien: "https://www.youtube.com/watch?v=v=v=v=v" },
    { texte: "Mademoiselle K - à l'ombre", lien: "" },
    { texte: "Mademoiselle K - ca me vexe", lien: "" }
  ];
  const insertQ = db.prepare('INSERT INTO questions (texte, lien, status) VALUES (?, ?, ?)');
  initialQuestions.forEach(q => insertQ.run(q.texte, q.lien, 'active'));
}

const mCount = db.prepare('SELECT COUNT(*) as count FROM members').get() as { count: number };
if (mCount.count === 0) {
  const initialMembers = ['Vanessa', 'Laurent', 'Stéph', 'Pierre', 'Eric', 'Maxime'];
  const insertM = db.prepare('INSERT INTO members (pseudo) VALUES (?)');
  initialMembers.forEach(m => insertM.run(m));
}

app.use(express.json());

// API Routes
app.get('/api/questions', (req, res) => {
  const questions = db.prepare('SELECT * FROM questions').all();
  res.json(questions);
});

app.post('/api/questions', (req, res) => {
  const { texte, lien } = req.body;
  const result = db.prepare('INSERT INTO questions (texte, lien, status) VALUES (?, ?, ?)').run(texte, lien, 'active');
  const newQ = { id: result.lastInsertRowid, texte, lien, status: 'active' };
  broadcast({ type: 'QUESTION_ADDED', question: newQ });
  res.json(newQ);
});

app.put('/api/questions/:id', (req, res) => {
  const { id } = req.params;
  const { texte, lien } = req.body;
  db.prepare('UPDATE questions SET texte = ?, lien = ? WHERE id = ?').run(texte, lien, id);
  const updatedQ = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  broadcast({ type: 'QUESTION_UPDATED', question: updatedQ });
  res.sendStatus(200);
});

app.put('/api/questions/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  db.prepare('UPDATE questions SET status = ? WHERE id = ?').run(status, id);
  broadcast({ type: 'QUESTION_STATUS_UPDATED', id: parseInt(id), status });
  res.sendStatus(200);
});

app.get('/api/members', (req, res) => {
  const members = db.prepare('SELECT * FROM members WHERE active = 1').all();
  res.json(members);
});

app.post('/api/members', (req, res) => {
  const { pseudo } = req.body;
  try {
    db.prepare('INSERT INTO members (pseudo) VALUES (?)').run(pseudo);
    broadcast({ type: 'MEMBER_ADDED', member: { pseudo, active: 1 } });
    res.status(201).json({ pseudo });
  } catch (e) {
    res.status(400).json({ error: 'Member already exists' });
  }
});

app.delete('/api/members/:pseudo', (req, res) => {
  const { pseudo } = req.params;
  // Option: Mark as inactive instead of deleting to preserve history if needed
  // Or delete votes too
  db.prepare('DELETE FROM members WHERE pseudo = ?').run(pseudo);
  db.prepare('DELETE FROM votes WHERE pseudo = ?').run(pseudo);
  broadcast({ type: 'MEMBER_REMOVED', pseudo });
  res.sendStatus(200);
});

app.get('/api/votes', (req, res) => {
  const votes = db.prepare('SELECT * FROM votes').all();
  res.json(votes.map((v: any) => {
    try {
      return { ...v, reponses: JSON.parse(v.reponses || '{}') };
    } catch (e) {
      return { ...v, reponses: {} };
    }
  }));
});

app.post('/api/votes', (req, res) => {
  const { pseudo, reponses } = req.body;
  const reponsesJson = JSON.stringify(reponses);
  db.prepare('INSERT OR REPLACE INTO votes (pseudo, reponses) VALUES (?, ?)').run(pseudo, reponsesJson);
  broadcast({ type: 'VOTE_UPDATED', vote: { pseudo, reponses } });
  res.json({ pseudo, reponses });
});

// WebSocket logic
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('Client connected');
});

// Vite middleware for development
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite();
