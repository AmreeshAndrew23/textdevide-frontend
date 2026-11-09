import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ArrowUp, Copy, Check, RotateCcw, Trash2, MessageSquareText, X as XIcon } from "lucide-react";
import api from "../api/client";
import Markdown from "./Markdown";
import { summarizeApplication, humanize } from "../utils/applicationXml";

// "Ask about this app" — a metadata query box over one Application. Every answer comes from the
// backend's POST /runtime-applications/:id/ask, which grounds the AI strictly in this app's own
// XML (entities, fields, screens, validations, roles…) and returns readable Markdown. Read-only:
// nothing asked here ever changes the application — that's the Describe/Fix flow's job.
//
// variant="page" is the workspace's full Ask section; variant="drawer" is the slide-over used
// from inside Run mode. The conversation is kept per application in sessionStorage so switching
// sections (which unmounts this) doesn't throw it away.

function storageKey(applicationId) {
  return `textdev.ask.${applicationId}`;
}

function loadThread(applicationId) {
  try {
    const raw = sessionStorage.getItem(storageKey(applicationId));
    const parsed = raw ? JSON.parse(raw) : [];
    // A turn still "pending" when the page went away never got its answer — drop it, don't
    // resurrect a spinner that nothing will ever resolve.
    return Array.isArray(parsed) ? parsed.filter((t) => !t.pending) : [];
  } catch {
    return [];
  }
}

function saveThread(applicationId, thread) {
  try {
    sessionStorage.setItem(storageKey(applicationId), JSON.stringify(thread));
  } catch {
    // Storage unavailable (private mode, quota) — the conversation just won't survive a remount.
  }
}

