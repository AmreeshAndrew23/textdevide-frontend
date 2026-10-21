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
// raw XML to render a bare, unstyled Run panel — UIField label/bind, Button label/action, and (for
// a browse screen) the Grid's own columns/entity/rowClick target. This mirrors backend-node's
// applicationModel.ts's parseScreenElement in spirit, not by sharing code (that parser is
// server-only); good enough for the MVP "fastest, bare form/table" tier, not a full themed renderer.
function parseScreenForRun(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  const entity = root.getAttribute("entity");
  const fields = Array.from(root.querySelectorAll("Fields > UIField")).map((el) => {
    const bind = el.getAttribute("bind") || (el.getAttribute("valueFrom") || "").replace(/^field:/, "");
    return { label: el.getAttribute("label") || bind, bind };
  });
  const buttons = Array.from(root.querySelectorAll("Buttons > Button")).map((el) => ({
    label: el.getAttribute("label"), action: el.getAttribute("action"),
  }));
  const gridEl = root.querySelector("Grid");
  const grid = gridEl
    ? {
        entity: gridEl.getAttribute("entity"),
        columns: Array.from(gridEl.querySelectorAll("Column")).map((c) => ({ header: c.getAttribute("header"), bind: c.getAttribute("bind") })),
        rowClick: (() => {
          const on = gridEl.querySelector('On[event="rowClick"]');
          return on ? { action: on.getAttribute("action"), targetScreen: on.getAttribute("targetScreen") } : null;
        })(),
      }
    : null;
  return { entity, fields, buttons, grid };
}

const DEFAULT_THEME = { logo: null, primary: "#4f46e5", accent: "#f59e0b", background: "#ffffff", fontFamily: "system-ui, sans-serif", fontSize: "14", cornerRadius: "6", density: "comfortable" };

// Extracts the generated <Theme> element's Colors/Font/Style/Logo into something directly usable
// as inline CSS — the only part of the vocabulary that's purely cosmetic (per the plan's Phase 2
// scope note), so applying it needed no backend/engine changes at all, just reading what's already
// stored and stopping ignoring it in the Run panel.
function parseThemeForRun(xml) {
  if (!xml) return DEFAULT_THEME;
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  const logo = root.querySelector("Logo");
  const colors = root.querySelector("Colors");
  const font = root.querySelector("Font");
  const style = root.querySelector("Style");
  return {
    logo: logo?.getAttribute("src") || null,
    primary: colors?.getAttribute("primary") || DEFAULT_THEME.primary,
    accent: colors?.getAttribute("accent") || DEFAULT_THEME.accent,
    background: colors?.getAttribute("background") || DEFAULT_THEME.background,
    fontFamily: font?.getAttribute("family") ? `${font.getAttribute("family")}, sans-serif` : DEFAULT_THEME.fontFamily,
    fontSize: font?.getAttribute("size") || DEFAULT_THEME.fontSize,
    cornerRadius: style?.getAttribute("cornerRadius") || DEFAULT_THEME.cornerRadius,
    density: style?.getAttribute("density") || DEFAULT_THEME.density,
  };
}

