-- ============================================================
-- Chief of Staff — initial schema
-- Run in Supabase SQL Editor, or via `supabase db push` if you
-- set up the CLI. pgvector must be enabled in Database > Extensions.
-- ============================================================

create extension if not exists "vector";
create extension if not exists "pgcrypto";

-- -----------------------------
-- notes: source of truth
-- -----------------------------
create table public.notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type          text not null check (type in ('note','reminder','fleeting')) default 'fleeting',
  title         text,
  content_md    text not null default '',
  content_json  jsonb,                 -- optional: TipTap doc for editor rehydration
  remind_at     timestamptz,           -- null for non-reminders
  reminder_status text check (reminder_status in ('pending','fired','snoozed','done')),
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index notes_user_id_idx        on public.notes (user_id);
create index notes_user_updated_idx   on public.notes (user_id, updated_at desc);
create index notes_reminder_due_idx   on public.notes (reminder_status, remind_at)
  where type = 'reminder' and reminder_status = 'pending';

-- -----------------------------
-- note_chunks: embeddings for RAG + auto-linking
-- -----------------------------
create table public.note_chunks (
  id           uuid primary key default gen_random_uuid(),
  note_id      uuid not null references public.notes(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  chunk_index  integer not null,
  chunk_text   text not null,
  embedding    vector(1536),           -- OpenAI text-embedding-3-small
  created_at   timestamptz not null default now(),
  unique (note_id, chunk_index)
);

create index note_chunks_note_id_idx on public.note_chunks (note_id);
create index note_chunks_user_id_idx on public.note_chunks (user_id);
-- HNSW for fast ANN search. Cosine distance matches OpenAI embeddings.
create index note_chunks_embedding_idx on public.note_chunks
  using hnsw (embedding vector_cosine_ops);

-- -----------------------------
-- links: note graph (manual + suggested)
-- -----------------------------
create table public.links (
  from_note_id uuid not null references public.notes(id) on delete cascade,
  to_note_id   uuid not null references public.notes(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('manual','suggested','accepted')),
  score        real,
  created_at   timestamptz not null default now(),
  primary key (from_note_id, to_note_id)
);

create index links_user_id_idx on public.links (user_id);

-- -----------------------------
-- tags
-- -----------------------------
create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.note_tags (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

-- -----------------------------
-- updated_at trigger
-- -----------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end; $$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- Row Level Security — every table filtered by user_id
-- ============================================================
alter table public.notes       enable row level security;
alter table public.note_chunks enable row level security;
alter table public.links       enable row level security;
alter table public.tags        enable row level security;
alter table public.note_tags   enable row level security;

create policy "notes: owner only" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "note_chunks: owner only" on public.note_chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "links: owner only" on public.links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tags: owner only" on public.tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "note_tags: via parent note" on public.note_tags
  for all using (
    exists (select 1 from public.notes n
            where n.id = note_tags.note_id and n.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.notes n
            where n.id = note_tags.note_id and n.user_id = auth.uid())
  );

-- ============================================================
-- RPC: vector search used by chat + auto-linking (week 2/3)
-- ============================================================
create or replace function public.match_note_chunks(
  query_embedding vector(1536),
  match_count int default 15,
  min_score real default 0.0,
  exclude_note_id uuid default null
)
returns table (
  note_id uuid,
  chunk_index int,
  chunk_text text,
  score real
)
language sql stable
as $$
  select
    nc.note_id,
    nc.chunk_index,
    nc.chunk_text,
    (1 - (nc.embedding <=> query_embedding))::real as score
  from public.note_chunks nc
  where nc.user_id = auth.uid()
    and (exclude_note_id is null or nc.note_id <> exclude_note_id)
    and (1 - (nc.embedding <=> query_embedding)) >= min_score
  order by nc.embedding <=> query_embedding
  limit match_count;
$$;
