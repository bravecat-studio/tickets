# tickets

A tiny full-stack **ticket tracker**: an Express + SQLite REST API and a React + Vite kanban UI.

## Stack

- **server/** — Node.js, Express, `better-sqlite3` (file-based SQLite), TypeScript. REST API for tickets.
- **client/** — React 18, Vite, TypeScript. Kanban board (Open / In Progress / Done) with create, move, and delete.

The project uses **npm workspaces**, so a single `npm install` at the root sets up both packages.

## Getting started

```bash
npm install        # install workspace dependencies
npm run dev:server # start the API on http://localhost:3001
npm run dev:client # start the UI on http://localhost:5173 (in another terminal)
```

Then open http://localhost:5173. The Vite dev server proxies `/api/*` to the API.

Useful scripts:

| Command | Description |
| --- | --- |
| `npm run dev:server` | Run the API in watch mode (port `3001`). |
| `npm run dev:client` | Run the Vite dev server (port `5173`). |
| `npm run build` | Type-check + build both packages. |
| `npm run typecheck` | Type-check both packages. |
| `npm run start` | Run the compiled API (`server/dist`). |

## API

Base URL: `http://localhost:3001`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. |
| `GET` | `/api/tickets` | List tickets. |
| `GET` | `/api/tickets/:id` | Get one ticket. |
| `POST` | `/api/tickets` | Create a ticket (`title`, `description?`, `status?`, `priority?`). |
| `PATCH` | `/api/tickets/:id` | Update a ticket. |
| `DELETE` | `/api/tickets/:id` | Delete a ticket. |

`status` is one of `open`, `in_progress`, `done`; `priority` is one of `low`, `medium`, `high`.

The SQLite database is created at `server/data/tickets.db` on first run and seeded with a few example tickets.

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm install` and starts two terminals: `api` (`npm run dev:server`) and `web` (`npm run dev:client`), exposing ports `3001` and `5173`.
