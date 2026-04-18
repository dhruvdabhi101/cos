"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/db/dexie";
import { registerSyncListeners } from "@/lib/db/sync";
import { createClient } from "@/lib/supabase/client";
import { CaptureModal } from "@/components/CaptureModal";
import { NotesList } from "@/components/NotesList";

interface Props {
  userId: string;
  email: string;
}

export function HomeShell({ userId, email }: Props) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [initialText, setInitialText] = useState<string | undefined>(undefined);
  const [online, setOnline] = useState(true);

  // Sync on mount + online events
  useEffect(() => {
    const cleanup = registerSyncListeners(userId);
    return cleanup;
  }, [userId]);

  // Online/offline indicator
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Open on Cmd/Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCaptureOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openCaptureWith = useCallback((text?: string) => {
    setInitialText(text);
    setCaptureOpen(true);
  }, []);

  const closeCapture = useCallback(() => {
    setCaptureOpen(false);
    setInitialText(undefined);
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function exportAll() {
    const notes = await db.notes
      .where("[user_id+deleted]")
      .equals([userId, 0])
      .reverse()
      .sortBy("updated_at");

    if (notes.length === 0) {
      alert("Nothing to export yet.");
      return;
    }

    const lines: string[] = [
      `# Chief of Staff — Export`,
      ``,
      `_Generated ${new Date().toISOString()} · ${notes.length} note${notes.length === 1 ? "" : "s"}_`,
      ``,
      `---`,
      ``,
    ];

    for (const n of notes) {
      lines.push(`## ${n.title || "Untitled"}`);
      lines.push(``);
      const meta = [
        `type: ${n.type}`,
        `created: ${n.created_at}`,
        `updated: ${n.updated_at}`,
        n.remind_at ? `remind_at: ${n.remind_at}` : null,
      ].filter(Boolean).join(" · ");
      lines.push(`_${meta}_`);
      lines.push(``);
      lines.push(n.content_md || "");
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `chief-of-staff-export-${stamp}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="relative z-10 min-h-dvh">
      <Suspense fallback={null}>
        <UrlCaptureHandler onCapture={openCaptureWith} />
      </Suspense>
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[var(--paper)]/70 border-b border-[var(--rule)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="font-editorial text-xl">Chief <span className="italic">of</span> Staff</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
              {online ? "online" : "offline · queued"}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link
              href="/chat"
              className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest hover:text-[var(--accent)] transition-colors"
            >
              <span>Chat</span>
              <span className="w-4 h-px bg-current group-hover:w-6 transition-all" />
            </Link>
            <button
              onClick={() => setCaptureOpen(true)}
              className="group flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest"
            >
              <span>Capture</span>
              <kbd className="px-1.5 py-0.5 border border-[var(--rule)] rounded-sm text-[9px]">⌘K</kbd>
            </button>
            <button
              onClick={exportAll}
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              title="Download all notes as Markdown"
            >
              Export
            </button>
            <button
              onClick={signOut}
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              title={email}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-10">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            The Daily Ledger
          </span>
        </div>
        <div className="h-px bg-[var(--ink)] mb-8" />
        <h1 className="font-editorial text-5xl sm:text-7xl leading-[0.9] tracking-tightest">
          Today in <br />
          <span className="italic">your head.</span>
        </h1>
      </section>

      {/* Notes list */}
      <section className="max-w-3xl mx-auto px-6 pb-32">
        <NotesList userId={userId} />
      </section>

      {/* Floating capture button (mobile-friendly) */}
      <button
        onClick={() => setCaptureOpen(true)}
        aria-label="Capture"
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-[var(--ink)] text-[var(--paper)] shadow-lg hover:scale-105 transition-transform flex items-center justify-center font-editorial text-2xl"
      >
        +
      </button>

      <CaptureModal
        userId={userId}
        open={captureOpen}
        onClose={closeCapture}
        initialText={initialText}
      />
    </main>
  );
}

function UrlCaptureHandler({ onCapture }: { onCapture: (text?: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (params.get("capture") === "1") {
      const shared = [params.get("title"), params.get("text"), params.get("url")]
        .filter(Boolean)
        .join("\n");
      onCapture(shared || undefined);
      router.replace("/");
    }
  }, [params, router, onCapture]);

  return null;
}
