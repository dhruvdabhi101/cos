"use client";

import { useEffect, useRef, useState } from "react";
import { useCapture } from "@/hooks/useCapture";

interface Props {
  userId: string;
  open: boolean;
  onClose: () => void;
  initialText?: string;
}

export function CaptureModal({ userId, open, onClose, initialText }: Props) {
  const { capture } = useCapture(userId);
  const [text, setText] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus on open
  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Seed with share-target text if present
  useEffect(() => {
    if (open && initialText) setText(initialText);
  }, [open, initialText]);

  // Keyboard handlers
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    await capture(text);
    setSaving(false);
    setText("");
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1400);
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 animate-fade-in"
      onClick={onClose}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-[var(--paper)]/80 backdrop-blur-xl" />

      <div
        className="relative w-full max-w-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4 px-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            Capture a thought
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        <div className="border-t-2 border-b border-[var(--ink)] bg-[var(--paper)] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)]">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What's on your mind? Say 'remind me tomorrow at 9am to …' and I'll pick up on the time."
            rows={6}
            className="bare-input resize-none p-6 font-editorial text-2xl leading-snug placeholder:text-[var(--muted)] placeholder:italic placeholder:font-editorial placeholder:text-xl"
          />
          <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--rule)]">
            <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--muted)]">
              <kbd className="px-1.5 py-0.5 border border-[var(--rule)] rounded-sm">Esc</kbd>
              <span>close</span>
              <span className="opacity-40">·</span>
              <kbd className="px-1.5 py-0.5 border border-[var(--rule)] rounded-sm">⌘ ↵</kbd>
              <span>save</span>
            </div>
            <button
              onClick={save}
              disabled={!text.trim() || saving}
              className="group flex items-center gap-2 text-xs font-mono uppercase tracking-widest disabled:opacity-30"
            >
              <span className="transition-all">
                {justSaved ? "Saved ✓" : saving ? "Saving…" : "Save"}
              </span>
              <span className="w-6 h-px bg-[var(--ink)] group-hover:w-10 transition-all" />
            </button>
          </div>
        </div>

        <p className="mt-4 px-1 text-[11px] text-[var(--muted)] font-mono tracking-wide">
          Captured locally first. Classification happens in the background.
        </p>
      </div>
    </div>
  );
}
