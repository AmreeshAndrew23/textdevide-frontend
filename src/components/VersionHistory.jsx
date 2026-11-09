import { useCallback, useEffect, useState } from "react";
import { RotateCcw, History as HistoryIcon } from "lucide-react";
import api from "../api/client";

// Earlier versions of an app's definition. Each row is the app as it was just before a change, so
// restoring one undoes that change and everything after it. Records are never affected.

const errorText = (e, fallback) => {
  const text = e?.response?.data?.detail ?? e?.response?.data?.message;
  return typeof text === "string" ? text : fallback;
};
const friendly = (item) => item.replace(/^DataSource:/, "Lookup:");

function DiffSummary({ diff }) {
  if (!diff) return <span style={{ fontSize: 12, color: "var(--muted)" }}>Details unavailable</span>;
  const groups = [
    ["Brings back", diff.added, "studio-pill-success"],
    ["Reverts", diff.changed, "studio-pill-soft"],
    ["Removes", diff.removed, "studio-pill-muted"],
  ].filter(([, list]) => list.length > 0);
  if (groups.length === 0) return <span style={{ fontSize: 12, color: "var(--muted)" }}>Same as the current version</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {groups.map(([label, list, cls]) => (
        <span key={label} className={`studio-pill ${cls}`} title={list.map(friendly).join("\n")}>{label} {list.length}</span>
      ))}
    </div>
  );
}

export default function VersionHistory({ applicationId, onRestored }) {
  const [versions, setVersions] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => api.get(`/runtime-applications/${applicationId}/versions`)
    .then((res) => setVersions(res.data.versions))
    .catch((e) => { setVersions([]); setError(errorText(e, "Couldn't load the version history.")); }), [applicationId]);

  useEffect(() => { load(); }, [load]);

  function restore(version) {
    if (!window.confirm("Restore this version? Your current version is saved first, so you can come back to it.")) return;
    setBusyId(version.id);
    setError("");
    api.post(`/runtime-applications/${applicationId}/versions/${version.id}/restore`)
      .then((res) => {
        onRestored(res.data);
        setNotice("Version restored.");
        return load();
      })
      .catch((e) => setError(errorText(e, "Couldn't restore that version.")))
      .finally(() => setBusyId(null));
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860 }}>
      <div>
        <h1 className="section-title">History</h1>
        <p className="section-sub">Undo any change to this app's design, screens or rules. Restoring never changes your records, and a published app stays as it is until you publish again.</p>
      </div>
      {error && <div style={{ background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{error}</div>}
      {notice && <div style={{ background: "var(--success-soft)", color: "var(--success)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{notice}</div>}
      {versions === null && <div className="skeleton" style={{ height: 150, borderRadius: 12 }} />}
      {versions?.length === 0 && !error && (
        <div className="studio-card" style={{ padding: "36px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13, boxShadow: "none" }}>
          <HistoryIcon size={26} style={{ marginBottom: 8 }} />
          <div>No earlier versions yet. One is saved automatically each time this app changes.</div>
        </div>
      )}
      {versions?.length > 0 && (
        <div className="studio-card" style={{ boxShadow: "none", overflow: "hidden" }}>
          {versions.map((v, i) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border)", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{v.label}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", margin: "3px 0 7px" }}>{new Date(v.createdAt).toLocaleString()}</div>
                <DiffSummary diff={v.diff} />
              </div>
              <button className="studio-btn-secondary studio-btn-sm" onClick={() => restore(v)} disabled={busyId !== null}>
                {busyId === v.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <RotateCcw size={13} />} Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
