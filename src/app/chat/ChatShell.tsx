"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { streamChat, type ChatSource } from "@/lib/chat-stream";
import { MarkdownView } from "@/components/MarkdownView";

interface Props {
  userId: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
}

export function ChatShell({ userId: _userId }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: "", sources: [] },
    ];
    setMessages(nextMessages);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages = nextMessages
      .filter((m) => !(m.role === "assistant" && m.content === ""))
      .map((m) => ({ role: m.role, content: m.content }));

    // Index of the empty assistant placeholder we just pushed
    const assistantIdx = nextMessages.length - 1;

    try {
      await streamChat(
        apiMessages,
        {
          onSources: (sources) => {
            setMessages((prev) => {
              const copy = [...prev];
              if (copy[assistantIdx]) copy[assistantIdx] = { ...copy[assistantIdx], sources };
              return copy;
            });
          },
          onToken: (token) => {
            setMessages((prev) => {
              const copy = [...prev];
              if (copy[assistantIdx]) {
                copy[assistantIdx] = {
                  ...copy[assistantIdx],
                  content: copy[assistantIdx].content + token,
                };
              }
              return copy;
            });
          },
          onDone: () => setStreaming(false),
          onError: (err) => {
            console.error(err);
            setStreaming(false);
          },
        },
        controller.signal
      );
    } catch (err) {
      console.error(err);
      setStreaming(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function openNote(noteId: string) {
    router.push(`/notes/${noteId}`);
  }

  return (
    <main className="relative z-10 min-h-dvh flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[var(--paper)]/70 border-b border-[var(--rule)]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] hover:text-[var(--ink)] transition-colors">
            ← Ledger
          </Link>
          <span className="font-editorial text-xl italic">A Conversation</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
            with your notes
          </span>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-12">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-10">
              {messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  streaming={streaming && i === messages.length - 1}
                  onCitationClick={openNote}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="sticky bottom-0 z-20 backdrop-blur-md bg-[var(--paper)]/80 border-t border-[var(--ink)]">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask your notes anything…"
              rows={Math.min(6, Math.max(1, input.split("\n").length))}
              disabled={streaming}
              className="bare-input resize-none font-editorial text-lg py-2 placeholder:italic placeholder:text-[var(--muted)]"
            />
            {streaming ? (
              <button
                onClick={stop}
                className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim()}
                className="font-mono text-[10px] uppercase tracking-widest disabled:opacity-30 flex items-center gap-2 group"
              >
                <span>Send</span>
                <span className="w-6 h-px bg-[var(--ink)] group-hover:w-10 transition-all" />
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  const examples = [
    "What am I worried about this week?",
    "Show me everything I've jotted down about Worktrace testing.",
    "Which ideas have I returned to more than once?",
    "What's on my plate for tomorrow?",
  ];

  return (
    <div className="py-8">
      <h2 className="font-editorial text-5xl leading-tight mb-4 tracking-tightest">
        Ask, and <span className="italic">your notes answer.</span>
      </h2>
      <p className="text-[var(--muted)] mb-10 max-w-xl">
        Citations link back to the source note. If I don't have the information, I'll tell you honestly.
      </p>
      <div className="space-y-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] block mb-4">
          Try asking
        </span>
        {examples.map((ex, i) => (
          <p key={i} className="font-editorial italic text-lg text-[var(--muted)]">
            — {ex}
          </p>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onCitationClick,
}: {
  message: Message;
  streaming: boolean;
  onCitationClick: (noteId: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] block mb-1 text-right">
            You
          </span>
          <div className="font-editorial text-xl leading-snug text-right">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] block mb-2">
        Chief of Staff
      </span>
      {message.content ? (
        <MarkdownView
          markdown={message.content}
          sources={message.sources}
          onCitationClick={onCitationClick}
        />
      ) : streaming ? (
        <div className="flex gap-1 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-pulse [animation-delay:0.2s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] animate-pulse [animation-delay:0.4s]" />
        </div>
      ) : null}

      {streaming && message.content && (
        <span className="inline-block w-2 h-4 bg-[var(--ink)] ml-1 animate-pulse align-middle" />
      )}

      {message.sources && message.sources.length > 0 && !streaming && (
        <div className="mt-6 pt-4 border-t border-[var(--rule)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] block mb-3">
            Sources · {message.sources.length}
          </span>
          <div className="space-y-1.5">
            {message.sources.map((s) => (
              <button
                key={s.index}
                onClick={() => onCitationClick(s.note_id)}
                className="flex items-start gap-3 w-full text-left hover:bg-[var(--rule)]/40 rounded px-2 py-1 -mx-2 transition-colors"
              >
                <span className="font-mono text-[10px] text-[var(--accent)] pt-0.5 w-6 shrink-0">
                  [{s.index}]
                </span>
                <span className="flex-1 min-w-0 text-sm truncate">
                  {s.title || <em className="text-[var(--muted)]">Untitled</em>}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] shrink-0">
                  {s.type}
                </span>
                <span className="font-mono text-[10px] text-[var(--muted)] shrink-0 tabular-nums">
                  {s.score.toFixed(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
