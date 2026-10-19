import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { ERDiagram } from "../components/ERDiagram";

// Lives outside any specific project, in its own route (unlike every other schema/UI concept in
// this app, which only exists once a project is open) — a shared, admin-curated catalog a user
// browses before starting a project at all. "Choosing" a domain snapshots its entities into this
// user's own library (GET/POST /api/domains/*); the New Project modal later reads that library to
// seed a new project's entities from one of them (see Dashboard.jsx's chosen_domain_id).
export default function Domains() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [notice, setNotice] = useState("");

  function loadChosen() {
    return api.get("/domains/chosen").then((res) => setChosen(res.data));
  }

  useEffect(() => {
    Promise.all([api.get("/domains"), loadChosen()])
      .then(([catalogRes]) => setCatalog(catalogRes.data))
      .catch(() => setError("Failed to load domains."));
  }, []);

  function selectDomain(id) {
    setSelectedId(id);
    setDetail(null);
    setNotice("");
    setDetailLoading(true);
    api.get(`/domains/${id}`)
      .then((res) => setDetail(res.data))
      .catch(() => setError("Failed to load that domain's details."))
      .finally(() => setDetailLoading(false));
  }

  function chooseSelected() {
    if (!selectedId) return;
    setChoosing(true);
    api.post(`/domains/${selectedId}/choose`)
      .then(() => { setNotice("Added to your chosen domains."); return loadChosen(); })
      .catch(() => setNotice("Couldn't choose this domain — try again."))
      .finally(() => setChoosing(false));
  }

  function removeChosen(chosenId) {
    api.delete(`/domains/chosen/${chosenId}`).then(loadChosen).catch(() => setError("Failed to remove that domain."));
  }

  const isChosen = chosen?.some((c) => c.domain_template_id === selectedId);

  return (
    <div className="studio-root" style={{ minHeight: "100vh", background: "var(--st-bg)", padding: "28px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <button className="studio-btn-secondary" onClick={() => navigate("/")}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Domains</div>
      </div>
      <p style={{ color: "var(--st-muted)", fontSize: 13.5, marginTop: -10, marginBottom: 24, maxWidth: 640 }}>
        Browse ready-made entity sets for common domains. Choose one to add it to your library — when
        you start a new project, you can seed it straight from anything you've already chosen here.
      </p>

      {error && <div className="studio-card" style={{ padding: 18, color: "var(--st-danger)", fontSize: 13.5, marginBottom: 20 }}>{error}</div>}

      {chosen?.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--st-muted)", marginBottom: 10, letterSpacing: 0.3 }}>YOUR CHOSEN DOMAINS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {chosen.map((c) => (
              <div key={c.id} className="studio-pill-success" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
                <span>{c.domain_name}</span>
                <button
                  onClick={() => removeChosen(c.id)}
                  title="Remove"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6, padding: 0, fontSize: 13 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {catalog === null && <div style={{ color: "var(--st-muted)", fontSize: 13.5 }}>Loading…</div>}
          {catalog?.length === 0 && <div style={{ color: "var(--st-muted)", fontSize: 13.5 }}>No domains available yet.</div>}
          {catalog?.map((d) => (
            <div
              key={d.id}
              className="studio-card"
              onClick={() => selectDomain(d.id)}
              style={{
                padding: 16, cursor: "pointer",
                border: selectedId === d.id ? "1px solid var(--st-accent)" : "1px solid var(--st-border)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{d.name}</div>
              {d.category && <div className="studio-pill" style={{ marginBottom: 6, display: "inline-block" }}>{d.category}</div>}
              {d.description && <div style={{ fontSize: 12.5, color: "var(--st-muted)" }}>{d.description}</div>}
            </div>
          ))}
        </div>

        <div className="studio-card" style={{ minHeight: 320 }}>
          {!selectedId && (
            <div style={{ padding: 60, textAlign: "center", color: "var(--st-muted)" }}>
              Select a domain on the left to preview its entities.
            </div>
          )}
          {selectedId && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--st-border)" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{detail?.name || "…"}</div>
                  {detail?.description && <div style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 2 }}>{detail.description}</div>}
                </div>
                <button className="studio-btn-primary" onClick={chooseSelected} disabled={choosing || isChosen}>
                  {isChosen ? "Already chosen" : choosing ? "Choosing…" : "Choose this domain"}
                </button>
              </div>
              {notice && <div style={{ padding: "10px 18px", fontSize: 12.5, color: "var(--st-muted)" }}>{notice}</div>}
              {detailLoading && <div style={{ padding: 60, textAlign: "center", color: "var(--st-muted)" }}>Loading…</div>}
              {!detailLoading && detail && (
                <ERDiagram
                  entities={JSON.parse(detail.entities)}
                  emptyMessage="This domain has no entities defined yet."
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
