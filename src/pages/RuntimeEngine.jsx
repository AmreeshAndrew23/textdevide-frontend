import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

// The second, independent "Runtime Engine" — its own standalone space, NOT nested under any
// project (confirmed with the user: "we need to have a separate space for both"). Lists/creates
// Applications built from the Application/Entity/Relationship/Validation/DataSource/Screen/Action
// vocabulary (see backend-node's src/runtimeEngine/), completely separate from the existing
// Dashboard/project workflow, which this page never touches.

const ELEMENT_TAGS = ["Entity", "Relationship", "Validation", "DataSource", "Screen", "Action", "Theme", "Session", "Auditing", "AutoNumber"];

// Minimal client-side extraction (native DOMParser, no library) of just enough from a Screen's
// raw XML to render a bare, unstyled Run panel — UIField label/bind and Button label/action. This
// mirrors backend-node's applicationModel.ts's parseScreenElement in spirit, not by sharing code
// (that parser is server-only); good enough for the MVP "fastest, bare form" tier the plan called
// for, not a full themed renderer.
function parseScreenForRun(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  const fields = Array.from(root.querySelectorAll("Fields > UIField")).map((el) => {
    const bind = el.getAttribute("bind") || (el.getAttribute("valueFrom") || "").replace(/^field:/, "");
    return { label: el.getAttribute("label") || bind, bind };
  });
  const buttons = Array.from(root.querySelectorAll("Buttons > Button")).map((el) => ({
    label: el.getAttribute("label"), action: el.getAttribute("action"),
  }));
  return { fields, buttons };
}

