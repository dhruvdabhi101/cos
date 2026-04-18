"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db/dexie";
import { syncNow } from "@/lib/db/sync";
import { MarkdownView } from "@/components/MarkdownView";
import type { LocalNote, Note, NoteType } from "@/lib/types";

interface Props {
  userId: string;
  note: Note;
}

export function NoteEditor({ userId, note: serverNote }: Props) {
  const router = useRouter();

  // Seed local state from server; Dexie will have the latest if there's a newer local edit
  const [title, setTitle] = useState(serverNote.title ?? "");
  const [body, setBody] = useState(serverNote.content_md);
  const [type, setType] = useState<NoteType>(serverNote.type);
  const [remindAt, setRemindAt] = useState<string | null>(serverNote.remind_at);
  const [mode, setMode] = useState<"edit" | "split" | "preview">("split");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const embedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  // Load local override if more recent
  useEffect(() => {
    (async () => {
      const local = await db.notes.get(serverNote.id);
      if (local && local.version > serverNote.version) {
        setTitle(local.title ?? "");
        setBody(local.content_md);
        setType(local.type);
        setRemindAt(local.remind_at);
      } else {
        // Seed Dexie with server version
        const seed: LocalNote = { ...serverNote, dirty: 0, deleted: 0 };
        await db.notes.put(seed);
      }
    })();
  }, [serverNote]);

  const persist = useCallback(async () => {
    const existing = await db.notes.get(serverNote.id);
    if (!existing) return;

    const patched: LocalNote = {
      ...existing,
      title: title.trim() || null,
      content_md: body,
      type,
      remind_at: type === "reminder" ? remindAt : null,
      reminder_status: type === "reminder" ? existing.reminder_status ?? "pending" : null,
      updated_at: new Date().toISOString(),
      version: existing.version + 1,
      dirty: 1,
    };
    await db.notes.put(patched);
    setSavedAt(new Date());
    dirtyRef.current = false;

    // Sync to server
    syncNow(userId).catch(console.error);

    // Debounced re-embed (don't spam the API mid-typing)
    if (embedDebounceRef.current) clearTimeout(embedDebounceRef.current);
    embedDebounceRef.current = setTimeout(() => {
      fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: serverNote.id }),
      }).catch((e) => console.error("[editor] embed failed:", e));
    }, 2500);
  }, [userId, serverNote.id, title, body, type, remindAt]);

  // Debounced autosave on edits
  useEffect(() => {
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persist();
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, type, remindAt]);

  // Flush on unload
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) persist();
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [persist]);

  async function del() {
    if (!confirm("Delete this note permanently?")) return;
    const existing = await db.notes.get(serverNote.id);
    if (existing) await db.notes.put({ ...existing, deleted: 1, dirty: 1 });
    await syncNow(userId).catch(console.error);
    router.push("/");
  }

  function copyMarkdown() {
    const md = title ? `# ${title}\n\n${body}` : body;
    navigator.clipboard.writeText(md);
  }

  function downloadMarkdown() {
    const md = title ? `# ${title}\n\n${body}` : body;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "note").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="relative z-10 min-h-dvh flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[var(--paper)]/70 border-b border-[var(--rule)]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] hover:text-[var(--ink)] transition-colors shrink-0">
            ← Ledger
          </Link>

          <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--muted)]">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NoteType)}
              className="bg-transparent border border-[var(--rule)] px-2 py-1 rounded-sm uppercase tracking-widest text-[10px]"
            >
              <option value="note">Note</option>
              <option value="reminder">Reminder</option>
              <option value="fleeting">Fleeting</option>
            </select>
            {type === "reminder" && (
              <input
                type="datetime-local"
                value={remindAt ? toLocalInput(remindAt) : ""}
                onChange={(e) =>
                  setRemindAt(e.target.value ? new Date(e.target.value).toISOString() : null)
                }
                className="bg-transparent border border-[var(--rule)] px-2 py-1 rounded-sm text-[10px]"
              />
            )}
            {savedAt && <span>Saved {formatRelative(savedAt)}</span>}
          </div>

          <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.15em]">
            {(["edit", "split", "preview"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-1 rounded-sm transition-colors ${
                  mode === m
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Editor */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="bare-input font-editorial text-4xl md:text-5xl tracking-tightest mb-6 placeholder:text-[var(--muted)] placeholder:italic"
        />
        <div className={`grid gap-8 ${mode === "split" ? "md:grid-cols-2" : "grid-cols-1"}`}>
          {(mode === "edit" || mode === "split") && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-3 flex items-center gap-2">
                <span>Markdown</span>
                <span className="flex-1 h-px bg-[var(--rule)]" />
              </div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Start writing — it's just Markdown."
                className="bare-input resize-none font-mono text-sm leading-relaxed min-h-[60vh] placeholder:text-[var(--muted)]"
              />
            </div>
          )}
          {(mode === "preview" || mode === "split") && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] mb-3 flex items-center gap-2">
                <span>Preview</span>
                <span className="flex-1 h-px bg-[var(--rule)]" />
              </div>
              <MarkdownView markdown={body || "*Nothing yet.*"} />
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 z-20 backdrop-blur-md bg-[var(--paper)]/80 border-t border-[var(--rule)]">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.15em]">
          <div className="flex items-center gap-4">
            <button onClick={copyMarkdown} className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors">
              Copy .md
            </button>
            <button onClick={downloadMarkdown} className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors">
              Download .md
            </button>
          </div>
          <button onClick={del} className="text-[var(--accent)] hover:underline">
            Delete
          </button>
        </div>
      </div>
    </main>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelative(d: Date) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
