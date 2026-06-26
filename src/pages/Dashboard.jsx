import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

const LANGUAGES = ["Python", "Java", "JavaScript", "TypeScript", "C#", "Go", "Ruby", "PHP"];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("schema");

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("Untitled Project");
  const [newLanguage, setNewLanguage] = useState("Python");

  const [description, setDescription] = useState("");
  const [features, setFeatures] = useState("");
  const [refineText, setRefineText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedTables, setExpandedTables] = useState({});
  const [saveMsg, setSaveMsg] = useState("");

  const [validationRules, setValidationRules] = useState("");
  const [validationCode, setValidationCode] = useState("");
  const [validationLoading, setValidationLoading] = useState(false);

  const [uiDescription, setUIDescription] = useState("");
  const [uiCode, setUICode] = useState("");
  const [uiLoading, setUILoading] = useState(false);
  const [showUiCode, setShowUiCode] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get("/projects");
      setProjects(res.data);
    } catch (err) { console.error("Failed to fetch projects", err); }
  };

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post("/projects", { name: newName, language: newLanguage });
      setProjects([res.data, ...projects]);
      selectProject(res.data);
      setShowNewModal(false);
      setNewName("Untitled Project");
    } catch (err) { console.error("Failed to create project", err); }
  };

  const selectProject = (data) => {
    setSelectedProject(data);
    setDescription(data.description || "");
    setFeatures(data.features || "");
    setActiveSection("schema");
    setValidationRules(data.validation_rules || "");
    setValidationCode(data.validation_code || "");
    setUIDescription(data.ui_description || "");
    setUICode(data.ui_code || "");
    setError("");
    setSaveMsg("");
  };

  const handleSelect = async (project) => {
    try {
      const res = await api.get(`/projects/${project.id}`);
      selectProject(res.data);
    } catch (err) { console.error("Failed to load project", err); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/projects/${id}`);
      setProjects(projects.filter((p) => p.id !== id));
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch (err) { console.error("Failed to delete project", err); }
  };

  const handleSave = async () => {
    try {
      const updates = { description, features };
      if (description.trim()) updates.name = description.substring(0, 40).trim();
      const res = await api.put(`/projects/${selectedProject.id}`, updates);
      setSelectedProject(res.data);
      fetchProjects();
    } catch (err) { setError(err.response?.data?.detail || "Save failed"); }
  };

  const handleSaveToMongo = async () => {
    setSaveMsg("");
    try {
      await api.post(`/projects/${selectedProject.id}/save-to-mongo`);
      setSaveMsg("Saved to MongoDB!");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save to MongoDB");
    }
  };

  const handleExtract = async () => {
    if (!description.trim() || !features.trim()) {
      setError("Please fill in both Project Description and Detailed Features");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/extract`, { description, features });
      setSelectedProject(res.data);
      const name = description.substring(0, 40).trim() || "Untitled";
      await api.put(`/projects/${selectedProject.id}`, { name });
      fetchProjects();
    } catch (err) {
      setError(err.response?.data?.detail || "Extraction failed");
    } finally { setLoading(false); }
  };

  const handleRefine = async () => {
    if (!refineText.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/refine`, {
        entities: selectedProject.entities,
        instruction: refineText,
      });
      setSelectedProject(res.data);
      setRefineText("");
      fetchProjects();
    } catch (err) {
      setError(err.response?.data?.detail || "Refinement failed");
    } finally { setLoading(false); }
  };

  const handleFinalize = async () => {
    try {
      const res = await api.post(`/projects/${selectedProject.id}/finalize`);
      setSelectedProject(res.data);
      fetchProjects();
    } catch (err) { setError(err.response?.data?.detail || "Finalize failed"); }
  };

  const handleUnlock = async () => {
    try {
      const res = await api.post(`/projects/${selectedProject.id}/unlock`);
      setSelectedProject(res.data);
      fetchProjects();
    } catch (err) { setError(err.response?.data?.detail || "Unlock failed"); }
  };

  const handleDownload = async (format) => {
    try {
      const res = await api.get(`/projects/${selectedProject.id}/download-${format}`, { responseType: "blob" });
      const ext = format === "json" ? "json" : "sql";
      const name = (selectedProject.name || "schema").toLowerCase().replace(/\s+/g, "_");
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${name}_schema.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.response?.data?.detail || "Download failed"); }
  };

  const handleGenerateValidation = async () => {
    if (!validationRules.trim()) return;
    setValidationLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/generate-validation`, { rules: validationRules });
      setSelectedProject(res.data);
      setValidationCode(res.data.validation_code || "");
    } catch (err) {
      setError(err.response?.data?.detail || "Validation generation failed");
    } finally { setValidationLoading(false); }
  };

  const handleGenerateUI = async () => {
    if (!uiDescription.trim()) return;
    setUILoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/generate-ui`, { description: uiDescription });
      setSelectedProject(res.data);
      setUICode(res.data.ui_code || "");
    } catch (err) {
      setError(err.response?.data?.detail || "UI generation failed");
    } finally { setUILoading(false); }
  };

  const downloadCode = (code, filename) => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const toggleTable = (key) => setExpandedTables((prev) => ({ ...prev, [key]: !prev[key] }));

  const parsedEntities = selectedProject?.entities ? (() => { try { return JSON.parse(selectedProject.entities); } catch { return null; } })() : null;
  const tableCount = parsedEntities?.tables?.length || 0;
  const drafts = projects.filter((p) => p.status === "draft");
  const finalized = projects.filter((p) => p.status === "finalized");
  const getTableCount = (p) => { try { return JSON.parse(p.entities)?.tables?.length || 0; } catch { return 0; } };

  return (
    <div style={styles.container}>
      {showNewModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <h3 style={styles.modalTitle}>New Project</h3>
            <input type="text" placeholder="Project Name" value={newName}
              onChange={(e) => setNewName(e.target.value)} style={styles.input} />
            <label style={styles.label}>Target Language</label>
            <select value={newLanguage} onChange={(e) => setNewLanguage(e.target.value)} style={styles.select}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <div style={styles.modalActions}>
              <button onClick={handleCreateProject} style={styles.extractBtn}>Create</button>
              <button onClick={() => setShowNewModal(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...styles.sidebar, width: sidebarOpen ? "250px" : "0px", padding: sidebarOpen ? "16px" : "0px", overflow: "hidden" }}>
        <div style={styles.sidebarHeader}><h2 style={styles.logo}>Text Dev IDE</h2></div>
        <button onClick={() => setShowNewModal(true)} style={styles.newProjectBtn}>+ New Project</button>
        <div style={styles.projectList}>
          <p style={styles.sectionLabel}>DRAFTS</p>
          {drafts.length === 0 && <p style={styles.emptyText}>No drafts</p>}
          {drafts.map((p) => (
            <ProjectItem key={p.id} project={p} selected={selectedProject?.id === p.id}
              onSelect={handleSelect} onDelete={handleDelete} tableCount={getTableCount(p)}
              activeSection={activeSection} onSectionChange={setActiveSection} />
          ))}
          <p style={{ ...styles.sectionLabel, marginTop: "16px" }}>FINALIZED</p>
          {finalized.length === 0 && <p style={styles.emptyText}>No finalized projects</p>}
          {finalized.map((p) => (
            <ProjectItem key={p.id} project={p} selected={selectedProject?.id === p.id}
              onSelect={handleSelect} onDelete={handleDelete} tableCount={getTableCount(p)}
              activeSection={activeSection} onSectionChange={setActiveSection} />
          ))}
        </div>
        <div style={styles.sidebarFooter}>
          <div style={styles.userSection}>
            {user?.picture && <img src={user.picture} alt="" style={styles.avatar} />}
            <span style={styles.userName}>{user?.full_name || user?.email}</span>
          </div>
          <button onClick={logout} style={styles.logoutBtn}>Logout</button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.topBar}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={styles.menuBtn}>&#9776;</button>
          <h3 style={styles.workspaceTitle}>Workspace</h3>
          {selectedProject && <span style={styles.langBadge}>{selectedProject.language || "Python"}</span>}
          <button onClick={() => setShowNewModal(true)} style={styles.topNewBtn}>+ New Project</button>
        </div>

        <div style={styles.content}>
          {selectedProject ? (
            <div style={styles.workspace}>
              {error && <div style={styles.error}>{error}</div>}

              {activeSection === "schema" && (
                <>
                  <div style={styles.inputSection}>
                    <label style={styles.label}>Project Description</label>
                    <textarea placeholder="e.g., A library management system..." value={description}
                      onChange={(e) => setDescription(e.target.value)} style={styles.textarea} rows={3} />
                  </div>
                  <div style={styles.inputSection}>
                    <label style={styles.label}>Detailed Features</label>
                    <textarea placeholder="e.g., Books need ISBN, title..." value={features}
                      onChange={(e) => setFeatures(e.target.value)} style={styles.textarea} rows={4} />
                  </div>
                  {!parsedEntities && (
                    <button onClick={handleExtract} disabled={loading}
                      style={{ ...styles.extractBtn, opacity: loading ? 0.6 : 1, marginBottom: "16px" }}>
                      {loading ? "Analyzing..." : "Extract Entities"}
                    </button>
                  )}
                  {loading && <p style={styles.loadingText}>Analyzing architecture...</p>}

                  {parsedEntities && (
                    <div style={styles.treeSection}>
                      <div style={styles.treeContainer}>
                        <h3 style={styles.treeTitle}>Database Schema</h3>
                        <div style={styles.treeRoot}>
                          <div onClick={() => toggleTable("__root__")} style={styles.treeNodeRow}>
                            <span style={styles.treeToggle}>{expandedTables["__root__"] === false ? "▶" : "▼"}</span>
                            <span style={styles.treeFolderIcon}>&#128193;</span>
                            <span style={styles.treeLabel}>Tables</span>
                          </div>
                          {expandedTables["__root__"] !== false && parsedEntities.tables.map((table) => (
                            <div key={table.name} style={styles.treeTableGroup}>
                              <div style={styles.treeLine}>
                                <div onClick={() => toggleTable(table.name)} style={styles.treeNodeRow}>
                                  <span style={styles.treeToggle}>{expandedTables[table.name] ? "▼" : "▶"}</span>
                                  <span style={styles.treeTableIcon}>&#9638;</span>
                                  <span style={styles.treeTableBadge}>Table: {table.name}</span>
                                </div>
                              </div>
                              {expandedTables[table.name] && table.columns.map((col) => (
                                <div key={col.name} style={styles.treeColGroup}>
                                  <div style={styles.treeColLine}>
                                    <div onClick={() => toggleTable(`${table.name}.${col.name}`)} style={styles.treeNodeRow}>
                                      <span style={styles.treeToggle}>{expandedTables[`${table.name}.${col.name}`] ? "▼" : "▶"}</span>
                                      <span style={styles.treeColIcon}>&#9638;</span>
                                      <span style={styles.treeColBadge}>Col: {col.name}</span>
                                    </div>
                                  </div>
                                  {expandedTables[`${table.name}.${col.name}`] && (
                                    <div style={styles.treePropsGroup}>
                                      <div style={styles.treePropRow}><span style={styles.treePropIcon}>&#9776;</span><span style={styles.treePropText}>Type: {col.type}</span></div>
                                      {col.pk && <div style={styles.treePropRow}><span style={styles.treePropIcon}>&#9776;</span><span style={styles.treePropText}>Primary Key</span></div>}
                                      {col.pk && <div style={styles.treePropRow}><span style={styles.treePropIcon}>&#9776;</span><span style={styles.treePropText}>Auto Increment</span></div>}
                                      {col.fk && <div style={styles.treePropRow}><span style={styles.treePropIcon}>&#9776;</span><span style={styles.treePropText}>Foreign Key (references {col.fk})</span></div>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>

                      {selectedProject.status === "finalized" && (
                        <div style={styles.finalizedSection}>
                          <div style={styles.finalizedBanner}>Schema finalized</div>
                          <div style={styles.downloadButtons}>
                            <button onClick={() => handleDownload("sql")} style={styles.downloadSqlBtn}>Download SQL</button>
                            <button onClick={() => handleDownload("json")} style={styles.downloadJsonBtn}>Download JSON</button>
                          </div>
                        </div>
                      )}

                      <div style={styles.refineSection}>
                        <label style={styles.label}>Refine Architecture</label>
                        <textarea placeholder="e.g., Add a publisher table..." value={refineText}
                          onChange={(e) => setRefineText(e.target.value)} style={styles.textarea} rows={3} />
                        <div style={styles.actionButtons}>
                          <button onClick={handleRefine} disabled={loading || !refineText.trim()} style={styles.updateBtn}>Update Schema</button>
                          <button onClick={handleExtract} disabled={loading} style={styles.reExtractBtn}>Re-Extract</button>
                          {selectedProject.status !== "finalized"
                            ? <button onClick={handleFinalize} style={styles.finalizeBtn}>Finalize & Lock</button>
                            : <button onClick={handleUnlock} style={styles.editSchemaBtn}>Unlock Draft</button>}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeSection === "validation" && (
                <div>
                  <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>Validation Rules</h3>
                    <span style={styles.langBadgeSmall}>Generating {selectedProject.language || "Python"} code</span>
                  </div>
                  <div style={styles.inputSection}>
                    <label style={styles.label}>Describe your validation rules in plain English</label>
                    <textarea placeholder="e.g., Student age must be less than 24. Email must be valid..."
                      value={validationRules} onChange={(e) => setValidationRules(e.target.value)} style={styles.textarea} rows={5} />
                  </div>
                  <button onClick={handleGenerateValidation} disabled={validationLoading || !validationRules.trim()}
                    style={{ ...styles.extractBtn, opacity: validationLoading ? 0.6 : 1 }}>
                    {validationLoading ? "Generating..." : "Generate Validation Code"}
                  </button>
                  {validationCode && (
                    <div style={styles.codeSection}>
                      <div style={styles.codeHeader}>
                        <span style={styles.codeTitle}>Generated Validation Code</span>
                        <button onClick={() => downloadCode(validationCode, `validation.${selectedProject.language === "Python" ? "py" : selectedProject.language === "Java" ? "java" : "js"}`)}
                          style={styles.downloadCodeBtn}>Download</button>
                      </div>
                      <pre style={styles.codeBlock}>{validationCode}</pre>
                    </div>
                  )}
                </div>
              )}

              {activeSection === "ui" && (
                <div>
                  <div style={styles.sectionHeader}>
                    <h3 style={styles.sectionTitle}>User Interface</h3>
                    <span style={styles.langBadgeSmall}>Generating {selectedProject.language || "HTML"} UI</span>
                  </div>
                  <div style={styles.inputSection}>
                    <label style={styles.label}>Describe the UI you want</label>
                    <textarea placeholder="e.g., Display order items in a table with edit and delete buttons..."
                      value={uiDescription} onChange={(e) => setUIDescription(e.target.value)} style={styles.textarea} rows={5} />
                  </div>
                  <button onClick={handleGenerateUI} disabled={uiLoading || !uiDescription.trim()}
                    style={{ ...styles.extractBtn, opacity: uiLoading ? 0.6 : 1 }}>
                    {uiLoading ? "Generating..." : "Generate UI Code"}
                  </button>
                  {uiCode && (
                    <div style={styles.codeSection}>
                      <div style={styles.codeHeader}>
                        <span style={styles.codeTitle}>Generated UI</span>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => setShowUiCode(!showUiCode)}
                            style={{ ...styles.downloadCodeBtn, color: showUiCode ? "#f59e0b" : "#667eea" }}>
                            {showUiCode ? "Show Preview" : "Show Code"}
                          </button>
                          <button onClick={() => downloadCode(uiCode, "ui.html")}
                            style={styles.downloadCodeBtn}>Download</button>
                        </div>
                      </div>
                      {showUiCode ? (
                        <pre style={styles.codeBlock}>{uiCode}</pre>
                      ) : (
                        <iframe
                          srcDoc={uiCode}
                          style={styles.previewFrame}
                          title="UI Preview"
                          sandbox="allow-scripts"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Save to MongoDB - fixed bottom right */}
              <div style={styles.saveToMongoContainer}>
                {saveMsg && <span style={styles.saveMsgText}>{saveMsg}</span>}
                <button onClick={handleSaveToMongo} style={styles.saveToMongoBtn}>
                  Save to MongoDB
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <h2 style={styles.emptyTitle}>Welcome, {user?.full_name || user?.email}</h2>
              <p style={styles.emptySubtitle}>Create a new project to start designing your database architecture</p>
              <button onClick={() => setShowNewModal(true)} style={styles.newProjectBtn}>+ New Project</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectItem({ project, selected, onSelect, onDelete, tableCount, activeSection, onSectionChange }) {
  return (
    <div>
      <div onClick={() => onSelect(project)} style={{ ...styles.projectItem, background: selected ? "#2a2a3e" : "transparent" }}>
        <div style={styles.projectItemContent}>
          <span style={styles.projectName}>{project.name?.substring(0, 22)}{project.name?.length > 22 ? "..." : ""}</span>
          <div style={styles.projectMeta}>
            <span style={styles.langTag}>{project.language || "Python"}</span>
            {tableCount > 0 && <span style={styles.tableCountBadge}>{tableCount} tables</span>}
          </div>
        </div>
        <button onClick={(e) => onDelete(project.id, e)} style={styles.deleteBtn} title="Delete">&#128465;</button>
      </div>
      {selected && (
        <div style={styles.subNav}>
          {[{ key: "schema", label: "Database Schema" }, { key: "validation", label: "Validation" }, { key: "ui", label: "User Interface" }].map((s) => (
            <div key={s.key} onClick={() => onSectionChange(s.key)}
              style={{ ...styles.subNavItem, color: activeSection === s.key ? "#667eea" : "#888", background: activeSection === s.key ? "#667eea15" : "transparent" }}>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: "flex", minHeight: "100vh", background: "#0f0c29", color: "#fff", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  sidebar: { background: "#1a1a2e", borderRight: "1px solid #222", display: "flex", flexDirection: "column", transition: "width 0.2s, padding 0.2s", flexShrink: 0 },
  sidebarHeader: { marginBottom: "16px" },
  logo: { fontSize: "18px", fontWeight: 700, margin: 0, color: "#fff" },
  newProjectBtn: { padding: "10px 16px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #667eea, #764ba2)", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", width: "100%", marginBottom: "20px" },
  projectList: { flex: 1, overflowY: "auto" },
  sectionLabel: { fontSize: "11px", fontWeight: 600, color: "#666", letterSpacing: "1px", margin: "0 0 8px" },
  emptyText: { color: "#555", fontSize: "13px" },
  projectItem: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "6px", cursor: "pointer", marginBottom: "2px" },
  projectItemContent: { display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden", flex: 1 },
  projectName: { fontSize: "13px", whiteSpace: "nowrap" },
  projectMeta: { display: "flex", gap: "6px", alignItems: "center" },
  langTag: { fontSize: "10px", color: "#667eea", background: "#667eea22", padding: "1px 6px", borderRadius: "3px" },
  tableCountBadge: { fontSize: "10px", color: "#888" },
  deleteBtn: { background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "13px", padding: "2px 4px", flexShrink: 0 },
  subNav: { paddingLeft: "16px", marginBottom: "4px" },
  subNavItem: { fontSize: "12px", padding: "5px 10px", borderRadius: "4px", cursor: "pointer", marginBottom: "1px" },
  sidebarFooter: { borderTop: "1px solid #222", paddingTop: "12px" },
  userSection: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" },
  avatar: { width: "28px", height: "28px", borderRadius: "50%" },
  userName: { fontSize: "13px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logoutBtn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid #333", background: "transparent", color: "#888", cursor: "pointer", fontSize: "12px", width: "100%" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topBar: { display: "flex", alignItems: "center", gap: "16px", padding: "12px 24px", borderBottom: "1px solid #222" },
  menuBtn: { background: "none", border: "none", color: "#888", fontSize: "20px", cursor: "pointer", padding: "4px" },
  workspaceTitle: { fontSize: "16px", fontWeight: 600, margin: 0, flex: 1 },
  langBadge: { fontSize: "12px", color: "#667eea", background: "#667eea22", padding: "3px 10px", borderRadius: "4px", fontWeight: 600 },
  topNewBtn: { padding: "8px 16px", borderRadius: "6px", border: "none", background: "#667eea", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  content: { flex: 1, padding: "24px 32px", overflowY: "auto", position: "relative" },
  workspace: { maxWidth: "800px", paddingBottom: "80px" },
  inputSection: { marginBottom: "20px" },
  label: { display: "block", fontSize: "14px", fontWeight: 600, marginBottom: "6px", color: "#ccc" },
  input: { width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid #333", background: "#1e1e2e", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "12px" },
  select: { width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid #333", background: "#1e1e2e", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "12px" },
  textarea: { width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid #333", background: "#1e1e2e", color: "#fff", fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  error: { background: "#ff4d4f22", border: "1px solid #ff4d4f", color: "#ff4d4f", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "16px" },
  saveBtn: { padding: "10px 24px", borderRadius: "8px", border: "none", background: "#16a34a", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" },
  extractBtn: { padding: "10px 24px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" },
  cancelBtn: { padding: "10px 24px", borderRadius: "8px", border: "1px solid #333", background: "transparent", color: "#888", fontSize: "14px", cursor: "pointer" },
  loadingText: { color: "#888", fontSize: "14px", fontStyle: "italic" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalCard: { background: "#1e1e2e", borderRadius: "12px", padding: "32px", width: "400px", maxWidth: "90vw", border: "1px solid #333" },
  modalTitle: { fontSize: "20px", margin: "0 0 20px", color: "#fff" },
  modalActions: { display: "flex", gap: "12px", marginTop: "8px" },
  treeSection: { marginTop: "28px" },
  treeContainer: { background: "#1e1e2e", borderRadius: "10px", padding: "24px 28px", border: "1px solid #333", color: "#ddd" },
  treeTitle: { fontSize: "20px", fontWeight: 700, margin: "0 0 16px", color: "#fff" },
  treeRoot: { paddingLeft: "8px" },
  treeNodeRow: { display: "flex", alignItems: "center", gap: "6px", padding: "3px 0", cursor: "pointer", userSelect: "none" },
  treeToggle: { fontSize: "10px", color: "#999", width: "14px", flexShrink: 0 },
  treeFolderIcon: { fontSize: "14px" },
  treeLabel: { fontSize: "14px", fontWeight: 600, color: "#ddd" },
  treeTableGroup: { paddingLeft: "24px" },
  treeLine: { borderLeft: "1px solid #444", paddingLeft: "12px", marginLeft: "6px" },
  treeTableIcon: { fontSize: "10px", color: "#4a8", marginRight: "2px" },
  treeTableBadge: { fontSize: "13px", fontWeight: 600, color: "#fff", background: "#4caf50", padding: "2px 10px", borderRadius: "4px" },
  treeColGroup: { paddingLeft: "36px" },
  treeColLine: { borderLeft: "1px solid #444", paddingLeft: "12px", marginLeft: "6px" },
  treeColIcon: { fontSize: "10px", color: "#4a8", marginRight: "2px" },
  treeColBadge: { fontSize: "13px", fontWeight: 600, color: "#fff", background: "#66bb6a", padding: "2px 10px", borderRadius: "4px" },
  treePropsGroup: { paddingLeft: "60px" },
  treePropRow: { display: "flex", alignItems: "center", gap: "8px", padding: "2px 0", borderLeft: "1px solid #444", paddingLeft: "12px", marginLeft: "6px" },
  treePropIcon: { fontSize: "11px", color: "#666" },
  treePropText: { fontSize: "13px", color: "#aaa" },
  finalizedSection: { marginTop: "20px" },
  finalizedBanner: { padding: "10px 16px", background: "#16a34a22", border: "1px solid #16a34a", borderRadius: "8px", color: "#16a34a", fontSize: "14px", fontWeight: 600, textAlign: "center", marginBottom: "12px" },
  downloadButtons: { display: "flex", gap: "12px" },
  downloadSqlBtn: { padding: "10px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", flex: 1 },
  downloadJsonBtn: { padding: "10px 20px", borderRadius: "8px", border: "none", background: "#7c3aed", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", flex: 1 },
  refineSection: { marginTop: "24px", padding: "20px", background: "#1e1e2e", borderRadius: "8px", border: "1px solid #333" },
  actionButtons: { display: "flex", gap: "12px", marginTop: "12px", flexWrap: "wrap" },
  updateBtn: { padding: "10px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  reExtractBtn: { padding: "10px 20px", borderRadius: "8px", border: "none", background: "#7c3aed", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  finalizeBtn: { padding: "10px 20px", borderRadius: "8px", border: "none", background: "#dc2626", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  editSchemaBtn: { padding: "10px 20px", borderRadius: "8px", border: "1px solid #f59e0b", background: "transparent", color: "#f59e0b", fontSize: "13px", fontWeight: 600, cursor: "pointer" },
  sectionHeader: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" },
  sectionTitle: { fontSize: "20px", fontWeight: 700, margin: 0 },
  langBadgeSmall: { fontSize: "12px", color: "#888", background: "#333", padding: "3px 10px", borderRadius: "4px" },
  codeSection: { marginTop: "20px" },
  codeHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
  codeTitle: { fontSize: "14px", fontWeight: 600, color: "#ccc" },
  downloadCodeBtn: { padding: "6px 14px", borderRadius: "6px", border: "1px solid #333", background: "transparent", color: "#667eea", fontSize: "12px", fontWeight: 600, cursor: "pointer" },
  codeBlock: { background: "#0d1117", border: "1px solid #333", borderRadius: "8px", padding: "16px", overflowX: "auto", fontFamily: "'Consolas', 'Fira Code', monospace", fontSize: "13px", color: "#e6edf3", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "500px", overflowY: "auto" },
  previewFrame: { width: "100%", minHeight: "400px", border: "1px solid #333", borderRadius: "8px", background: "#fff" },
  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" },
  emptyTitle: { fontSize: "28px", margin: "0 0 8px" },
  emptySubtitle: { color: "#888", fontSize: "15px", margin: "0 0 24px" },
  saveToMongoContainer: { position: "fixed", bottom: "24px", right: "32px", display: "flex", alignItems: "center", gap: "12px", zIndex: 100 },
  saveToMongoBtn: { padding: "12px 28px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", fontSize: "15px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(22,163,74,0.4)" },
  saveMsgText: { color: "#16a34a", fontSize: "14px", fontWeight: 600, background: "#16a34a22", padding: "8px 14px", borderRadius: "8px" },
};
