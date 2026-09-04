import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  Mail,
  NotebookPen,
  RotateCcw,
  SendHorizontal,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WorkMate — AI Email & Meeting Notes Assistant" },
      {
        name: "description",
        content:
          "WorkMate drafts professional emails and turns raw meeting notes into clear summaries. Chat with your AI workplace productivity assistant.",
      },
      { property: "og:title", content: "WorkMate — AI Workplace Assistant" },
      {
        property: "og:description",
        content:
          "Draft professional emails and summarize meeting notes with WorkMate, your AI workplace productivity assistant.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkMate,
});

const STORAGE_KEY = "workmate:conversation";
const TRANSPORT = new DefaultChatTransport({ api: "/api/chat" });

const TASK_STARTERS = [
  {
    icon: Mail,
    label: "Draft an email",
    hint: "Follow-ups, requests, updates — matched to your audience and tone.",
    message: "I need help drafting an email.",
  },
  {
    icon: NotebookPen,
    label: "Summarize meeting notes",
    hint: "Paste raw notes and get decisions, action items, and open questions.",
    message: "I need help summarizing meeting notes.",
  },
];

function WorkMate() {
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, setMessages, status } = useChat({
    id: "workmate",
    transport: TRANSPORT,
    onError: (error) => {
      toast.error("WorkMate couldn't respond", {
        description: error.message || "Please try again in a moment.",
      });
    },
  });

  // Restore the single conversation from this browser (after hydration).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      // Corrupted history — start fresh.
    }
    setRestored(true);
  }, [setMessages]);

  // Persist whenever a turn completes (or fails) — not on every stream chunk.
  useEffect(() => {
    if (status !== "ready" && status !== "error") return;
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage full or unavailable — the chat still works, just isn't saved.
    }
  }, [messages, status]);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Focus the composer on mount, after sending, and after each reply.
  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status]);

  const busy = status === "submitted" || status === "streaming";

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    sendMessage({ text: trimmed });
  };

  const handleNewChat = () => {
    if (busy) return;
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    toast("Started a new conversation");
  };

  const showWelcome = restored && messages.length === 0;

  return (
    <div className="bg-paper flex h-dvh flex-col">
      <Header messages={messages.length} busy={busy} onNewChat={handleNewChat} />

      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
          {showWelcome ? (
            <Welcome onPick={handleSend} />
          ) : (
            <div className="flex flex-col gap-5 py-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {status === "submitted" && <TypingIndicator />}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/70 bg-card/80 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-4 sm:px-6">
          <Composer
            value={input}
            busy={busy}
            onChange={setInput}
            onSubmit={handleSend}
            textareaRef={textareaRef}
          />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            WorkMate can make mistakes — review drafts and summaries before
            sending or sharing them.
          </p>
        </div>
      </div>
    </div>
  );
}

function Header({
  messages,
  busy,
  onNewChat,
}: {
  messages: number;
  busy: boolean;
  onNewChat: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-2xl leading-none tracking-tight">
            WorkMate
          </span>
          <span className="hidden rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-accent-foreground sm:inline-block">
            AI workplace assistant
          </span>
        </div>
        {messages > 0 && (
          <button
            type="button"
            onClick={onNewChat}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" />
            New chat
          </button>
        )}
      </div>
    </header>
  );
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center pb-8 pt-14 text-center sm:pt-20">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="size-5" />
      </div>
      <h1 className="font-display mt-6 max-w-xl text-balance text-4xl leading-tight tracking-tight sm:text-5xl">
        Hello — I'm WorkMate. What are we working on today?
      </h1>
      <p className="mt-4 max-w-md text-pretty text-muted-foreground">
        I can draft professional emails or turn your raw meeting notes into a
        clear, structured summary.
      </p>
      <div className="mt-9 grid w-full max-w-lg gap-3 sm:grid-cols-2">
        {TASK_STARTERS.map((task) => (
          <button
            key={task.label}
            type="button"
            onClick={() => onPick(task.message)}
            className="group rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          >
            <task.icon className="size-5 text-primary" />
            <div className="mt-3 text-sm font-semibold">{task.label}</div>
            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {task.hint}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");

  if (!text) return null;

  return (
    <div
      className={`message-enter flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <span className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {isUser ? "You" : "WorkMate"}
      </span>
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-bubble-user px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-bubble-user-foreground">
          {text}
        </div>
      ) : (
        <div className="message-prose max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-card-foreground shadow-sm sm:max-w-[88%]">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="message-enter flex flex-col items-start">
      <span className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        WorkMate
      </span>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5 shadow-sm">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

function Composer({
  value,
  busy,
  onChange,
  onSubmit,
  textareaRef,
}: {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const canSend = value.trim().length > 0 && !busy;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="flex items-end gap-2 rounded-3xl border border-border bg-card p-2 shadow-sm transition-colors focus-within:border-ring"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit(value);
          }
        }}
        rows={1}
        placeholder="Ask WorkMate to draft an email or summarize meeting notes…"
        className="max-h-40 flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.9375rem] leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send message"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SendHorizontal className="size-4" />
      </button>
    </form>
  );
}
