import { useEffect, useState } from "react";
import { Zap, X as XIcon } from "lucide-react";
import api from "../api/client";

// How much of today's AI allowance is left (see the backend's services/aiUsage.ts). Two looks: a
// small pill for the editor's top bar, a labelled bar for the Studio sidebar. Both open the same
// breakdown. Refreshes whenever an AI request finishes (api/client.js fires AI_USAGE_EVENT).

export const AI_USAGE_EVENT = "textdev:ai-usage";

const KIND_LABELS = {
  app_generate: "New apps",
  app_change: "Changes to apps",
  ask: "Questions",
  design: "Design",
  sample_data: "Sample data",
};

const money = (n) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);
const tokens = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

function useUsage() {
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get("/ai-usage").then((r) => alive && setUsage(r.data)).catch(() => {});
    load();
    window.addEventListener(AI_USAGE_EVENT, load);
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; window.removeEventListener(AI_USAGE_EVENT, load); clearInterval(timer); };
  }, []);
  return usage;
}

function tone(usage) {
  if (!usage || usage.limit === null) return "ok";
  if (usage.remaining === 0) return "out";
  return usage.remaining <= Math.max(3, Math.ceil(usage.limit * 0.15)) ? "low" : "ok";
}

export default function AiUsageMeter({ variant = "pill" }) {
  const usage = useUsage();
  const [open, setOpen] = useState(false);
  if (!usage) return null;
  const t = tone(usage);
  const unlimited = usage.limit === null;
  const summary = unlimited ? `${usage.usedToday} AI request${usage.usedToday === 1 ? "" : "s"} today` : `${usage.remaining} of ${usage.limit} AI requests left today`;

  return (
    <>
      {variant === "nav" ? (
        <button type="button" className={`ai-meter-nav ${t}`} onClick={() => setOpen(true)} title="See your AI usage">
          <span className="ai-meter-row">
            <Zap size={14} strokeWidth={2} />
            <span style={{ flex: 1 }}>AI today</span>
            <strong>{unlimited ? `${usage.usedToday} used` : `${usage.usedToday} / ${usage.limit}`}</strong>
          </span>
          {!unlimited && (
            <span className="ai-meter-track" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (usage.usedToday / usage.limit) * 100)}%` }} />
            </span>
          )}
        </button>
      ) : (
        <button type="button" className={`ai-meter-pill ${t}`} onClick={() => setOpen(true)} title={summary} aria-label={summary}>
          <Zap size={13} strokeWidth={2.2} />
          {unlimited ? usage.usedToday : `${usage.remaining} left`}
        </button>
      )}
      {open && <UsageDialog usage={usage} onClose={() => setOpen(false)} />}
    </>
  );
}

function UsageDialog({ usage, onClose }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...usage.days.map((d) => d.requests));
  const resets = new Date(usage.resetsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const unlimited = usage.limit === null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="studio-card fade-in" role="dialog" aria-modal="true" aria-label="AI usage" style={{ width: 520, maxWidth: "100%", padding: 24, maxHeight: "calc(100vh - 32px)", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>AI usage</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
              {unlimited ? "Your account has no daily limit." : `${usage.limit} requests a day. Resets at ${resets} your time.`}
            </div>
          </div>
          <button className="studio-icon-btn" onClick={onClose} title="Close"><XIcon size={16} /></button>
        </div>

        <div className="ai-usage-tiles">
          <div><span>Left today</span><strong>{unlimited ? "∞" : usage.remaining}</strong><em>{usage.usedToday} used</em></div>
          <div><span>Tokens today</span><strong>{tokens(usage.today.tokens)}</strong><em>{money(usage.today.costUsd)} est.</em></div>
          <div><span>Last 30 days</span><strong>{usage.last30Days.requests}</strong><em>{money(usage.last30Days.costUsd)} est.</em></div>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", margin: "22px 0 8px" }}>Requests per day, last 14 days</div>
        <div className="ai-usage-chart" onMouseLeave={() => setHover(null)}>
          {usage.days.map((d, i) => (
            <div key={d.date} className="ai-usage-col" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
              aria-label={`${dayLabel(d.date)}: ${d.requests} requests, ${tokens(d.tokens)} tokens`}>
              <span className={`ai-usage-bar${hover === i ? " on" : ""}`} style={{ height: d.requests ? `${Math.max(4, (d.requests / max) * 100)}%` : 0 }} />
              {hover === i && (
                <div className={`ai-usage-tip${i > 9 ? " left" : ""}`}>
                  <strong>{dayLabel(d.date)}</strong>
                  <div>{d.requests} request{d.requests === 1 ? "" : "s"} · {tokens(d.tokens)} tokens · {money(d.costUsd)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          <span>{dayLabel(usage.days[0].date)}</span><span>Today</span>
        </div>

        {usage.byKind.length > 0 && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", margin: "22px 0 8px" }}>What it was used for, last 30 days</div>
            <div className="ai-usage-kinds">
              {usage.byKind.map((k) => (
                <div key={k.kind}>
                  <span style={{ flex: 1 }}>{KIND_LABELS[k.kind] || k.kind}</span>
                  <span>{k.requests}</span>
                  <span style={{ color: "var(--muted)", width: 64, textAlign: "right" }}>{money(k.costUsd)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "16px 0 0", lineHeight: 1.5 }}>
          Costs are estimates from token counts at the model's published price.
        </p>
      </div>
    </div>
  );
}
