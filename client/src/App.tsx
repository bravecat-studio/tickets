import { useEffect, useMemo, useState } from 'react';
import { api, Priority, Status, Ticket } from './api';

const COLUMNS: { key: Status; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

const STATUS_ORDER: Status[] = ['open', 'in_progress', 'done'];

function nextStatus(s: Status, dir: 1 | -1): Status {
  const i = STATUS_ORDER.indexOf(s);
  const next = Math.min(STATUS_ORDER.length - 1, Math.max(0, i + dir));
  return STATUS_ORDER[next];
}

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    try {
      setTickets(await api.list());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await api.create({ title: title.trim(), description: description.trim(), priority });
      setTickets((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function move(t: Ticket, dir: 1 | -1) {
    const status = nextStatus(t.status, dir);
    if (status === t.status) return;
    const updated = await api.update(t.id, { status });
    setTickets((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
  }

  async function remove(t: Ticket) {
    await api.remove(t.id);
    setTickets((prev) => prev.filter((x) => x.id !== t.id));
  }

  const grouped = useMemo(() => {
    const map: Record<Status, Ticket[]> = { open: [], in_progress: [], done: [] };
    for (const t of tickets) map[t.status].push(t);
    return map;
  }, [tickets]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Tickets</h1>
          <p className="app__subtitle">A tiny ticket tracker — {tickets.length} total</p>
        </div>
      </header>

      <form className="new-ticket" onSubmit={handleCreate}>
        <input
          className="new-ticket__title"
          placeholder="New ticket title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Ticket title"
        />
        <input
          className="new-ticket__desc"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Ticket description"
        />
        <select
          className="new-ticket__priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          aria-label="Priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" type="submit" disabled={!title.trim() || submitting}>
          Add ticket
        </button>
      </form>

      {error && <div className="banner banner--error">{error}</div>}
      {loading ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="board">
          {COLUMNS.map((col) => (
            <section key={col.key} className="column">
              <div className="column__header">
                <span>{col.label}</span>
                <span className="column__count">{grouped[col.key].length}</span>
              </div>
              <div className="column__body">
                {grouped[col.key].length === 0 && <div className="empty empty--small">No tickets</div>}
                {grouped[col.key].map((t) => (
                  <article key={t.id} className={`card card--${t.priority}`}>
                    <div className="card__top">
                      <span className={`badge badge--${t.priority}`}>{t.priority}</span>
                      <span className="card__id">#{t.id}</span>
                    </div>
                    <h3 className="card__title">{t.title}</h3>
                    {t.description && <p className="card__desc">{t.description}</p>}
                    <div className="card__actions">
                      <button
                        className="btn btn--ghost"
                        onClick={() => move(t, -1)}
                        disabled={t.status === 'open'}
                        title="Move left"
                      >
                        ←
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => move(t, 1)}
                        disabled={t.status === 'done'}
                        title="Move right"
                      >
                        →
                      </button>
                      <button
                        className="btn btn--danger"
                        onClick={() => remove(t)}
                        title="Delete ticket"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
