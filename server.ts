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
    lien TEXT
  );
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pseudo TEXT UNIQUE,
    reponses TEXT
  );
`);

// Seed initial data if empty
const qCount = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number };
if (qCount.count === 0) {
  const initialQuestions = [
    { texte: "Niagara - J'ai vu", lien: "https://www.youtube.com/watch?v=v=v=v=v" },
    { texte: "Mademoiselle K - à l'ombre", lien: "" },
    { texte: "Mademoiselle K - ca me vexe", lien: "" }
  ];
  const insertQ = db.prepare('INSERT INTO questions (texte, lien) VALUES (?, ?)');
  initialQuestions.forEach(q => insertQ.run(q.texte, q.lien));
}

app.use(express.json());

// API Routes
app.get('/api/questions', (req, res) => {
  const questions = db.prepare('SELECT * FROM questions').all();
  res.json(questions);
});

app.post('/api/questions', (req, res) => {
  const { texte, lien } = req.body;
  const result = db.prepare('INSERT INTO questions (texte, lien) VALUES (?, ?)').run(texte, lien);
  const newQ = { id: result.lastInsertRowid, texte, lien };
  broadcast({ type: 'QUESTION_ADDED', question: newQ });
  res.json(newQ);
});

app.put('/api/questions/:id', (req, res) => {
  const { id } = req.params;
  const { texte, lien } = req.body;
  db.prepare('UPDATE questions SET texte = ?, lien = ? WHERE id = ?').run(texte, lien, id);
  broadcast({ type: 'QUESTION_UPDATED', question: { id: parseInt(id), texte, lien } });
  res.sendStatus(200);
});

app.delete('/api/questions/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  broadcast({ type: 'QUESTION_DELETED', id: parseInt(id) });
  res.sendStatus(200);
});

app.get('/api/votes', (req, res) => {
  const votes = db.prepare('SELECT * FROM votes').all();
  res.json(votes.map((v: any) => ({ ...v, reponses: JSON.parse(v.reponses) })));
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