export default function RuntimeEngine() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState("");

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newXml, setNewXml] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTag, setActiveTag] = useState("Entity");
  const [activeElement, setActiveElement] = useState(null); // { tag, name, xml }

  const [runFieldValues, setRunFieldValues] = useState({});
  const [runMessages, setRunMessages] = useState([]);
  const [running, setRunning] = useState(false);

  function loadApplications() {
    return api.get("/runtime-applications").then((res) => setApplications(res.data)).catch(() => setError("Failed to load applications."));
  }

  useEffect(() => { loadApplications(); }, []);

  function handleCreate() {
    if (!newName.trim() || !newXml.trim()) return;
    setCreating(true);
    setCreateError("");
    api.post("/runtime-applications", { name: newName, xml: newXml })
      .then((res) => {
        setShowNewModal(false); setNewName(""); setNewXml("");
        return loadApplications().then(() => selectApplication(res.data.id));
      })
      .catch((e) => setCreateError(e.response?.data?.message || e.response?.data?.detail || "Failed to create this application."))
      .finally(() => setCreating(false));
  }

  function selectApplication(id) {
    setSelectedId(id);
    setDetail(null);
    setActiveElement(null);
    setRunMessages([]);
    setDetailLoading(true);
    api.get(`/runtime-applications/${id}`)
      .then((res) => { setDetail(res.data); setActiveTag("Entity"); })
      .catch(() => setError("Failed to load that application's details."))
      .finally(() => setDetailLoading(false));
  }

  function deleteApplication(id) {
    if (!window.confirm("Delete this application? This can't be undone.")) return;
    api.delete(`/runtime-applications/${id}`)
      .then(() => { if (selectedId === id) { setSelectedId(null); setDetail(null); } return loadApplications(); })
      .catch(() => setError("Failed to delete this application."));
  }

  function openElement(el) {
    setActiveElement(el);
    setRunFieldValues({});
    setRunMessages([]);
  }

  function runAction(action) {
    if (!activeElement || activeElement.tag !== "Screen") return;
    setRunning(true);
    setRunMessages([]);
    api.post(`/runtime-applications/${selectedId}/screens/${activeElement.name}/run`, {
      elementId: action, action, fieldValues: runFieldValues,
    })
      .then((res) => setRunMessages(res.data.actions || []))
      .catch((e) => setRunMessages([{ type: "message", messageType: "error", value: e.response?.data?.message || e.response?.data?.detail || "Run failed." }]))
      .finally(() => setRunning(false));
  }

  const elementsByTag = detail ? detail.elements.filter((e) => e.tag === activeTag) : [];
  const screenForRun = activeElement?.tag === "Screen" ? parseScreenForRun(activeElement.xml) : null;

  return (
    <div className="studio-root" style={{ minHeight: "100vh", background: "var(--st-bg)", padding: "28px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <button className="studio-btn-secondary" onClick={() => navigate("/")}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>Runtime Engine</div>
        <button className="studio-btn-primary" onClick={() => setShowNewModal(true)}>+ New Application</button>
      </div>
      <p style={{ color: "var(--st-muted)", fontSize: 13.5, marginTop: -10, marginBottom: 24, maxWidth: 680 }}>
        A separate space for Applications built from the Entity/Relationship/Validation/DataSource/
        Screen/Action vocabulary — not tied to any project.
      </p>

      {error && <div className="studio-card" style={{ padding: 18, color: "var(--st-danger)", fontSize: 13.5, marginBottom: 20 }}>{error}</div>}

      {showNewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowNewModal(false)}>
          <div className="studio-card" style={{ width: 640, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>New Application</div>
            <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 16 }}>
              Paste a complete &lt;Application&gt; XML document.
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>Name</label>
            <input className="studio-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Procurement" style={{ width: "100%", marginBottom: 12 }} autoFocus />
            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>Application XML</label>
            <textarea
              className="studio-textarea"
              value={newXml}
              onChange={(e) => setNewXml(e.target.value)}
              placeholder="<Application name=&quot;Procurement&quot; theme=&quot;corporate&quot; database=&quot;relational&quot;>...</Application>"
              rows={12}
              style={{ width: "100%", marginBottom: 12, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
            />
            {createError && <div style={{ color: "var(--st-danger)", fontSize: 12.5, marginBottom: 12 }}>{createError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="studio-btn-primary" onClick={handleCreate} disabled={creating || !newName.trim() || !newXml.trim()} style={{ flex: 1 }}>
                {creating ? "Creating…" : "Create Application"}
              </button>
              <button className="studio-btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {applications === null && <div style={{ color: "var(--st-muted)", fontSize: 13.5 }}>Loading…</div>}
          {applications?.length === 0 && <div style={{ color: "var(--st-muted)", fontSize: 13.5 }}>No applications yet.</div>}
          {applications?.map((a) => (
            <div
              key={a.id}
              className="studio-card"
              onClick={() => selectApplication(a.id)}
              style={{ padding: 14, cursor: "pointer", border: selectedId === a.id ? "1px solid var(--st-accent)" : "1px solid var(--st-border)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteApplication(a.id); }}
                  title="Delete"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--st-danger)", opacity: 0.7, padding: 0, fontSize: 13 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--st-muted)", marginTop: 4 }}>
                {Object.entries(a.elementCounts || {}).map(([tag, count]) => `${tag}: ${count}`).join(" · ") || "No elements"}
              </div>
            </div>
          ))}
        </div>

        <div className="studio-card" style={{ minHeight: 400 }}>
          {!selectedId && (
            <div style={{ padding: 60, textAlign: "center", color: "var(--st-muted)" }}>Select an application on the left.</div>
          )}
          {selectedId && detailLoading && <div style={{ padding: 60, textAlign: "center", color: "var(--st-muted)" }}>Loading…</div>}
          {selectedId && !detailLoading && detail && (
            <div style={{ display: "flex", height: "100%" }}>
              <div style={{ width: 160, borderRight: "1px solid var(--st-border)", padding: 12 }}>
                {ELEMENT_TAGS.map((tag) => (
                  <div
                    key={tag}
                    onClick={() => { setActiveTag(tag); setActiveElement(null); }}
                    style={{
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 2,
                      background: activeTag === tag ? "var(--st-accent)" : "transparent",
                      color: activeTag === tag ? "#fff" : "inherit",
                    }}
                  >
                    {tag} ({detail.elements.filter((e) => e.tag === tag).length})
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: 16 }}>
                {!activeElement && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {elementsByTag.length === 0 && <div style={{ color: "var(--st-muted)", fontSize: 13 }}>No {activeTag} elements.</div>}
                    {elementsByTag.map((el) => (
                      <div key={el.name} className="studio-card" onClick={() => openElement(el)} style={{ padding: "10px 14px", cursor: "pointer" }}>
                        {el.name}
                      </div>
                    ))}
                  </div>
                )}
                {activeElement && activeElement.tag !== "Screen" && (
                  <div>
                    <button className="studio-btn-secondary" onClick={() => setActiveElement(null)} style={{ marginBottom: 12 }}>← Back</button>
                    <pre style={{ background: "#13111c", color: "#e2e8f0", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{activeElement.xml}</pre>
                  </div>
                )}
                {activeElement && activeElement.tag === "Screen" && screenForRun && (
                  <div>
                    <button className="studio-btn-secondary" onClick={() => setActiveElement(null)} style={{ marginBottom: 12 }}>← Back</button>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Run: {activeElement.name}</div>
                    {screenForRun.fields.map((f) => (
                      <div key={f.bind} style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>{f.label}</label>
                        <input
                          className="studio-input"
                          style={{ width: "100%" }}
                          value={runFieldValues[f.bind] ?? ""}
                          onChange={(e) => setRunFieldValues((v) => ({ ...v, [f.bind]: e.target.value }))}
                        />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      {screenForRun.buttons.map((b) => (
                        <button key={b.action} className="studio-btn-primary" disabled={running} onClick={() => runAction(b.action)}>
                          {running ? "Running…" : b.label}
                        </button>
                      ))}
                    </div>
                    {runMessages.length > 0 && (
                      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                        {runMessages.map((m, i) => (
                          <div key={i} style={{ fontSize: 13, color: m.messageType === "error" ? "var(--st-danger)" : "var(--st-text)" }}>
                            {m.value}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
