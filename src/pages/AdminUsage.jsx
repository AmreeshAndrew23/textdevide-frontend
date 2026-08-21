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

export default function AdminUsage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/token-usage")
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.status === 403 ? "Not authorized — superuser access required." : "Failed to load token usage."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="studio-root" style={{ minHeight: "100vh", background: "var(--st-bg)", padding: "28px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <button className="studio-btn-secondary" onClick={() => navigate("/")}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Token Usage — All Users</div>
      </div>

      {loading && <div style={{ color: "var(--st-muted)", fontSize: 13.5 }}>Loading usage data...</div>}
      {error && <div className="studio-card" style={{ padding: 18, color: "var(--st-danger)", fontSize: 13.5 }}>{error}</div>}

      {data && (
        <>
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
