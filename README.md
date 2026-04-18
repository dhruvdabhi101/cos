# Chief of Staff

A personal thinking system. Capture thoughts, get reminders, chat with your own notes.
Local-first (IndexedDB) with cloud sync (Supabase). PWA-installable.

## Phase 1 — what's working

- **Auth**: Supabase magic-link login, RLS isolation per user
- **Capture**: `⌘K` hotkey, PWA share-target, floating `+` button
- **Classification**: chrono-node fast path + `gpt-4o` fallback → note / reminder / fleeting
- **Local-first**: saves to Dexie instantly, syncs to Supabase every 30s + on reconnect
- **PWA**: installable, offline-capable, service worker caches the shell

## Setup

### 1. Supabase project

1. Create a new project at [supabase.com](https://supabase.com)
2. In **Database → Extensions**, enable `vector`
3. In **SQL Editor**, run `supabase/migrations/0001_init.sql`
4. In **Authentication → Providers**, enable **Email** (magic link)
5. Copy the URL + anon key + service role key into `.env.local`

### 2. OpenAI

Grab a key from [platform.openai.com](https://platform.openai.com) and add it to `.env.local`.

### 3. Install + run

```bash
cp .env.example .env.local  # fill in values
npm install
npm run dev
```

Open `http://localhost:3000`, sign in with your email, start capturing.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Browser (PWA, offline-capable)                  │
│ ┌─────────────┐  ┌────────────┐  ┌───────────┐  │
│ │ CaptureModal│→ │ Dexie (IDB)│← │ Sync loop │  │
│ └─────────────┘  └────────────┘  └───────────┘  │
│        │                              │         │
│        └──→ /api/classify             │         │
└───────────────┼───────────────────────┼─────────┘
                │                       │
                ▼                       ▼
         ┌──────────────┐       ┌──────────────┐
         │ OpenAI GPT-4o│       │  Supabase    │
         │ (classify)   │       │  (Postgres)  │
         └──────────────┘       │  + pgvector  │
                                │  + RLS       │
                                └──────────────┘
```

**Capture flow:**
1. User types, presses ⌘↵
2. Dexie write (<5ms) — UI updates immediately, type = "fleeting"
3. `/api/classify` called in parallel
4. When classification returns, Dexie row is patched with real type + title + `remind_at`
5. Background sync pushes the dirty row to Supabase

**Why client-generated UUIDs?** So offline captures have stable IDs and can be referenced
(e.g. by links) before they ever hit the server.

**Why `chrono-node` fast path?** ~60% of reminders have explicit time language
("tomorrow at 3pm"). Parsing locally saves a 300-800ms LLM round-trip on those.

## Phase 2 (next)

- [ ] Embeddings pipeline (chunk note → `text-embedding-3-small` → `note_chunks`)
- [ ] `/chat` route with `gpt-5` + RAG + citations
- [ ] TipTap editor for full note editing
- [ ] Web push notifications for reminders (requires PWA install on iOS)

## Phase 3

- [ ] Auto-linking (pgvector similarity on save, accept/dismiss UI)
- [ ] Tags + graph view
- [ ] Markdown export

## Files to know

| Path | Purpose |
|---|---|
| `src/lib/db/dexie.ts` | Local IDB schema |
| `src/lib/db/sync.ts` | Push/pull reconciler |
| `src/lib/classify.ts` | chrono + GPT-4o classifier |
| `src/hooks/useCapture.ts` | The main capture flow |
| `src/app/HomeShell.tsx` | Home UI + hotkey + share target wiring |
| `supabase/migrations/0001_init.sql` | Full DB schema with RLS |
