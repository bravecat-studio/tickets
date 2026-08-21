export type Status = 'open' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  created_at: string;
  updated_at: string;
}

export interface NewTicket {
  title: string;
  description: string;
  priority: Priority;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  list: () => fetch('/api/tickets').then((r) => handle<Ticket[]>(r)),
  create: (t: NewTicket) =>
    fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    }).then((r) => handle<Ticket>(r)),
  update: (id: number, patch: Partial<Ticket>) =>
    fetch(`/api/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => handle<Ticket>(r)),
  remove: (id: number) =>
    fetch(`/api/tickets/${id}`, { method: 'DELETE' }).then((r) => handle<void>(r)),
};
