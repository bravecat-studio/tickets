import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { db } from './db';

const app = express();
app.use(cors());
app.use(express.json());

const STATUSES = ['open', 'in_progress', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
type Status = (typeof STATUSES)[number];
type Priority = (typeof PRIORITIES)[number];

interface Ticket {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  created_at: string;
  updated_at: string;
}

const selectAll = db.prepare('SELECT * FROM tickets ORDER BY updated_at DESC, id DESC');
const selectOne = db.prepare('SELECT * FROM tickets WHERE id = ?');
const insertTicket = db.prepare(
  'INSERT INTO tickets (title, description, status, priority) VALUES (@title, @description, @status, @priority)'
);
const deleteTicket = db.prepare('DELETE FROM tickets WHERE id = ?');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tickets-api', time: new Date().toISOString() });
});

app.get('/api/tickets', (_req, res) => {
  res.json(selectAll.all() as Ticket[]);
});

app.get('/api/tickets/:id', (req, res) => {
  const ticket = selectOne.get(Number(req.params.id)) as Ticket | undefined;
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json(ticket);
});

app.post('/api/tickets', (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  const description = String(req.body?.description ?? '').trim();
  const status: Status = STATUSES.includes(req.body?.status) ? req.body.status : 'open';
  const priority: Priority = PRIORITIES.includes(req.body?.priority)
    ? req.body.priority
    : 'medium';

  const info = insertTicket.run({ title, description, status, priority });
  res.status(201).json(selectOne.get(Number(info.lastInsertRowid)) as Ticket);
});

app.patch('/api/tickets/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = selectOne.get(id) as Ticket | undefined;
  if (!existing) return res.status(404).json({ error: 'Ticket not found' });

  const next = {
    title: req.body?.title !== undefined ? String(req.body.title).trim() : existing.title,
    description:
      req.body?.description !== undefined
        ? String(req.body.description).trim()
        : existing.description,
    status: STATUSES.includes(req.body?.status) ? req.body.status : existing.status,
    priority: PRIORITIES.includes(req.body?.priority) ? req.body.priority : existing.priority,
  };

  if (!next.title) return res.status(400).json({ error: 'title cannot be empty' });

  db.prepare(
    `UPDATE tickets
     SET title = @title, description = @description, status = @status,
         priority = @priority, updated_at = datetime('now')
     WHERE id = @id`
  ).run({ ...next, id });

  res.json(selectOne.get(id) as Ticket);
});

app.delete('/api/tickets/:id', (req, res) => {
  const info = deleteTicket.run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'Ticket not found' });
  res.status(204).end();
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`tickets-api listening on http://localhost:${port}`);
});
