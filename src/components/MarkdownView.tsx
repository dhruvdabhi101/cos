"use client";

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { ChatSource } from "@/lib/chat-stream";

interface Props {
  markdown: string;
  sources?: ChatSource[];
  onCitationClick?: (noteId: string) => void;
}

// Configure marked once, module-scoped
marked.setOptions({
  breaks: true,
  gfm: true,
});

export function MarkdownView({ markdown, sources = [], onCitationClick }: Props) {
  const html = useMemo(() => {
    // Replace [N] citations with clickable spans BEFORE markdown parsing
    // (so marked doesn't treat them as link syntax)
    const citationRegex = /\[(\d+)\]/g;
    const withCitations = markdown.replace(citationRegex, (match, n) => {
      const idx = parseInt(n, 10);
      const src = sources.find((s) => s.index === idx);
      if (!src) return match;
      return `<cite data-note-id="${src.note_id}" data-index="${idx}">[${idx}]</cite>`;
    });

    const raw = marked.parse(withCitations) as string;
    // Allow our custom <cite> tag
    return DOMPurify.sanitize(raw, {
      ADD_TAGS: ["cite"],
      ADD_ATTR: ["data-note-id", "data-index"],
    });
  }, [markdown, sources]);

  function handleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === "CITE" && target.dataset.noteId) {
      e.preventDefault();
      onCitationClick?.(target.dataset.noteId);
    }
  }

  return (
    <div
      className="prose-cos"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
