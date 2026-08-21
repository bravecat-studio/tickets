import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH ?? path.join(dataDir, 'tickets.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const { c: count } = db
  .prepare('SELECT COUNT(*) AS c FROM tickets')
  .get() as { c: number };

if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO tickets (title, description, status, priority) VALUES (?, ?, ?, ?)'
  );
  const seed: Array<[string, string, string, string]> = [
    ['Set up CI pipeline', 'Add GitHub Actions to run lint and tests on every PR.', 'in_progress', 'high'],
    ['Design login screen', 'Modern, accessible login form with email + password.', 'open', 'medium'],
    ['Fix pagination bug', 'Last page shows duplicate rows when filtering by status.', 'open', 'high'],
    ['Write onboarding docs', 'Explain how to run the app locally end to end.', 'done', 'low'],
    ['Add dark mode toggle', 'Persist preference in local storage.', 'open', 'low'],
  ];
  const seedAll = db.transaction(() => {
    for (const row of seed) insert.run(...row);
  });
  seedAll();
}
