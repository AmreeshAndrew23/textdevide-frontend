import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

const fmtTokens = (n) => (n || 0).toLocaleString();
const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

function BucketCell({ label, bucket }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--st-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtTokens(bucket?.total_tokens)}</div>
      <div style={{ fontSize: 11.5, color: "var(--st-muted)" }}>{fmtCost(bucket?.cost_usd)} · {bucket?.call_count || 0} calls</div>
    </div>
  );
}

function UserRow({ u }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="studio-card" style={{ marginBottom: 12, overflow: "hidden" }}>
      <div onClick={() => setOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}>
        <span style={{ fontSize: 12, color: "var(--st-muted)", width: 14 }}>{open ? "▾" : "▸"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{u.full_name || "(no name)"}</div>
          <div style={{ fontSize: 12.5, color: "var(--st-muted)" }}>{u.email}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtTokens(u.total_tokens)} tokens</div>
          <div style={{ fontSize: 12.5, color: "var(--st-muted)" }}>{fmtCost(u.total_cost_usd)} est. · {u.projects.length} project{u.projects.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid var(--st-border)" }}>
          {u.projects.length === 0 ? (
            <div style={{ padding: "14px 18px", fontSize: 12.5, color: "var(--st-muted)" }}>No AI usage recorded for this user yet.</div>
          ) : u.projects.map(p => (
            <div key={p.project_id} style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 18px", borderTop: "1px solid var(--st-border)" }}>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13 }}>{p.project_name}</div>
              <BucketCell label="Schema" bucket={p.schema_usage} />
              <BucketCell label="UI" bucket={p.ui_usage} />
              <BucketCell label="Other" bucket={p.other_usage} />
              <div style={{ minWidth: 110, textAlign: "right" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--st-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Total</div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fmtTokens(p.total_tokens)}</div>
                <div style={{ fontSize: 11.5, color: "var(--st-muted)" }}>{fmtCost(p.total_cost_usd)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 600, color: "var(--st-muted)", textTransform: "uppercase", letterSpacing: 0.4 };

// The App Studio's AI usage per user over the last 30 days (see the backend's services/aiUsage.ts).
function StudioUsage({ data }) {
  return (
    <>
      <div className="studio-card" style={{ padding: 18, marginBottom: 14, display: "flex", gap: 40, flexWrap: "wrap" }}>
        <div><div style={label}>Requests today</div><div style={{ fontSize: 22, fontWeight: 800 }}>{data.today.requests}</div><div style={{ fontSize: 12, color: "var(--st-muted)" }}>{fmtCost(data.today.costUsd)} est.</div></div>
        <div><div style={label}>Last 30 days</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtCost(data.last30Days.costUsd)}</div><div style={{ fontSize: 12, color: "var(--st-muted)" }}>{data.last30Days.requests} requests · {fmtTokens(data.last30Days.tokens)} tokens</div></div>
        <div><div style={label}>Daily limit per user</div><div style={{ fontSize: 22, fontWeight: 800 }}>{data.dailyLimit ?? "None"}</div><div style={{ fontSize: 12, color: "var(--st-muted)" }}>Set with AI_DAILY_LIMIT · superusers unlimited</div></div>
      </div>
      {data.users.length === 0 ? (
        <div className="studio-card" style={{ padding: 18, fontSize: 13.5, color: "var(--st-muted)", marginBottom: 28 }}>No AI usage in the last 30 days.</div>
      ) : (
        <div className="studio-card" style={{ overflowX: "auto", marginBottom: 28 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                {["User", "Today", "30 days", "Tokens", "Est. cost"].map((h, i) => <th key={h} style={{ ...label, padding: "12px 16px", textAlign: i ? "right" : "left", borderBottom: "1px solid var(--st-border)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const atLimit = u.limit !== null && u.today.requests >= u.limit;
                return (
                  <tr key={u.userId}>
                    <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--st-border)" }}>
                      <div style={{ fontWeight: 600 }}>{u.fullName || u.email}</div>
                      {u.fullName && <div style={{ fontSize: 12, color: "var(--st-muted)" }}>{u.email}</div>}
                    </td>
                    <td style={{ padding: "11px 16px", textAlign: "right", borderBottom: "1px solid var(--st-border)", fontWeight: atLimit ? 700 : 400, color: atLimit ? "var(--st-danger)" : undefined }}>
                      {u.today.requests}{u.limit !== null ? ` / ${u.limit}` : ""}
                    </td>
                    <td style={{ padding: "11px 16px", textAlign: "right", borderBottom: "1px solid var(--st-border)" }}>{u.last30Days.requests}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", borderBottom: "1px solid var(--st-border)" }}>{fmtTokens(u.last30Days.tokens)}</td>
                    <td style={{ padding: "11px 16px", textAlign: "right", borderBottom: "1px solid var(--st-border)", fontWeight: 600 }}>{fmtCost(u.last30Days.costUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function AdminUsage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [studio, setStudio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const denied = (err) => err.response?.status === 403;
    Promise.allSettled([api.get("/admin/ai-usage"), api.get("/admin/token-usage")]).then(([s, t]) => {
      if (s.status === "fulfilled") setStudio(s.value.data);
      if (t.status === "fulfilled") setData(t.value.data);
      const failed = [s, t].find((r) => r.status === "rejected");
      if (failed) setError(denied(failed.reason) ? "Not authorized — superuser access required." : "Failed to load some usage data.");
      setLoading(false);
    });
  }, []);

  return (
    <div className="studio-root" style={{ minHeight: "100vh", background: "var(--st-bg)", padding: "28px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <button className="studio-btn-secondary" onClick={() => navigate("/")}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Token Usage — All Users</div>
      </div>

      {loading && <div style={{ color: "var(--st-muted)", fontSize: 13.5 }}>Loading usage data...</div>}
      {error && <div className="studio-card" style={{ padding: 18, color: "var(--st-danger)", fontSize: 13.5 }}>{error}</div>}

      {studio && (
        <>
          <div style={{ fontWeight: 700, fontSize: 16, margin: "4px 0 12px" }}>App Studio — last 30 days</div>
          <StudioUsage data={studio} />
        </>
      )}

      {data && (
        <>
          <div style={{ fontWeight: 700, fontSize: 16, margin: "4px 0 12px" }}>Earlier project workspace — all time</div>
          <div className="studio-card" style={{ padding: 18, marginBottom: 20, display: "flex", gap: 40 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--st-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Grand total tokens</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtTokens(data.grand_total_tokens)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--st-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Estimated total cost</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtCost(data.grand_total_cost_usd)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--st-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Users with usage</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{data.users.length}</div>
            </div>
          </div>

          {data.users.length === 0 ? (
            <div className="studio-card" style={{ padding: 18, fontSize: 13.5, color: "var(--st-muted)" }}>No AI usage recorded yet.</div>
          ) : data.users.map(u => <UserRow key={u.user_id} u={u} />)}
        </>
      )}
    </div>
  );
}
