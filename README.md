# VibeCheck Backend

Node.js API for **VibeCheck**, a party discovery app. Built with **Fastify** and **Supabase** (PostgreSQL).

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- A [Supabase](https://supabase.com/) project

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy the example env file and fill in your project values from Supabase → **Project Settings** → **API**:

```bash
copy .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

Edit `.env`:

- `SUPABASE_URL` — Project URL
- `SUPABASE_ANON_KEY` — `anon` `public` key

The server uses the anon key with Row Level Security policies defined in `supabase/schema.sql`. For production, consider using the **service role** key only on the server and tightening RLS.

### 3. Database schema

In the Supabase dashboard, open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it. That creates `users`, `events`, `checkins`, and `snaps` plus indexes and RLS policies.

Seed data (optional): insert rows into `users` and `events` so you can test check-ins and snaps.

## Run

**Development** (restarts on file changes, Node 18+):

```bash
npm run dev
```

**Production**:

```bash
npm start
```

By default the server listens on `http://0.0.0.0:3000`. Override with `PORT` and `HOST` in `.env` if needed.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/events?city=Curitiba` | List events; optional `city` filter (case-insensitive partial match) |
| GET | `/events/:id/snaps` | Snaps for an event that are not expired |
| POST | `/checkin` | Body: `{ "user_id": "<uuid>", "event_id": "<uuid>" }` |
| POST | `/snap` | Body: `{ "user_id", "event_id", "photo_url" }` — sets `expires_at` to now + 24h |
| PUT | `/user/location` | Body: `{ "user_id": "<uuid>", "city": "Curitiba" }` |

All JSON bodies use `Content-Type: application/json`.

`@fastify/multipart` is registered for future file uploads (e.g. direct photo uploads).

## Project layout

```
src/
  index.js          # Fastify app entry
  db/supabase.js    # Supabase client
  routes/           # Route plugins
supabase/
  schema.sql        # Tables, indexes, RLS
```