// Reconstructs the whole <Application> document from its stored pieces — the backend keeps one
// element per Neo4j node (see runtimeEngine/applicationStore.ts), never the original whole-document
// string, so "view it in one stretch" means rebuilding it client-side from detail.elements, in the
// same order the server already returns them (position-sorted).
function buildFullXml(detail) {
  const attrs = [`name="${detail.name}"`];
  if (detail.theme) attrs.push(`theme="${detail.theme}"`);
  if (detail.database) attrs.push(`database="${detail.database}"`);
  const body = detail.elements.map((el) => el.xml.replace(/^/gm, "  ")).join("\n");
  return `<Application ${attrs.join(" ")}>\n${body}\n</Application>`;
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
  const [genDescription, setGenDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTag, setActiveTag] = useState("Entity");
  const [activeElement, setActiveElement] = useState(null); // { tag, name, xml }
  const [showFullXml, setShowFullXml] = useState(false);

  const [runFieldValues, setRunFieldValues] = useState({});
  const [runMessages, setRunMessages] = useState([]);
  const [running, setRunning] = useState(false);
  const [gridRows, setGridRows] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);

  function loadApplications() {
    return api.get("/runtime-applications").then((res) => setApplications(res.data)).catch(() => setError("Failed to load applications."));
  }

  useEffect(() => { loadApplications(); }, []);

  function handleGenerate() {
    if (!genDescription.trim()) return;
    setGenerating(true);
    setGenError("");
    api.post("/runtime-applications/generate", { description: genDescription })
      .then((res) => setNewXml(res.data.xml)) // fills the XML textarea below for review/editing — nothing is created yet
      .catch((e) => setGenError(e.response?.data?.message || e.response?.data?.detail || "Failed to generate — try rephrasing the description."))
      .finally(() => setGenerating(false));
  }

  function closeNewModal() {
    setShowNewModal(false); setNewName(""); setNewXml(""); setGenDescription(""); setGenError(""); setCreateError("");
  }

  function handleCreate() {
    if (!newName.trim() || !newXml.trim()) return;
    setCreating(true);
    setCreateError("");
    api.post("/runtime-applications", { name: newName, xml: newXml })
      .then((res) => {
        closeNewModal();
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
    setShowFullXml(false);
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

  function loadGridRows(entityName) {
    setGridLoading(true);
    api.get(`/runtime-applications/${selectedId}/entities/${entityName}/rows`)
      .then((res) => setGridRows(res.data.rows))
      .catch(() => { setGridRows([]); setError("Failed to load this entity's rows."); })
      .finally(() => setGridLoading(false));
  }

  // Opens a Screen element — a Grid screen immediately fetches its entity's real rows (a browse
  // view); a form screen starts blank unless prefill is given (editing an existing row, via a
  // Grid's rowClick).
  function openElement(el, prefill) {
    setActiveElement(el);
    setRunFieldValues(prefill || {});
    setRunMessages([]);
    setGridRows(null);
    const parsed = el.tag === "Screen" ? parseScreenForRun(el.xml) : null;
    if (parsed?.grid?.entity) loadGridRows(parsed.grid.entity);
  }

  // A Grid row's rowClick -> targetScreen is pure navigation (see applicationEngine.ts's
  // comment: it carries no database involvement itself) — resolved entirely client-side by
  // finding that Screen among the already-fetched detail.elements, then opening it pre-filled
  // with the clicked row's own data for editing.
  function openRowForEdit(targetScreenName, row) {
    const targetEl = detail?.elements.find((e) => e.tag === "Screen" && e.name === targetScreenName);
    if (!targetEl) { setError(`Screen "${targetScreenName}" not found.`); return; }
    openElement(targetEl, row);
  }

  function runAction(action, overrideFieldValues) {
    if (!activeElement || activeElement.tag !== "Screen") return Promise.resolve();
    let fieldValues = overrideFieldValues || runFieldValues;
    // The generated Screen's own Fields never include the key field (it's meant to be
    // system-generated, not typed in — the AI never renders a UIField for it), so there's
    // otherwise no way to set one when creating a brand new record through this bare form.
    // Only applies to a genuine create (editing an existing row already has its real key).
    if (action === "save" && !fieldValues[screenKeyField]) {
      fieldValues = { ...fieldValues, [screenKeyField]: crypto.randomUUID() };
      setRunFieldValues(fieldValues);
    }
    setRunning(true);
    setRunMessages([]);
    return api.post(`/runtime-applications/${selectedId}/screens/${activeElement.name}/run`, {
      elementId: action, action, fieldValues,
    })
      .then((res) => { setRunMessages(res.data.actions || []); return res.data.actions || []; })
      .catch((e) => {
        const value = e.response?.data?.message || e.response?.data?.detail || "Run failed.";
        setRunMessages([{ type: "message", messageType: "error", value }]);
        return [];
      })
      .finally(() => setRunning(false));
  }

  // Deletes straight from the grid row, using the CURRENT (Grid) screen's own entity binding —
  // the "delete" built-in only needs screen.entity, so there's no need to navigate to the form
  // screen first just to remove a record.
  function deleteGridRow(row, keyField) {
    if (!window.confirm("Delete this record? This can't be undone.")) return;
    runAction("delete", { [keyField]: row[keyField] }).then(() => {
      const parsed = parseScreenForRun(activeElement.xml);
      if (parsed?.grid?.entity) loadGridRows(parsed.grid.entity);
    });
  }

  const elementsByTag = detail ? detail.elements.filter((e) => e.tag === activeTag) : [];
  const screenForRun = activeElement?.tag === "Screen" ? parseScreenForRun(activeElement.xml) : null;
  const screenEntityDef = screenForRun?.entity ? detail?.elements.find((e) => e.tag === "Entity" && e.name === screenForRun.entity) : null;
  const screenKeyField = screenEntityDef ? (screenEntityDef.xml.match(/<Field name="(\w+)"[^>]*key="true"/) || [])[1] || "id" : "id";
  const themeEl = detail?.elements.find((e) => e.tag === "Theme");
  const theme = parseThemeForRun(themeEl?.xml);

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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={closeNewModal}>
          <div className="studio-card" style={{ width: 640, padding: 24, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>New Application</div>
            <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 16 }}>
              Describe it in plain English and generate the XML, or paste/edit it directly below.
            </p>

            <div style={{ border: "1px solid var(--st-border)", borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>Describe the application</label>
              <textarea
                className="studio-textarea"
                value={genDescription}
                onChange={(e) => setGenDescription(e.target.value)}
                placeholder="An insurance claims app with policies, claims, and adjusters. Each policy belongs to a customer and can have many claims; each claim is assigned to one adjuster and has a status and amount."
                rows={3}
                style={{ width: "100%", marginBottom: 8, resize: "vertical" }}
              />
              <button className="studio-btn-secondary" onClick={handleGenerate} disabled={generating || !genDescription.trim()}>
                {generating ? "Generating…" : "Generate XML"}
              </button>
              {genError && <div style={{ color: "var(--st-danger)", fontSize: 12.5, marginTop: 8 }}>{genError}</div>}
            </div>

            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>Name</label>
            <input className="studio-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Procurement" style={{ width: "100%", marginBottom: 12 }} />
            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>Application XML — review/edit before creating</label>
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
              <button className="studio-btn-secondary" onClick={closeNewModal}>Cancel</button>
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
                <div
                  onClick={() => { setShowFullXml(true); setActiveElement(null); }}
                  style={{
                    padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 10,
                    fontWeight: 600, background: showFullXml ? "var(--st-accent)" : "transparent",
                    color: showFullXml ? "#fff" : "inherit", borderBottom: "1px solid var(--st-border)", paddingBottom: 12,
                  }}
                >
                  📄 Full XML
                </div>
                {ELEMENT_TAGS.map((tag) => (
                  <div
                    key={tag}
                    onClick={() => { setActiveTag(tag); setActiveElement(null); setShowFullXml(false); }}
                    style={{
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 2,
                      background: !showFullXml && activeTag === tag ? "var(--st-accent)" : "transparent",
                      color: !showFullXml && activeTag === tag ? "#fff" : "inherit",
                    }}
                  >
                    {tag} ({detail.elements.filter((e) => e.tag === tag).length})
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: 16 }}>
                {showFullXml && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Full Application XML</div>
                      <button
                        className="studio-btn-secondary"
                        onClick={() => navigator.clipboard?.writeText(buildFullXml(detail))}
                      >
                        Copy
                      </button>
                    </div>
                    <pre style={{ background: "#13111c", color: "#e2e8f0", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, maxHeight: "70vh" }}>
                      {buildFullXml(detail)}
                    </pre>
                  </div>
                )}
                {!showFullXml && !activeElement && (
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
                {activeElement && activeElement.tag === "Screen" && screenForRun?.grid && (() => {
                  const pad = theme.density === "compact" ? "5px 10px" : "10px 14px";
                  return (
                    <div style={{ background: theme.background, borderRadius: `${theme.cornerRadius}px`, padding: 18, fontFamily: theme.fontFamily, fontSize: `${theme.fontSize}px` }}>
                      <button className="studio-btn-secondary" onClick={() => setActiveElement(null)} style={{ marginBottom: 12 }}>← Back</button>
                      {theme.logo && <img src={theme.logo} alt="" style={{ height: 28, marginBottom: 10, display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />}
                      <div style={{ fontWeight: 700, fontSize: "1.1em", marginBottom: 12, color: theme.primary }}>Browse: {activeElement.name}</div>
                      {gridLoading && <div style={{ color: "#888" }}>Loading…</div>}
                      {!gridLoading && gridRows?.length === 0 && <div style={{ color: "#888" }}>No records yet.</div>}
                      {!gridLoading && gridRows?.length > 0 && (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: theme.primary }}>
                              {screenForRun.grid.columns.map((c) => (
                                <th key={c.bind} style={{ textAlign: "left", padding: pad, color: "#fff", fontWeight: 600 }}>{c.header}</th>
                              ))}
                              <th style={{ background: theme.primary }} />
                            </tr>
                          </thead>
                          <tbody>
                            {gridRows.map((row, i) => (
                              <tr key={i} style={{ background: i % 2 ? "rgba(0,0,0,0.03)" : "transparent" }}>
                                {screenForRun.grid.columns.map((c) => (
                                  <td
                                    key={c.bind}
                                    onClick={() => screenForRun.grid.rowClick?.targetScreen && openRowForEdit(screenForRun.grid.rowClick.targetScreen, row)}
                                    style={{ padding: pad, borderBottom: "1px solid rgba(0,0,0,0.08)", cursor: screenForRun.grid.rowClick ? "pointer" : "default" }}
                                  >
                                    {String(row[c.bind] ?? "")}
                                  </td>
                                ))}
                                <td style={{ padding: pad, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                                  <button
                                    onClick={() => deleteGridRow(row, screenKeyField)}
                                    style={{ background: "none", border: `1px solid ${theme.accent}`, color: theme.accent, borderRadius: `${theme.cornerRadius}px`, fontSize: "0.85em", padding: "3px 10px", cursor: "pointer" }}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {runMessages.length > 0 && (
                        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                          {runMessages.map((m, i) => (
                            <div key={i} style={{ fontSize: 13, color: m.messageType === "error" ? "#dc2626" : "inherit" }}>{m.value}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {activeElement && activeElement.tag === "Screen" && screenForRun && !screenForRun.grid && (
                  <div style={{ background: theme.background, borderRadius: `${theme.cornerRadius}px`, padding: 18, fontFamily: theme.fontFamily, fontSize: `${theme.fontSize}px`, maxWidth: 420 }}>
                    <button className="studio-btn-secondary" onClick={() => setActiveElement(null)} style={{ marginBottom: 12 }}>← Back</button>
                    {theme.logo && <img src={theme.logo} alt="" style={{ height: 28, marginBottom: 10, display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />}
                    <div style={{ fontWeight: 700, fontSize: "1.1em", marginBottom: 12, color: theme.primary }}>
                      {runFieldValues[screenKeyField] ? "Edit" : "New"}: {activeElement.name}
                    </div>
                    {screenForRun.fields.map((f) => (
                      <div key={f.bind} style={{ marginBottom: theme.density === "compact" ? 6 : 12 }}>
                        <label style={{ fontSize: "0.85em", fontWeight: 600, display: "block", marginBottom: 4 }}>{f.label}</label>
                        <input
                          style={{
                            width: "100%", boxSizing: "border-box", padding: theme.density === "compact" ? "5px 8px" : "8px 10px",
                            borderRadius: `${theme.cornerRadius}px`, border: "1px solid #d1d5db", fontFamily: "inherit", fontSize: "inherit",
                          }}
                          value={runFieldValues[f.bind] ?? ""}
                          onChange={(e) => setRunFieldValues((v) => ({ ...v, [f.bind]: e.target.value }))}
                          onFocus={(e) => { e.target.style.borderColor = theme.accent; e.target.style.outline = "none"; }}
                          onBlur={(e) => { e.target.style.borderColor = "#d1d5db"; }}
                        />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      {screenForRun.buttons.map((b) => (
                        <button
                          key={b.action}
                          disabled={running}
                          onClick={() => runAction(b.action)}
                          style={{
                            background: b.action === "delete" ? "none" : theme.primary, color: b.action === "delete" ? "#dc2626" : "#fff",
                            border: b.action === "delete" ? "1px solid #dc2626" : "none", borderRadius: `${theme.cornerRadius}px`,
                            padding: theme.density === "compact" ? "6px 14px" : "9px 18px", fontFamily: "inherit", fontSize: "inherit",
                            fontWeight: 600, cursor: running ? "default" : "pointer", opacity: running ? 0.6 : 1,
                          }}
                        >
                          {running ? "Running…" : b.label}
                        </button>
                      ))}
                    </div>
                    {runMessages.length > 0 && (
                      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                        {runMessages.map((m, i) => (
                          <div key={i} style={{ fontSize: "0.9em", color: m.messageType === "error" ? "#dc2626" : "inherit" }}>
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
