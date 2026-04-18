export interface ChatSource {
  index: number;
  note_id: string;
  title: string | null;
  type: string | null;
  score: number;
}

export interface StreamHandlers {
  onSources: (sources: ChatSource[]) => void;
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onToolCalls?: (calls: { name: string }[]) => void;
}

export async function streamChat(
  messages: { role: "user" | "assistant"; content: string }[],
  handlers: StreamHandlers,
  signal?: AbortSignal
) {
  // Send the user's local date + tz so the server can resolve "today" correctly.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const clientDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, clientDate, clientTz: tz }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    handlers.onError(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE messages: each separated by \n\n
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const evt of events) {
      if (!evt.trim()) continue;
      const lines = evt.split("\n");
      let name = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) name = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }

      try {
        if (name === "sources") handlers.onSources(JSON.parse(data));
        else if (name === "token") handlers.onToken(JSON.parse(data));
        else if (name === "done") handlers.onDone();
        else if (name === "error") handlers.onError(JSON.parse(data));
        else if (name === "tool_calls") handlers.onToolCalls?.(JSON.parse(data));
      } catch (e) {
        console.error("[stream] parse error:", e, data);
      }
    }
  }
}
