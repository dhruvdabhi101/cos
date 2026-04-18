"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { db } from "@/lib/db/dexie";
import type { LocalNote, NoteType } from "@/lib/types";

interface Props {
  userId: string;
}

const TYPE_LABEL: Record<NoteType, string> = {
  reminder: "Reminders",
  note: "Notes",
  fleeting: "Fleeting",
};

const TYPE_ORDER: NoteType[] = ["reminder", "note", "fleeting"];

export function NotesList({ userId }: Props) {
  const notes = useLiveQuery(
    async () =>
      db.notes
        .where("[user_id+deleted]")
        .equals([userId, 0])
        .reverse()
        .sortBy("updated_at"),
    [userId]
  );

  if (!notes) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
        Loading…
      </p>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-editorial italic text-2xl text-[var(--muted)] mb-3">
          Nothing yet.
        </p>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
          Press <kbd className="mx-1 px-1.5 py-0.5 border border-[var(--rule)] rounded-sm">⌘K</kbd> to capture
        </p>
      </div>
    );
  }

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: notes.filter((n) => n.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-14">
      {grouped.map((group) => (
        <section key={group.type}>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-editorial text-3xl italic">{TYPE_LABEL[group.type]}</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
              {group.items.length.toString().padStart(2, "0")}
            </span>
          </div>
          <div className="border-t border-[var(--ink)]">
            {group.items.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function NoteRow({ note }: { note: LocalNote }) {
  const preview = note.content_md.slice(0, 200);
  const isLongerThanPreview = note.content_md.length > preview.length;

  return (
    <Link
      href={`/notes/${note.id}`}
      className="group border-b border-[var(--rule)] py-5 flex gap-6 hover:bg-[var(--rule)]/20 transition-colors px-2 -mx-2"
    >
      <div className="shrink-0 w-20 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] pt-1">
        {formatTime(note.updated_at)}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-editorial text-lg leading-tight mb-1">
          {note.title || "Untitled"}
        </h3>
        {preview && preview !== note.title && (
          <p className="text-sm text-[var(--muted)] leading-relaxed line-clamp-2">
            {preview}
            {isLongerThanPreview && "…"}
          </p>
        )}
        {note.type === "reminder" && note.remind_at && (
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
            <span className="text-[var(--accent)]">
              {formatReminder(note.remind_at)}
            </span>
          </div>
        )}
      </div>
      {note.dirty === 1 && (
        <div
          title="Not yet synced"
          className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] self-start mt-2 animate-pulse"
        />
      )}
    </Link>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatReminder(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffHrs < 0) return `Overdue · ${d.toLocaleString(undefined, { month: "short", day: "numeric" })}`;
  if (diffHrs < 24) {
    return `Today · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  if (diffHrs < 48) {
    return `Tomorrow · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
