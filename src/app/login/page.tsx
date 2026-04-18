"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const nextPath = params.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      if (error) setError(error.message);
      else setSent(true);
    });
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6 relative z-10">
      <div className="w-full max-w-md">
        <div className="flex items-baseline justify-between mb-16">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
            № 001
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
            Est. 2026
          </span>
        </div>

        <h1 className="font-editorial text-6xl leading-[0.95] mb-2">
          Chief <span className="italic">of</span> Staff
        </h1>
        <div className="h-px bg-[var(--rule)] my-6" />
        <p className="text-[var(--muted)] text-sm mb-12 max-w-xs leading-relaxed">
          A quiet place for thoughts, reminders, and the connections between them.
        </p>

        {sent ? (
          <div className="animate-fade-in">
            <p className="font-editorial text-2xl italic mb-3">Check your inbox.</p>
            <p className="text-sm text-[var(--muted)]">
              A sign-in link is on its way to <span className="text-[var(--ink)] font-mono text-xs">{email}</span>.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--muted)] block mb-3">
                Email address
              </span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="bare-input border-b border-[var(--rule)] pb-2 text-lg focus:border-[var(--accent)] transition-colors"
              />
            </label>

            {error && (
              <p className="font-mono text-xs text-[var(--accent)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={pending || !email}
              className="group flex items-center gap-3 text-sm font-medium disabled:opacity-50"
            >
              <span className="w-8 h-px bg-[var(--ink)] group-hover:w-12 transition-all" />
              <span className="uppercase tracking-widest text-xs font-mono">
                {pending ? "Sending…" : "Send magic link"}
              </span>
            </button>
          </form>
        )}

        <div className="fixed bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">
          <span>Local-first · offline-ready</span>
          <span>v0.1</span>
        </div>
      </div>
    </main>
  );
}