function suggestionsFor(detail) {
  const s = summarizeApplication(detail);
  const first = s.entities.find((e) => !e.isAccount) || s.entities[0];
  const out = ["Give me a plain-English overview of this app"];
  if (s.entities.length > 1) out.push("What are the main entities and how are they related?");
  if (first) out.push(`What fields does ${humanize(first.name)} have, and which are required?`);
  if (s.validations.length > 0) out.push("What validation rules are enforced, and when?");
  if (s.screens.length > 0) out.push("List the screens and what each one is for");
  if (s.roles.length > 0) out.push("Which roles can access which screens?");
  else if (s.hasAccounts) out.push("How do users sign up and log in?");
  return out.slice(0, 6);
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="studio-btn-ghost studio-btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function AskPanel({ applicationId, detail, variant = "page", seedQuestion, onSeedConsumed, onClose }) {
  const [thread, setThread] = useState(() => loadThread(applicationId));
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sending = thread.some((t) => t.pending);
  const suggestions = useMemo(() => suggestionsFor(detail), [detail]);
  const isDrawer = variant === "drawer";

  useEffect(() => { saveThread(applicationId, thread); }, [applicationId, thread]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [thread.length, sending]);

  function ask(rawQuestion) {
    const question = rawQuestion.trim();
    if (!question || sending) return;
    const history = thread.filter((t) => t.answer && !t.error).map((t) => ({ question: t.question, answer: t.answer }));
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setThread((cur) => [...cur, { id, question, pending: true }]);
    setInput("");
    api.post(`/runtime-applications/${applicationId}/ask`, { question, history })
      .then((res) => setThread((cur) => cur.map((t) => (t.id === id ? { id, question, answer: res.data.answer } : t))))
      .catch((e) => {
        const message = e.response?.data?.detail ?? e.response?.data?.message;
        const error = typeof message === "string" ? message : "Couldn't get an answer — check your connection and try again.";
        setThread((cur) => cur.map((t) => (t.id === id ? { id, question, error } : t)));
      });
  }

  // A question handed in from elsewhere (an Overview entity card, a "Ask about this" button) —
  // asked once, then cleared by the parent so it doesn't re-fire on the next render.
  // The ref (not just the parent clearing it) is what stops StrictMode's double-run of this
  // effect in dev from asking the same seeded question twice.
  const handledSeedRef = useRef(null);
  useEffect(() => {
    if (!seedQuestion || handledSeedRef.current === seedQuestion) return;
    handledSeedRef.current = seedQuestion;
    ask(seedQuestion);
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuestion]);

  // The failed turn is removed and the question asked again — failed turns are never sent as
  // history, so it doesn't matter that ask() still sees it in this render's thread.
  function retry(turn) {
    setThread((cur) => cur.filter((t) => t.id !== turn.id));
    ask(turn.question);
  }

  const composer = (
    <div className="composer" style={{ flexShrink: 0 }}>
      <textarea
        ref={inputRef}
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
        }}
        placeholder={`Ask anything about ${detail?.name || "this app"} — entities, fields, rules, screens…`}
        maxLength={2000}
      />
      <div className="composer-bar">
        <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>
          Enter to send · Shift+Enter for a new line
        </span>
        {thread.length > 0 && (
          <button className="studio-btn-ghost studio-btn-sm" onClick={() => setThread([])} disabled={sending} title="Clear conversation">
            <Trash2 size={13} /> Clear
          </button>
        )}
        <button className="studio-btn-ai studio-btn-sm" onClick={() => ask(input)} disabled={sending || !input.trim()} style={{ padding: "7px 12px" }}>
          {sending ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <ArrowUp size={14} />} Ask
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: isDrawer ? "16px 18px" : "0 0 18px", borderBottom: isDrawer ? "1px solid var(--border)" : "none", flexShrink: 0 }}>
        <div className="ai-mark" style={{ width: 34, height: 34 }}><MessageSquareText size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: isDrawer ? 15 : 20, letterSpacing: "-0.01em" }}>Ask about this app</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
            Answers come straight from {detail?.name ? <strong style={{ color: "var(--text-2)" }}>{detail.name}</strong> : "this app"}'s definition — nothing here changes the app.
          </div>
        </div>
        {onClose && (
          <button className="studio-icon-btn" onClick={onClose} title="Close"><XIcon size={16} /></button>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isDrawer ? "16px 18px" : "4px 2px 16px" }}>
        {thread.length === 0 ? (
          <div className="fade-in" style={{ padding: isDrawer ? "8px 0" : "28px 0 8px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Try asking
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isDrawer ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {suggestions.map((q) => (
                <button key={q} className="chip" onClick={() => ask(q)} style={{ borderRadius: 10, padding: "10px 12px", justifyContent: "flex-start" }}>
                  <Sparkles size={13} style={{ color: "var(--accent)", flexShrink: 0 }} /> {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {thread.map((t) => (
              <div key={t.id} className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--accent-soft)", border: "1px solid rgba(139,124,248,0.25)", color: "var(--text)", padding: "9px 14px", borderRadius: "14px 14px 4px 14px", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {t.question}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div className="ai-mark" style={{ width: 26, height: 26, borderRadius: 7, marginTop: 2 }}><Sparkles size={13} /></div>
                  <div style={{ flex: 1, minWidth: 0, background: "var(--surface)", border: `1px solid ${t.error ? "rgba(248,113,113,0.35)" : "var(--border)"}`, borderRadius: "4px 14px 14px 14px", padding: "12px 16px" }}>
                    {t.pending && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 13 }}>
                        <span className="typing"><span /><span /><span /></span> Reading the app definition…
                      </div>
                    )}
                    {t.error && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                        <span style={{ color: "var(--danger)", fontSize: 13 }}>{t.error}</span>
                        <button className="studio-btn-secondary studio-btn-sm" onClick={() => retry(t)} disabled={sending}><RotateCcw size={13} /> Retry</button>
                      </div>
                    )}
                    {t.answer && (
                      <>
                        <Markdown text={t.answer} />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, marginRight: -8, marginBottom: -6 }}>
                          <CopyButton text={t.answer} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: isDrawer ? "12px 18px 18px" : 0, borderTop: isDrawer ? "1px solid var(--border)" : "none" }}>{composer}</div>
    </div>
  );
}
