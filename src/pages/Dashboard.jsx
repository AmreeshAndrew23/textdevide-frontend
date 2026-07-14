import { useState, useEffect, useMemo, memo, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

const LANGUAGES = ["Python", "Java", "JavaScript", "TypeScript", "C#", "Go", "Ruby", "PHP"];
const FRONTEND_LANGUAGES = ["React", "Angular", "Vue", "Flutter", "HTML/CSS", "Next.js", "Svelte"];

// Fallbacks used until /auth/config/options loads
const DEFAULT_DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MMM-YYYY", "DD.MM.YYYY"];
const DEFAULT_LANGUAGE_OPTIONS = [{ code: "en", label: "English" }];

export default function Dashboard() {
  const { user, logout, setUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("workbench");

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
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

  const [frontendLang, setFrontendLang] = useState("React");

  // Architect Workbench (single-prompt requirement -> schema + UI + validation)
  const [workbenchRequirement, setWorkbenchRequirement] = useState("");
  const [workbenchFollowUp, setWorkbenchFollowUp] = useState("");
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchConfirming, setWorkbenchConfirming] = useState(false);
  const [workbenchError, setWorkbenchError] = useState("");
  const [workbenchChanges, setWorkbenchChanges] = useState(null);
  const [workbenchDraft, setWorkbenchDraft] = useState(null);

  // Multi-screen state
  const [screens, setScreens] = useState([]);
  const [activeScreenId, setActiveScreenId] = useState(null);
  const [screenName, setScreenName] = useState("");
  const [screenDesc, setScreenDesc] = useState("");
  const [screenXml, setScreenXml] = useState("");
  const [screenHtml, setScreenHtml] = useState("");
  const [screenApi, setScreenApi] = useState("");
  const [screenTab, setScreenTab] = useState("html");
  const [screenXmlLoading, setScreenXmlLoading] = useState(false);
  const [screenHtmlLoading, setScreenHtmlLoading] = useState(false);
  const [screenApiLoading, setScreenApiLoading] = useState(false);
  const [showScreenCode, setShowScreenCode] = useState(false);

  // Ask about this project
  const [askQuestion, setAskQuestion] = useState("");
  const [askHistory, setAskHistory] = useState([]);

  const [showSettings, setShowSettings] = useState(false);
  const [githubToken, setGithubToken] = useState(user?.github_token || "");
  const [githubSaving, setGithubSaving] = useState(false);
  const [pushingGithub, setPushingGithub] = useState(false);

  // Configuration (date format + language)
  const [dateFormatOptions, setDateFormatOptions] = useState(DEFAULT_DATE_FORMATS);
  const [languageOptions, setLanguageOptions] = useState(DEFAULT_LANGUAGE_OPTIONS);
  const [dateFormat, setDateFormat] = useState(user?.date_format || "YYYY-MM-DD");
  const [language, setLanguage] = useState(user?.language || "en");
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  // Load dropdown options for the Configuration screen
  useEffect(() => {
    api.get("/auth/config/options")
      .then(res => {
        if (res.data?.date_formats?.length) setDateFormatOptions(res.data.date_formats);
        if (res.data?.languages?.length) setLanguageOptions(res.data.languages);
      })
      .catch(e => console.error(e));
  }, []);

  // Keep config selects in sync when the user loads/changes
  useEffect(() => {
    if (user?.date_format) setDateFormat(user.date_format);
    if (user?.language) setLanguage(user.language);
  }, [user?.date_format, user?.language]);

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await api.put("/auth/me", { date_format: dateFormat, language });
      setUser(res.data);
      setSaveMsg("Configuration saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e) {
      alert("Failed to save configuration");
    } finally {
      setConfigSaving(false);
    }
  };

  const fetchProjects = async () => {
    try { setProjects((await api.get("/projects")).data); } catch (e) { console.error(e); }
  };

  const selectProject = (data) => {
    setSelectedProject(data);
    setDescription(data.description || "");
    setFeatures(data.features || "");
    setActiveSection("workbench");
    setValidationRules(data.validation_rules || "");
    setValidationCode(data.validation_code || "");
    setFrontendLang(data.frontend_language || "React");
    const parsedScreens = data.ui_screens ? (() => { try { return JSON.parse(data.ui_screens); } catch { return []; } })() : [];
    setScreens(parsedScreens);
    setActiveScreenId(null);
    setScreenName(""); setScreenDesc(""); setScreenXml(""); setScreenHtml(""); setScreenApi("");
    setScreenTab("html"); setShowScreenCode(false);
    setWorkbenchRequirement(""); setWorkbenchFollowUp(""); setWorkbenchChanges(null); setWorkbenchDraft(null); setWorkbenchError("");
    setError(""); setSaveMsg("");
  };

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post("/projects", { name: newName, language: newLanguage });
      setProjects([res.data, ...projects]);
      selectProject(res.data);
      setShowNewModal(false); setNewName("");
    } catch (e) { console.error(e); }
  };

  const handleSelect = async (p) => {
    try { selectProject((await api.get(`/projects/${p.id}`)).data); } catch (e) { console.error(e); }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/projects/${id}`);
      setProjects(projects.filter(p => p.id !== id));
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch (e) { console.error(e); }
  };

  const handleSaveToMongo = async () => {
    setSaveMsg("");
    try {
      await api.post(`/projects/${selectedProject.id}/save-to-mongo`);
      setSaveMsg("Project saved successfully!");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (err) { setError(err.response?.data?.detail || "Save failed"); }
  };

  const handleExtract = async () => {
    if (!description.trim() || !features.trim()) { setError("Please fill in both fields"); return; }
    setLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/extract`, { description, features });
      setSelectedProject(res.data);
      setValidationCode(res.data.validation_code || "");
      await api.put(`/projects/${selectedProject.id}`, { name: description.substring(0, 40).trim() || "Untitled" });
      fetchProjects();
    } catch (err) { setError(err.response?.data?.detail || "Extraction failed"); }
    finally { setLoading(false); }
  };

  const handleRefine = async () => {
    if (!refineText.trim()) return;
    setLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/refine`, { entities: selectedProject.entities, instruction: refineText });
      setSelectedProject(res.data); setRefineText(""); fetchProjects();
    } catch (err) { setError(err.response?.data?.detail || "Refinement failed"); }
    finally { setLoading(false); }
  };

  const handleWorkbenchInterpret = async (isFollowUp) => {
    const requirement = (isFollowUp ? workbenchFollowUp : workbenchRequirement).trim();
    if (!requirement) return;
    setWorkbenchLoading(true); setWorkbenchError("");
    try {
      const body = { requirement };
      if (isFollowUp && workbenchDraft) {
        body.current_entities = workbenchDraft.entities;
        body.current_screens = workbenchDraft.screens;
        body.current_validation_rules = workbenchDraft.validation_rules;
      }
      const res = await api.post(`/projects/${selectedProject.id}/workbench/interpret`, body);
      setWorkbenchChanges(res.data.changes);
      setWorkbenchDraft({ entities: res.data.entities, screens: res.data.screens, validation_rules: res.data.validation_rules });
      if (isFollowUp) setWorkbenchFollowUp("");
    } catch (err) {
      setWorkbenchError(err.response?.data?.detail || "Couldn't interpret the requirement. Try rephrasing it with more detail.");
    } finally {
      setWorkbenchLoading(false);
    }
  };

  const handleWorkbenchConfirm = async () => {
    if (!workbenchDraft) return;
    setWorkbenchConfirming(true); setWorkbenchError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/workbench/confirm`, workbenchDraft);
      _syncScreens(res.data);
      setValidationCode(res.data.validation_code || "");
      setValidationRules(res.data.validation_rules || "");
      fetchProjects();
      setWorkbenchChanges(null); setWorkbenchDraft(null);
      setWorkbenchRequirement(""); setWorkbenchFollowUp("");
      setSaveMsg("Generated database schema, screens, and validation code.");
      setTimeout(() => setSaveMsg(""), 5000);
    } catch (err) {
      setWorkbenchError(err.response?.data?.detail || "Generation failed");
    } finally {
      setWorkbenchConfirming(false);
    }
  };

  const handleWorkbenchDiscard = () => {
    setWorkbenchChanges(null); setWorkbenchDraft(null); setWorkbenchFollowUp("");
  };

  const handleFinalize = async () => {
    try { const res = await api.post(`/projects/${selectedProject.id}/finalize`); setSelectedProject(res.data); fetchProjects(); }
    catch (err) { setError(err.response?.data?.detail || "Failed"); }
  };

  const handleUnlock = async () => {
    try { const res = await api.post(`/projects/${selectedProject.id}/unlock`); setSelectedProject(res.data); fetchProjects(); }
    catch (err) { setError(err.response?.data?.detail || "Failed"); }
  };

  const handleDownload = async (fmt) => {
    try {
      const res = await api.get(`/projects/${selectedProject.id}/download-${fmt}`, { responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([res.data]));
      a.download = `${(selectedProject.name || "schema").toLowerCase().replace(/\s+/g, "_")}_schema.${fmt}`;
      a.click();
    } catch (err) { setError(err.response?.data?.detail || "Download failed"); }
  };

  const handleClearValidation = async () => {
    try {
      const res = await api.put(`/projects/${selectedProject.id}`, { validation_code: "", validation_rules: "" });
      setSelectedProject(res.data);
      setValidationCode("");
      setValidationRules("");
    } catch (err) { setError(err.response?.data?.detail || "Clear failed"); }
  };

  const handleDeleteFile = (filename) => {
    const files = parseFiles(validationCode);
    const remaining = files.filter(f => f.name !== filename);
    const newCode = remaining.map(f => `=== FILENAME: ${f.name} ===\n${f.code}`).join("\n\n");
    setValidationCode(newCode);
    api.put(`/projects/${selectedProject.id}`, { validation_code: newCode });
  };

  const handleGenValidation = async () => {
    if (!validationRules.trim()) return;
    setValidationLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/generate-validation`, { rules: validationRules });
      setSelectedProject(res.data); setValidationCode(res.data.validation_code || "");
      setValidationRules("");
    } catch (err) { setError(err.response?.data?.detail || "Generation failed"); }
    finally { setValidationLoading(false); }
  };

  const handleFrontendLangChange = async (val) => {
    setFrontendLang(val);
    try {
      await api.put(`/projects/${selectedProject.id}`, { frontend_language: val });
    } catch (e) { console.error(e); }
  };

  // Sync screens from API response
  const _syncScreens = (data) => {
    setSelectedProject(data);
    const parsed = data.ui_screens ? (() => { try { return JSON.parse(data.ui_screens); } catch { return []; } })() : [];
    setScreens(parsed);
    return parsed;
  };

  const handleSelectScreen = (screen) => {
    setActiveScreenId(screen.id);
    setScreenName(screen.name);
    setScreenDesc(screen.description || "");
    setScreenXml(screen.xml || "");
    setScreenHtml(screen.html || "");
    setScreenApi(screen.api || "");
    setScreenTab(screen.html ? "html" : screen.xml ? "xml" : "html");
    setShowScreenCode(false);
    setError("");
  };

  const handleNewScreen = () => {
    setActiveScreenId(null);
    setScreenName(""); setScreenDesc(""); setScreenXml(""); setScreenHtml(""); setScreenApi("");
    setScreenTab("html"); setShowScreenCode(false); setError("");
  };

  const handleDeleteScreen = async (screenId) => {
    try {
      const res = await api.delete(`/projects/${selectedProject.id}/screens/${screenId}`);
      _syncScreens(res.data);
      if (activeScreenId === screenId) handleNewScreen();
    } catch (err) { setError(err.response?.data?.detail || "Delete failed"); }
  };

  // Generate XML + HTML for one screen entry (create it first if screenId is null)
  const _generateOneScreen = async (screenId, name, desc) => {
    if (!screenId) {
      const res = await api.post(`/projects/${selectedProject.id}/screens`, { name, description: desc });
      const parsed = _syncScreens(res.data);
      screenId = parsed[parsed.length - 1].id;
    } else {
      try {
        const res = await api.put(`/projects/${selectedProject.id}/screens/${screenId}`, { name, description: desc });
        _syncScreens(res.data);
      } catch (e) { /* non-critical */ }
    }

    const xmlRes = await api.post(`/projects/${selectedProject.id}/screens/${screenId}/generate-xml`, { description: desc });
    let parsed = _syncScreens(xmlRes.data);
    const xml = parsed.find(s => s.id === screenId)?.xml || "";

    let html = "";
    if (xml) {
      const htmlRes = await api.post(`/projects/${selectedProject.id}/screens/${screenId}/generate-html`, { xml, frontend_lang: frontendLang });
      parsed = _syncScreens(htmlRes.data);
      html = parsed.find(s => s.id === screenId)?.html || "";
    }
    return { screenId, name, desc, xml, html };
  };

  const handleGenerateScreen = async () => {
    if (!screenDesc.trim()) { setError("Enter a screen description first"); return; }
    setError("");
    setScreenXmlLoading(true);
    setScreenXml(""); setScreenHtml(""); setScreenApi("");

    // Step 1: ask the AI whether this description implies one screen or several
    let intents = [{ name: screenName.trim() || screenDesc.substring(0, 40).trim(), description: screenDesc }];
    try {
      const intentRes = await api.post(`/projects/${selectedProject.id}/screens/detect-intents`, { description: screenDesc });
      if (intentRes.data?.screens?.length) intents = intentRes.data.screens;
    } catch (e) { /* fall back to treating it as a single screen */ }

    // Step 2: create/update + generate (XML then HTML) for each detected screen.
    // The first intent reuses the currently open screen (if any); extra intents become new screens.
    let results = [];
    try {
      for (let i = 0; i < intents.length; i++) {
        const item = intents[i];
        const name = item.name || screenDesc.substring(0, 40).trim();
        const desc = item.description || screenDesc;
        const screenId = i === 0 ? activeScreenId : null;
        results.push(await _generateOneScreen(screenId, name, desc));
        if (i === 0) setScreenHtmlLoading(true);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Screen generation failed");
      setScreenXmlLoading(false); setScreenHtmlLoading(false);
      return;
    }
    setScreenXmlLoading(false); setScreenHtmlLoading(false);

    // Show the first generated screen in the editor
    const first = results[0];
    setActiveScreenId(first.screenId);
    setScreenName(first.name);
    setScreenDesc(first.desc);
    setScreenXml(first.xml);
    setScreenHtml(first.html);
    setScreenTab(first.html ? "html" : "xml");

    if (results.length > 1) {
      setSaveMsg(`Generated ${results.length} screens: ${results.map(r => r.name).join(", ")}`);
      setTimeout(() => setSaveMsg(""), 5000);
    }
  };

  const handleRegenHtml = async () => {
    if (!screenXml || !activeScreenId) return;
    setScreenHtmlLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/screens/${activeScreenId}/generate-html`, { xml: screenXml, frontend_lang: frontendLang });
      const parsed = _syncScreens(res.data);
      const updated = parsed.find(s => s.id === activeScreenId);
      setScreenHtml(updated?.html || "");
      setScreenTab("html");
    } catch (err) { setError(err.response?.data?.detail || "HTML generation failed"); }
    finally { setScreenHtmlLoading(false); }
  };

  const handleGenScreenApi = async () => {
    if (!screenXml || !activeScreenId) return;
    setScreenApiLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/screens/${activeScreenId}/generate-api`, { xml: screenXml });
      const parsed = _syncScreens(res.data);
      const updated = parsed.find(s => s.id === activeScreenId);
      setScreenApi(updated?.api || "");
      setScreenTab("api");
    } catch (err) { setError(err.response?.data?.detail || "API generation failed"); }
    finally { setScreenApiLoading(false); }
  };

  const downloadCode = (code, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = name; a.click();
  };

  const toggle = (k) => setExpandedTables(p => ({ ...p, [k]: !p[k] }));

  const entities = useMemo(() => {
    if (!selectedProject?.entities) return null;
    try { return JSON.parse(selectedProject.entities); } catch { return null; }
  }, [selectedProject?.entities]);
  const drafts = useMemo(() => projects.filter(p => p.status === "draft"), [projects]);
  const finalized = useMemo(() => projects.filter(p => p.status === "finalized"), [projects]);
  const tblCount = (p) => { try { return JSON.parse(p.entities)?.tables?.length || 0; } catch { return 0; } };
  const lang = selectedProject?.language || "Python";
  const fileExt = lang === "Python" ? "py" : lang === "Java" ? "java" : lang === "TypeScript" ? "ts" : "js";

  const parseFiles = (code) => {
    if (!code) return [];
    const parts = code.split(/^=== FILENAME:\s*(.+?)\s*===$/m);
    if (parts.length <= 1) return [{ name: `code.${fileExt}`, code: code.trim() }];
    const files = [];
    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]?.trim()) files.push({ name: parts[i].trim(), code: parts[i + 1].trim() });
    }
    return files.length > 0 ? files : [{ name: `code.${fileExt}`, code: code.trim() }];
  };

  const syntaxLang = (filename) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    const map = { py: "python", java: "java", js: "javascript", ts: "typescript", jsx: "jsx", tsx: "tsx", html: "html", css: "css", cs: "csharp", go: "go", rb: "ruby", php: "php", sql: "sql", json: "json" };
    return map[ext] || "javascript";
  };

  const handleAsk = () => {
    const question = askQuestion.trim();
    if (!question) return;
    const answer = answerProjectQuestion(question, entities, screens, selectedProject) ||
      "I can currently answer questions about tables, columns, screens, primary/foreign keys, and project language/status — try things like \"list all tables\" or \"list screen names\".";
    setAskHistory(h => [...h, { question, answer }]);
    setAskQuestion("");
  };

  const sectionGroups = [
    {
      heading: "WORKSPACE",
      items: [
        { key: "workbench", label: "Architect Workbench" },
        { key: "schema", label: "Database Schema" },
        { key: "validation", label: "Validation" },
        { key: "ui", label: "User Interface" },
      ],
    },
    {
      heading: "ARCHITECT VIEW",
      items: [
        { key: "arch-db", label: "DB Schema" },
        { key: "arch-validation", label: "Validation" },
        { key: "arch-ui", label: "User Interface" },
        { key: "arch-config", label: "Configuration" },
      ],
    },
    {
      heading: "ASK",
      items: [
        { key: "ask", label: "Ask about this project" },
      ],
    },
  ];

  return (
    <div style={S.wrap}>
      {/* Modal */}
      {showNewModal && (
        <div style={S.overlay} onClick={() => setShowNewModal(false)}>
          <div className="card fade-in" style={S.modal} onClick={e => e.stopPropagation()}>
            <h3 style={S.modalH}>Create New Project</h3>
            <p style={S.modalSub}>Give your project a name and choose a language</p>
            <label style={S.lbl}>Project Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My awesome project" style={S.inp} autoFocus />
            <label style={S.lbl}>Target Language</label>
            <select value={newLanguage} onChange={e => setNewLanguage(e.target.value)} style={S.sel}>
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button className="btn-primary" onClick={handleCreateProject} style={{ flex: 1, justifyContent: "center" }}>Create Project</button>
              <button className="btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside style={{ ...S.side, width: sidebarOpen ? 260 : 0, padding: sidebarOpen ? "20px 16px" : 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={S.logo}>Text Dev IDE</h1>
        </div>
        <button className="btn-primary" onClick={() => setShowNewModal(true)} style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}>
          + New Project
        </button>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <SectionHeader text="DRAFTS" count={drafts.length} />
          {drafts.length === 0 && <p style={S.muted}>No draft projects</p>}
          {drafts.map(p => <SideItem key={p.id} p={p} sel={selectedProject?.id === p.id} onSel={handleSelect} onDel={handleDelete} tc={tblCount(p)} sec={activeSection} setSec={setActiveSection} sectionGroups={sectionGroups} />)}

          <SectionHeader text="FINALIZED" count={finalized.length} />
          {finalized.length === 0 && <p style={S.muted}>No finalized projects</p>}
          {finalized.map(p => <SideItem key={p.id} p={p} sel={selectedProject?.id === p.id} onSel={handleSelect} onDel={handleDelete} tc={tblCount(p)} sec={activeSection} setSec={setActiveSection} sectionGroups={sectionGroups} />)}
        </div>

        <div style={{ borderTop: "1px solid #333", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            {user?.picture ? <img src={user.picture} style={{ width: 32, height: 32, borderRadius: "50%" }} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(99,102,241,0.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8", fontWeight: 700, fontSize: 14 }}>{(user?.full_name || user?.email || "U")[0].toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#cfcfcf", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.full_name || "User"}</div>
              <div style={{ fontSize: 11, color: "#7a7a7a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn-secondary" onClick={() => setShowSettings(true)} style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "6px 12px" }}>Settings</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button className="btn-secondary" onClick={logout} style={{ flex: 1, justifyContent: "center", fontSize: 12, padding: "6px 12px" }}>Log out</button>
          </div>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#252526", borderRadius: 12, padding: 32, width: 420, border: "1px solid #333", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 style={{ color: "#e0e0e0", margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Settings</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6, fontWeight: 500 }}>GitHub Personal Access Token</label>
              <input
                type="password"
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                style={{ width: "100%", padding: "9px 12px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 7, color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>Used to auto-create GitHub repos when you start a project. Needs <code>repo</code> scope.</p>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setShowSettings(false)} style={{ padding: "8px 18px" }}>Cancel</button>
              <button className="btn-primary" disabled={githubSaving} onClick={async () => {
                setGithubSaving(true);
                try {
                  const res = await api.put("/auth/me", { github_token: githubToken.trim() });
                  setUser(res.data);
                  setShowSettings(false);
                } catch (e) { alert("Failed to save token"); }
                finally { setGithubSaving(false); }
              }} style={{ padding: "8px 18px" }}>{githubSaving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main style={S.main}>
        <header style={S.topbar}>
          <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">{sidebarOpen ? "←" : "→"}</button>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1, color: "#e0e0e0" }}>
            {selectedProject ? selectedProject.name : "Workspace"}
          </h2>
          {selectedProject && <span style={S.badge}>{lang}</span>}
          {selectedProject?.github_repo_url && (
            <a href={selectedProject.github_repo_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: "#818cf8", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px solid #3c3c3c", borderRadius: 6, background: "#1e1e1e" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              {selectedProject.github_repo}
            </a>
          )}
          {selectedProject && (
            <button className="btn-secondary" disabled={pushingGithub} onClick={async () => {
              setPushingGithub(true);
              try {
                const res = await api.post(`/projects/${selectedProject.id}/push-to-github`);
                setSaveMsg(res.data.message);
                setTimeout(() => setSaveMsg(""), 5000);
                const updated = await api.get(`/projects/${selectedProject.id}`);
                setSelectedProject(updated.data);
              } catch (e) { setError(e.response?.data?.detail || "Push failed"); }
              finally { setPushingGithub(false); }
            }} style={{ fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5 }}>
              {pushingGithub ? "Pushing..." : "↑ Push to GitHub"}
            </button>
          )}
          <button className="btn-primary" onClick={() => setShowNewModal(true)} style={{ fontSize: 13, padding: "8px 14px" }}>+ New</button>
        </header>

        <div style={S.content}>
          {selectedProject ? (
            <div className="fade-in" style={{ maxWidth: 820, paddingBottom: 80 }}>
              {error && <div style={S.error}>{error}</div>}

              {/* ARCHITECT WORKBENCH */}
              {activeSection === "workbench" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>Architect Workbench</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a", maxWidth: 620 }}>
                      Describe the technical requirement in plain language. It will be translated into database schema changes, UI screens, and business rules — refine it below, then generate everything in one go.
                    </p>
                  </div>

                  <div className="card" style={{ padding: 20 }}>
                    <label style={S.lbl}>Technical Requirement</label>
                    <textarea
                      value={workbenchRequirement}
                      onChange={e => setWorkbenchRequirement(e.target.value)}
                      placeholder="e.g. Customers should be able to save multiple shipping addresses. The checkout screen needs an address dropdown, and orders over $500 require manager approval."
                      style={S.ta}
                      rows={6}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                      <button className="btn-primary" onClick={() => handleWorkbenchInterpret(false)} disabled={workbenchLoading || !workbenchRequirement.trim()} style={{ opacity: (workbenchLoading || !workbenchRequirement.trim()) ? 0.6 : 1 }}>
                        {workbenchLoading ? <><span className="spinner" /> Analyzing...</> : "Show me what you understood"}
                      </button>
                      {workbenchError && <span style={{ fontSize: 12.5, color: "#ef4444" }}>{workbenchError}</span>}
                    </div>
                  </div>

                  {!workbenchChanges && !workbenchLoading && (
                    <p style={{ marginTop: 28, fontSize: 12, color: "#5a5a5a", textAlign: "center" }}>— the interpretation will appear below —</p>
                  )}

                  {workbenchChanges && (
                    <>
                      <WorkbenchGrid index="01" title="DB Schema changes" badgeCol="action_type" groupCol="entity_name"
                        columns={[{ key: "entity_name", label: "Entity name" }, { key: "column_name", label: "Column name" }, { key: "action_type", label: "Action type" }]}
                        rows={workbenchChanges.db_schema_changes || []} emptyHint="No database schema changes identified in this requirement." />
                      <WorkbenchGrid index="02" title="Table Catalog"
                        columns={[{ key: "entity_name", label: "Entity name" }, { key: "description", label: "One-line description (used for query routing)" }]}
                        rows={workbenchChanges.table_catalog || []} emptyHint="No tables identified in this requirement." />
                      <WorkbenchGrid index="03" title="UI Screens" groupCol="screen_name"
                        columns={[{ key: "screen_name", label: "Screen name" }, { key: "ui_field_name", label: "UI field name" }, { key: "action", label: "Action" }]}
                        rows={workbenchChanges.ui_screens || []} emptyHint="No UI screen changes identified in this requirement." />
                      <WorkbenchGrid index="04" title="Business Rules" badgeCol="action"
                        columns={[{ key: "rule_name", label: "Rule name" }, { key: "rule_description", label: "Rule description" }, { key: "action", label: "Action" }]}
                        rows={workbenchChanges.business_rules || []} emptyHint="No business rules identified in this requirement." />

                      <div className="card" style={{ padding: 20, marginTop: 24 }}>
                        <label style={S.lbl}>Anything to change?</label>
                        <textarea
                          value={workbenchFollowUp}
                          onChange={e => setWorkbenchFollowUp(e.target.value)}
                          placeholder="e.g. Actually make the approval threshold $1000, and add a phone number field to the address form."
                          style={S.ta}
                          rows={3}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                          <button className="btn-secondary" onClick={() => handleWorkbenchInterpret(true)} disabled={workbenchLoading || !workbenchFollowUp.trim()} style={{ opacity: (workbenchLoading || !workbenchFollowUp.trim()) ? 0.6 : 1 }}>
                            {workbenchLoading ? <><span className="spinner" /> Updating...</> : "Update interpretation"}
                          </button>
                          <button className="btn-primary" onClick={handleWorkbenchConfirm} disabled={workbenchConfirming || workbenchLoading} style={{ opacity: workbenchConfirming ? 0.6 : 1 }}>
                            {workbenchConfirming ? <><span className="spinner" /> Generating schema, screens & validation...</> : "Yes, continue — generate everything"}
                          </button>
                          <button className="btn-secondary" onClick={handleWorkbenchDiscard} disabled={workbenchLoading || workbenchConfirming} style={{ marginLeft: "auto" }}>Discard</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* SCHEMA */}
              {activeSection === "schema" && (
                <div>
                  <div style={S.cardWrap}>
                    <label style={S.lbl}>Project Description</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your project in a sentence..." style={S.ta} rows={3} />
                  </div>
                  <div style={S.cardWrap}>
                    <label style={S.lbl}>Detailed Features</label>
                    <textarea value={features} onChange={e => setFeatures(e.target.value)} placeholder="List tables, columns, and relationships you need..." style={S.ta} rows={4} />
                  </div>

                  {!entities && (
                    <button className="btn-primary" onClick={handleExtract} disabled={loading} style={{ opacity: loading ? 0.6 : 1 }}>
                      {loading ? <><span className="spinner" /> Analyzing...</> : <> Extract Entities</>}
                    </button>
                  )}

                  {entities && (
                    <>
                      <div className="card" style={{ padding: "20px 24px", marginTop: 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e0e0e0" }}>Database Schema</h3>
                          <span style={{ fontSize: 12, color: "#7a7a7a" }}>{entities.tables?.length || 0} tables</span>
                        </div>
                        <TreeView entities={entities} expanded={expandedTables} toggle={toggle} />
                      </div>

                      {selectedProject.status === "finalized" && (
                        <div style={{ marginTop: 16, padding: 16, background: "rgba(34,197,94,0.1)", borderRadius: 10, border: "1px solid rgba(34,197,94,0.35)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <span style={{ color: "#22c55e", fontWeight: 600, flex: 1 }}>Schema finalized</span>
                          <button className="btn-primary" onClick={() => handleDownload("sql")} style={{ fontSize: 13, padding: "8px 16px" }}>Download SQL</button>
                          <button className="btn-purple" onClick={() => handleDownload("json")} style={{ fontSize: 13, padding: "8px 16px" }}>Download JSON</button>
                        </div>
                      )}

                      <div className="card" style={{ padding: 20, marginTop: 16 }}>
                        <label style={S.lbl}>Refine Architecture</label>
                        <textarea value={refineText} onChange={e => setRefineText(e.target.value)} placeholder="e.g., Add a payments table linked to orders..." style={S.ta} rows={3} />
                        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                          <button className="btn-primary" onClick={handleRefine} disabled={loading || !refineText.trim()} style={{ opacity: (!refineText.trim() || loading) ? 0.5 : 1 }}>
                            {loading ? <><span className="spinner" /> Updating...</> : "Update Schema"}
                          </button>
                          <button className="btn-purple" onClick={handleExtract} disabled={loading}>Re-Extract</button>
                          {selectedProject.status !== "finalized"
                            ? <button className="btn-danger" onClick={handleFinalize}>Finalize & Lock</button>
                            : <button className="btn-warning" onClick={handleUnlock}>Unlock Draft</button>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* VALIDATION */}
              {activeSection === "validation" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>Entity Classes & Validation</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>
                      {validationCode
                        ? "Entity classes auto-generated from schema. Add validation rules or edit existing code below."
                        : "Extract a schema first to auto-generate entity classes."}
                    </p>
                  </div>

                  {validationCode && <MultiFileCode title="Project Files" code={validationCode} parseFiles={parseFiles} syntaxLang={syntaxLang} downloadCode={downloadCode} onDeleteFile={handleDeleteFile} onClearAll={handleClearValidation} />}

                  {entities ? (
                    <div className="card" style={{ padding: 20, marginTop: 20 }}>
                      <label style={S.lbl}>Add validation rules or modify code</label>
                      <textarea value={validationRules} onChange={e => setValidationRules(e.target.value)}
                        placeholder="e.g., Add email validation in student.py. Age must be between 5 and 24. Add a phone number format check in parent.py..."
                        style={S.ta} rows={4} />
                      <button className="btn-primary" onClick={handleGenValidation} disabled={validationLoading || !validationRules.trim()}
                        style={{ marginTop: 12, opacity: (validationLoading || !validationRules.trim()) ? 0.5 : 1 }}>
                        {validationLoading ? <><span className="spinner" /> Updating code...</> : "Update Code"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ ...S.warn, marginTop: 16 }}>Go to Database Schema and extract entities first. Entity classes will be auto-generated.</div>
                  )}
                </div>
              )}

              {/* UI SCREENS */}
              {activeSection === "ui" && (
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

                  {/* LEFT: editor */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>
                          {activeScreenId ? screenName || "Untitled Screen" : "New Screen"}
                        </h3>
                        <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>Describe a screen — XML and HTML are generated automatically and saved to this project.</p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 8, padding: "4px 10px" }}>
                          <label style={{ fontSize: 12, color: "#818cf8", fontWeight: 600 }}>Frontend:</label>
                          <select value={frontendLang} onChange={e => handleFrontendLangChange(e.target.value)}
                            style={{ padding: "2px 6px", borderRadius: 4, border: "none", fontSize: 13, background: "transparent", color: "#e0e0e0", fontWeight: 600, cursor: "pointer" }}>
                            {FRONTEND_LANGUAGES.map(l => <option key={l} style={{ background: "#2d2d30" }}>{l}</option>)}
                          </select>
                        </div>
                        <button className="btn-secondary" onClick={handleNewScreen} style={{ fontSize: 12, padding: "5px 12px" }}>+ New Screen</button>
                      </div>
                    </div>

                    {entities ? <SchemaRef tables={entities.tables} /> : <div style={{ ...S.warn, marginBottom: 16 }}>Extract a database schema first for best results.</div>}

                    {/* Editor card */}
                    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                      <div style={{ marginBottom: 10 }}>
                        <label style={S.lbl}>Screen Name</label>
                        <input value={screenName} onChange={e => setScreenName(e.target.value)}
                          placeholder="e.g. Department Master, Employee Form, Order List"
                          style={{ ...S.inp, marginBottom: 0 }} />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={S.lbl}>Screen Description</label>
                        <textarea value={screenDesc} onChange={e => setScreenDesc(e.target.value)}
                          placeholder="Describe what this screen does, what fields it has, what the list/grid should show, and what action buttons are needed."
                          style={S.ta} rows={4} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn-primary" onClick={handleGenerateScreen}
                          disabled={screenXmlLoading || screenHtmlLoading || !screenDesc.trim()}
                          style={{ opacity: (screenXmlLoading || screenHtmlLoading || !screenDesc.trim()) ? 0.5 : 1 }}>
                          {screenXmlLoading ? <><span className="spinner" /> Building XML...</>
                            : screenHtmlLoading ? <><span className="spinner" /> Rendering HTML...</>
                            : activeScreenId ? "Regenerate Screen" : "Generate Screen"}
                        </button>
                        {screenXml && activeScreenId && (
                          <button className="btn-secondary" onClick={handleRegenHtml} disabled={screenHtmlLoading}
                            style={{ fontSize: 12, padding: "6px 14px" }}>
                            {screenHtmlLoading ? <><span className="spinner" /> Regenerating...</> : "Regenerate HTML"}
                          </button>
                        )}
                        {screenXml && activeScreenId && (
                          <button className="btn-purple" onClick={handleGenScreenApi} disabled={screenApiLoading}
                            style={{ fontSize: 12, padding: "6px 14px" }}>
                            {screenApiLoading ? <><span className="spinner" /> Generating...</> : "Generate REST API"}
                          </button>
                        )}
                        {(screenXmlLoading || screenHtmlLoading) && (
                          <span style={{ fontSize: 12, color: "#7a7a7a" }}>
                            {screenXmlLoading ? "Step 1/2: generating XML..." : "Step 2/2: converting to HTML..."}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Output tabs */}
                    {(screenXml || screenHtml || screenApi) && (
                      <div className="card" style={{ overflow: "hidden" }}>
                        <div style={{ display: "flex", borderBottom: "1px solid #333", background: "#1e1e1e" }}>
                          {[
                            { key: "xml", label: "XML Definition", ready: !!screenXml },
                            { key: "html", label: "HTML Preview", ready: !!screenHtml },
                            { key: "api", label: "REST API", ready: !!screenApi },
                          ].map(t => (
                            <button key={t.key} onClick={() => setScreenTab(t.key)} style={{
                              padding: "10px 20px", fontSize: 13, fontWeight: screenTab === t.key ? 600 : 400, cursor: "pointer",
                              border: "none", borderBottom: screenTab === t.key ? "2px solid #6366f1" : "2px solid transparent",
                              background: screenTab === t.key ? "#252526" : "transparent", color: screenTab === t.key ? "#818cf8" : "#8a8a8a",
                            }}>
                              {t.label}{t.ready && <span style={{ color: "#22c55e", marginLeft: 4, fontSize: 10 }}>●</span>}
                            </button>
                          ))}
                        </div>

                        {/* HTML tab */}
                        {screenTab === "html" && (
                          screenHtml ? (
                            <>
                              <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #333", background: "#1e1e1e" }}>
                                <button className="btn-secondary" onClick={() => setShowScreenCode(!showScreenCode)} style={{ fontSize: 12, padding: "6px 14px" }}>
                                  {showScreenCode ? "Show Preview" : "Show Code"}
                                </button>
                                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                  {!showScreenCode && (
                                    <button className="btn-secondary" onClick={() => {
                                      const closeBtn = `<button onclick="window.close()" style="position:fixed;top:14px;left:14px;z-index:99999;background:#1e1e1e;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:6px 14px;font-size:13px;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.4)">&#8592; Close Preview</button>`;
                                      const injected = screenHtml.replace("</body>", closeBtn + "</body>");
                                      const w = window.open("", "_blank");
                                      w.document.write(injected);
                                      w.document.close();
                                    }} style={{ fontSize: 12, padding: "6px 14px" }}>Full Screen</button>
                                  )}
                                  <button className="btn-secondary" onClick={() => downloadCode(screenHtml, `${screenName || "screen"}.html`)}
                                    style={{ fontSize: 12, padding: "6px 14px" }}>Download HTML</button>
                                </div>
                              </div>
                              {showScreenCode
                                ? <SyntaxHighlighter language="html" style={oneDark} customStyle={{ margin: 0, borderRadius: 0, fontSize: 13, lineHeight: 1.6, maxHeight: 600, padding: "16px" }} showLineNumbers wrapLongLines>{screenHtml}</SyntaxHighlighter>
                                : <iframe srcDoc={screenHtml} style={{ width: "100%", minHeight: 600, border: "none" }} title="Preview" sandbox="allow-scripts" />}
                            </>
                          ) : (
                            <div style={{ padding: 40, textAlign: "center", color: "#7a7a7a" }}>
                              {screenXml
                                ? <button className="btn-primary" onClick={handleRegenHtml} disabled={screenHtmlLoading}>{screenHtmlLoading ? <><span className="spinner" /> Generating...</> : "Generate HTML from XML"}</button>
                                : "Describe a screen and click Generate Screen"}
                            </div>
                          )
                        )}

                        {/* XML tab */}
                        {screenTab === "xml" && (
                          screenXml ? (
                            <>
                              <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #333", background: "#1e1e1e" }}>
                                <button className="btn-secondary" onClick={() => downloadCode(screenXml, `${screenName || "screen"}.xml`)} style={{ fontSize: 12, padding: "6px 14px", marginLeft: "auto" }}>Download XML</button>
                              </div>
                              <SyntaxHighlighter language="xml" style={oneDark} customStyle={{ margin: 0, borderRadius: 0, fontSize: 13, lineHeight: 1.6, maxHeight: 500, padding: "16px" }} showLineNumbers wrapLongLines>{screenXml}</SyntaxHighlighter>
                            </>
                          ) : <div style={{ padding: 40, textAlign: "center", color: "#7a7a7a" }}>No XML yet — click Generate Screen.</div>
                        )}

                        {/* API tab */}
                        {screenTab === "api" && (
                          screenApi
                            ? <MultiFileCode title={`API Code (${selectedProject.language} + ${frontendLang})`} code={screenApi} parseFiles={parseFiles} syntaxLang={syntaxLang} downloadCode={downloadCode} />
                            : <div style={{ padding: 40, textAlign: "center", color: "#7a7a7a" }}>
                                {screenXml ? <button className="btn-purple" onClick={handleGenScreenApi} disabled={screenApiLoading}>{screenApiLoading ? <><span className="spinner" /> Generating...</> : `Generate ${selectedProject.language} + ${frontendLang} API`}</button> : "Generate XML first"}
                              </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RIGHT: screen list */}
                  <div style={{ width: 220, flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#5a5a5a", letterSpacing: 0.8, marginBottom: 8, padding: "0 4px" }}>
                      SCREENS ({screens.length})
                    </div>
                    {screens.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#5a5a5a", padding: "12px 8px", fontStyle: "italic" }}>No screens yet.</div>
                    ) : screens.map(s => (
                      <div key={s.id} onClick={() => handleSelectScreen(s)} style={{
                        padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 4, position: "relative",
                        background: activeScreenId === s.id ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                        border: activeScreenId === s.id ? "1px solid rgba(99,102,241,0.4)" : "1px solid #2d2d2d",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: activeScreenId === s.id ? "#818cf8" : "#cfcfcf", paddingRight: 20, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          {s.html && <span style={{ fontSize: 10, color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "1px 5px", borderRadius: 3 }}>HTML</span>}
                          {s.xml && <span style={{ fontSize: 10, color: "#818cf8", background: "rgba(99,102,241,0.1)", padding: "1px 5px", borderRadius: 3 }}>XML</span>}
                          {s.api && <span style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "1px 5px", borderRadius: 3 }}>API</span>}
                          {!s.xml && !s.html && <span style={{ fontSize: 10, color: "#6a6a6a" }}>Draft</span>}
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleDeleteScreen(s.id); }}
                          style={{ position: "absolute", top: 8, right: 8, background: "transparent", border: "none", color: "#5a5a5a", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
                          title="Delete screen">&times;</button>
                      </div>
                    ))}
                  </div>

                </div>
              )}

              {/* ===== ARCHITECT VIEW: DB SCHEMA (ER DIAGRAM) ===== */}
              {activeSection === "arch-db" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>ER Diagram</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>Entity-relationship diagram generated from your database schema.</p>
                  </div>
                  <div className="card" style={{ minHeight: 200 }}>
                    <ERDiagram entities={entities} />
                  </div>
                </div>
              )}

              {/* ===== ARCHITECT VIEW: VALIDATION (placeholder) ===== */}
              {activeSection === "arch-validation" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>Validation Architecture</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>Coming soon.</p>
                  </div>
                  <div className="card" style={{ padding: 60, textAlign: "center", color: "#7a7a7a" }}>
                    Nothing here yet.
                  </div>
                </div>
              )}

              {/* ===== ARCHITECT VIEW: USER INTERFACE (screens list) ===== */}
              {activeSection === "arch-ui" && (
                <div>
                  <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>Screens</h3>
                      <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>{screens.length} screen{screens.length !== 1 ? "s" : ""} in this project.</p>
                    </div>
                    <button className="btn-primary" onClick={() => { handleNewScreen(); setActiveSection("ui"); }} style={{ fontSize: 13 }}>+ New Screen</button>
                  </div>
                  {screens.length === 0 ? (
                    <div className="card" style={{ padding: 60, textAlign: "center", color: "#7a7a7a" }}>
                      No screens yet. Go to <strong style={{ color: "#cfcfcf" }}>User Interface</strong> in Workspace to create one.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {screens.map(s => (
                        <div key={s.id} className="card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "#e0e0e0", marginBottom: 6 }}>{s.name}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: s.xml ? "rgba(99,102,241,0.15)" : "#2a2a2a", color: s.xml ? "#818cf8" : "#5a5a5a", fontWeight: 600 }}>{s.xml ? "XML ✓" : "XML —"}</span>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: s.html ? "rgba(34,197,94,0.12)" : "#2a2a2a", color: s.html ? "#22c55e" : "#5a5a5a", fontWeight: 600 }}>{s.html ? "HTML ✓" : "HTML —"}</span>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: s.api ? "rgba(167,139,250,0.15)" : "#2a2a2a", color: s.api ? "#a78bfa" : "#5a5a5a", fontWeight: 600 }}>{s.api ? "API ✓" : "API —"}</span>
                            </div>
                          </div>
                          <button className="btn-secondary" onClick={() => { handleSelectScreen(s); setActiveSection("ui"); }} style={{ fontSize: 13 }}>Edit</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ===== ARCHITECT VIEW: CONFIGURATION ===== */}
              {activeSection === "arch-config" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>Configuration</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>Set your preferred date format and language.</p>
                  </div>
                  <div className="card" style={{ padding: 28, maxWidth: 420 }}>
                    <div style={{ marginBottom: 18 }}>
                      <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6, fontWeight: 500 }}>Date Format</label>
                      <select value={dateFormat} onChange={e => setDateFormat(e.target.value)}
                        style={{ width: "100%", padding: "9px 12px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 7, color: "#e0e0e0", fontSize: 13, boxSizing: "border-box", cursor: "pointer" }}>
                        {dateFormatOptions.map(f => <option key={f} value={f} style={{ background: "#2d2d30" }}>{f}</option>)}
                      </select>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6, fontWeight: 500 }}>Language</label>
                      <select value={language} onChange={e => setLanguage(e.target.value)}
                        style={{ width: "100%", padding: "9px 12px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 7, color: "#e0e0e0", fontSize: 13, boxSizing: "border-box", cursor: "pointer" }}>
                        {languageOptions.map(l => <option key={l.code} value={l.code} style={{ background: "#2d2d30" }}>{l.label}</option>)}
                      </select>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button className="btn-primary" disabled={configSaving} onClick={handleSaveConfig} style={{ padding: "8px 18px" }}>{configSaving ? "Saving..." : "Save"}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== ASK ABOUT THIS PROJECT ===== */}
              {activeSection === "ask" && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0", margin: "0 0 4px" }}>Ask about this project</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#7a7a7a" }}>Instant answers about your tables, columns, and screens — no AI call needed.</p>
                  </div>

                  <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={askQuestion}
                        onChange={e => setAskQuestion(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAsk(); }}
                        placeholder='e.g. "list all the tables" or "list the screen names"'
                        style={{ flex: 1, padding: "9px 12px", background: "#1e1e1e", border: "1px solid #3c3c3c", borderRadius: 7, color: "#e0e0e0", fontSize: 13, boxSizing: "border-box" }}
                      />
                      <button className="btn-primary" onClick={handleAsk} style={{ padding: "8px 18px" }}>Ask</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {["List all tables", "List the screen names", "List foreign keys", "Which screens are incomplete?"].map(ex => (
                        <button key={ex} onClick={() => { setAskQuestion(ex); }}
                          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 12, background: "#2a2a2a", border: "1px solid #3c3c3c", color: "#9ca3af", cursor: "pointer" }}>
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>

                  {askHistory.length === 0 ? (
                    <div className="card" style={{ padding: 40, textAlign: "center", color: "#7a7a7a", fontSize: 13 }}>
                      Ask a question about this project's tables, columns, or screens.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column-reverse", gap: 10 }}>
                      {askHistory.map((qa, i) => (
                        <div key={i} className="card" style={{ padding: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#818cf8", marginBottom: 6 }}>{qa.question}</div>
                          <div style={{ fontSize: 13, color: "#cfcfcf", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{qa.answer}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Save FAB */}
              <div style={{ position: "fixed", bottom: 24, right: 28, zIndex: 100, display: "flex", alignItems: "center", gap: 10 }}>
                {saveMsg && <div className="toast">{saveMsg}</div>}
                <button className="btn-success" onClick={handleSaveToMongo} style={{ padding: "12px 24px", borderRadius: 10, fontSize: 14, boxShadow: "0 4px 16px rgba(34,197,94,0.3)" }}>
                  Save to Cloud
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#e0e0e0", margin: "0 0 8px" }}>Welcome, {user?.full_name || "there"}</h2>
              <p style={{ color: "#7a7a7a", fontSize: 14, margin: "0 0 28px", maxWidth: 380, lineHeight: 1.6 }}>Design database schemas, generate validation logic, and build user interfaces — all from plain English descriptions.</p>
              <button className="btn-primary" onClick={() => setShowNewModal(true)} style={{ fontSize: 14, padding: "12px 28px" }}>Create New Project</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ActionBadge({ value }) {
  const v = (value || "").toLowerCase();
  const color = v.includes("add") ? "#22c55e" : v.includes("remove") || v.includes("delete") ? "#ef4444"
    : v.includes("modify") || v.includes("change") || v.includes("update") ? "#f59e0b" : "#8a8a8a";
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color, border: `1px solid ${color}66`, background: `${color}1A`, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {value}
    </span>
  );
}

function WorkbenchGrid({ index, title, columns, rows, badgeCol, groupCol, emptyHint }) {
  let groupIndex = 0;
  let prevGroupVal;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "#818cf8", fontFamily: "monospace" }}>{index}</span>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: "#e0e0e0", margin: 0 }}>{title}</h4>
        <span style={{ fontSize: 11, color: "#7a7a7a" }}>{rows.length} {rows.length === 1 ? "item" : "items"}</span>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1e1e1e" }}>
              {columns.map(c => (
                <th key={c.key} style={{ textAlign: "left", padding: "8px 14px", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "#7a7a7a", borderBottom: "1px solid #333" }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ padding: "18px 14px", fontSize: 12.5, color: "#6a6a6a", fontStyle: "italic" }}>{emptyHint}</td></tr>
            ) : rows.map((row, i) => {
              const groupVal = groupCol ? row[groupCol] : null;
              const isNewGroup = !!groupCol && i > 0 && groupVal !== prevGroupVal;
              if (isNewGroup) groupIndex += 1;
              prevGroupVal = groupVal;
              const zebra = groupCol ? groupIndex % 2 === 1 : i % 2 === 1;
              return (
                <tr key={i} style={{
                  borderBottom: i < rows.length - 1 ? "1px solid #2a2a2a" : "none",
                  borderTop: isNewGroup ? "2px solid #45455c" : "none",
                  background: zebra ? "#242428" : "transparent",
                }}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding: "9px 14px", fontSize: 12.5, color: "#cfcfcf", verticalAlign: "top" }}>
                      {c.key === badgeCol ? <ActionBadge value={row[c.key]} /> : row[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionHeader({ text, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px 0 8px" }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#6a6a6a", letterSpacing: 1 }}>{text}</span>
      {count > 0 && <span style={{ fontSize: 10, color: "#7a7a7a", background: "#2a2a2a", padding: "1px 6px", borderRadius: 8 }}>{count}</span>}
    </div>
  );
}

function SideItem({ p, sel, onSel, onDel, tc, sec, setSec, sectionGroups }) {
  return (
    <div>
      <div className="sidebar-item" onClick={() => onSel(p)} style={{ display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: sel ? "rgba(99,102,241,0.15)" : "transparent", border: sel ? "1px solid rgba(99,102,241,0.4)" : "1px solid transparent" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: sel ? 600 : 500, color: sel ? "#818cf8" : "#cfcfcf", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#818cf8", background: "rgba(99,102,241,0.15)", padding: "1px 5px", borderRadius: 3, fontWeight: 500 }}>{p.language || "Python"}</span>
            {tc > 0 && <span style={{ fontSize: 10, color: "#7a7a7a" }}>{tc} tables</span>}
          </div>
        </div>
        <button className="btn-icon delete-btn" onClick={e => onDel(p.id, e)} style={{ width: 24, height: 24, fontSize: 14 }} title="Delete">&times;</button>
      </div>
      {sel && (
        <div style={{ paddingLeft: 12, marginBottom: 4 }}>
          {sectionGroups.map((g, gi) => (
            <div key={g.heading} style={{ marginTop: gi > 0 ? 8 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#5a5a5a", letterSpacing: 0.6, padding: "4px 10px 2px" }}>{g.heading}</div>
              {g.items.map(s => (
                <div key={s.key} className="sub-nav-item" onClick={() => setSec(s.key)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 1, color: sec === s.key ? "#818cf8" : "#8a8a8a", background: sec === s.key ? "rgba(99,102,241,0.15)" : "transparent", fontWeight: sec === s.key ? 600 : 400 }}>
                  {s.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Answers common structural questions about a project locally (no AI call).
// Returns null when the question isn't recognized, so the caller can show a fallback message.
function answerProjectQuestion(question, entities, screens, project) {
  const q = question.toLowerCase().trim();
  const tables = entities?.tables || [];
  screens = screens || [];
  const findTable = () => tables.find(t => q.includes(t.name.toLowerCase()));

  if (/\bscreen/.test(q)) {
    if (/how many|count/.test(q)) return `This project has ${screens.length} screen${screens.length !== 1 ? "s" : ""}.`;
    if (/missing|incomplete|not (generated|done|ready)|pending/.test(q)) {
      const missing = screens.filter(s => !s.xml || !s.html);
      return missing.length === 0
        ? "All screens have XML and HTML generated."
        : `${missing.length} screen${missing.length !== 1 ? "s" : ""} still need${missing.length !== 1 ? "" : "s"} generation: ${missing.map(s => s.name).join(", ")}.`;
    }
    if (/complete|ready|done|finished/.test(q)) {
      const done = screens.filter(s => s.xml && s.html);
      return done.length === 0
        ? "No screens are fully generated yet."
        : `${done.length} screen${done.length !== 1 ? "s" : ""} fully generated: ${done.map(s => s.name).join(", ")}.`;
    }
    if (/\bapi\b/.test(q)) {
      const withApi = screens.filter(s => s.api);
      return withApi.length === 0
        ? "No screens have a REST API generated yet."
        : `${withApi.length} screen${withApi.length !== 1 ? "s" : ""} with a REST API: ${withApi.map(s => s.name).join(", ")}.`;
    }
    return screens.length === 0
      ? "This project has no screens yet."
      : `This project has ${screens.length} screen${screens.length !== 1 ? "s" : ""}: ${screens.map(s => s.name).join(", ")}.`;
  }

  if (/\bcolumn|\bfield/.test(q)) {
    const table = findTable();
    if (table) {
      const cols = (table.columns || []).map(c => c.name).join(", ") || "no columns";
      return `${table.name} has ${table.columns?.length || 0} column${table.columns?.length !== 1 ? "s" : ""}: ${cols}.`;
    }
    if (/how many|count/.test(q)) {
      const total = tables.reduce((sum, t) => sum + (t.columns?.length || 0), 0);
      return `There are ${total} columns across ${tables.length} table${tables.length !== 1 ? "s" : ""}.`;
    }
    return null;
  }

  if (/primary key/.test(q)) {
    const table = findTable();
    if (table) {
      const pk = (table.columns || []).find(c => c.pk);
      return pk ? `The primary key of ${table.name} is "${pk.name}".` : `${table.name} has no primary key defined.`;
    }
    if (tables.length === 0) return "No database schema has been generated for this project yet.";
    const pks = tables.map(t => `${t.name}.${(t.columns || []).find(c => c.pk)?.name || "?"}`);
    return `Primary keys: ${pks.join(", ")}.`;
  }

  if (/foreign key|relationship/.test(q)) {
    const fks = [];
    for (const t of tables) {
      for (const c of (t.columns || [])) {
        if (c.fk) fks.push(`${t.name}.${c.name} → ${c.fk}`);
      }
    }
    return fks.length === 0 ? "No foreign key relationships are defined yet." : `Foreign key relationships: ${fks.join("; ")}.`;
  }

  const existsMatch = q.match(/(?:is there|does).*table (?:called |named )?["']?(\w+)["']?|table (\w+) exist/);
  if (existsMatch) {
    const name = (existsMatch[1] || existsMatch[2] || "").toLowerCase();
    const found = tables.find(t => t.name.toLowerCase() === name);
    return found ? `Yes, "${found.name}" exists with ${found.columns?.length || 0} columns.` : `No table named "${name}" was found.`;
  }

  if (/\btable/.test(q)) {
    if (/how many|count/.test(q)) return `This project has ${tables.length} table${tables.length !== 1 ? "s" : ""}.`;
    return tables.length === 0
      ? "No database schema has been generated for this project yet."
      : `This project has ${tables.length} table${tables.length !== 1 ? "s" : ""}: ${tables.map(t => t.name).join(", ")}.`;
  }

  if (/language/.test(q)) return `Backend language: ${project?.language || "Python"}. Frontend framework: ${project?.frontend_language || "React"}.`;
  if (/status/.test(q)) return `This project's status is "${project?.status || "draft"}".`;

  return null;
}

function entitiesToMermaid(entities) {
  if (!entities?.tables?.length) return "";
  const lines = ["erDiagram"];
  for (const table of entities.tables) {
    lines.push(`  ${table.name} {`);
    for (const col of (table.columns || [])) {
      const type = (col.type || "string").replace(/\s+/g, "_");
      const name = col.name;
      const tags = [col.pk ? "PK" : null, col.fk ? "FK" : null].filter(Boolean).join(",");
      lines.push(`    ${type} ${name}${tags ? ` "${tags}"` : ""}`);
    }
    lines.push("  }");
  }
  const seen = new Set();
  for (const table of entities.tables) {
    for (const col of (table.columns || [])) {
      if (col.fk) {
        const refTable = col.fk.split(".")[0];
        const key = `${refTable}||--o{${table.name}`;
        if (!seen.has(key) && refTable !== table.name) {
          seen.add(key);
          lines.push(`  ${refTable} ||--o{ ${table.name} : " "`);
        }
      }
    }
  }
  return lines.join("\n");
}

function ERDiagram({ entities }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);

  const mermaidDef = useMemo(() => entitiesToMermaid(entities), [entities]);

  useEffect(() => {
    if (!mermaidDef) { setSvg(""); return; }
    let cancelled = false;
    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        er: { diagramPadding: 40, layoutDirection: "TB", minEntityWidth: 140, minEntityHeight: 80, entityPadding: 18, useMaxWidth: true },
      });
      const id = `er-${Date.now()}`;
      mermaid.render(id, mermaidDef).then(({ svg: rendered }) => {
        if (!cancelled) { setSvg(rendered); setError(null); }
      }).catch((e) => {
        if (!cancelled) setError(e.message);
      });
    });
    return () => { cancelled = true; };
  }, [mermaidDef]);

  if (!mermaidDef) {
    return <div style={{ padding: 60, textAlign: "center", color: "#7a7a7a" }}>No schema extracted yet. Go to <strong>Database Schema</strong> in Workspace to extract entities.</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: "#f87171", fontSize: 13 }}>Diagram error: {error}</div>;
  }
  if (!svg) {
    return <div style={{ padding: 60, textAlign: "center", color: "#7a7a7a" }}>Rendering diagram…</div>;
  }

  return (
    <div ref={containerRef} style={{ padding: 24, overflow: "auto", background: "#13111c", borderRadius: 8, minHeight: 300 }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

function SchemaRef({ tables }) {
  return (
    <div style={{ marginBottom: 16, background: "#1e1e1e", borderRadius: 10, border: "1px solid #333", overflow: "hidden" }}>
      <div style={{ padding: "6px 14px", background: "#252526", fontSize: 11, fontWeight: 600, color: "#8a8a8a", letterSpacing: 0.5 }}>SCHEMA ENTITIES</div>
      <div style={{ padding: "8px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        {tables.map(t => (
          <div key={t.name} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", minWidth: 90 }}>{t.name}</span>
            <span style={{ fontSize: 11, color: "#7a7a7a" }}>{t.columns.map(c => c.name).join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeView({ entities, expanded, toggle }) {
  return (
    <div style={{ paddingLeft: 4 }}>
      <div className="tree-node" onClick={() => toggle("__root__")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: 10, color: "#7a7a7a", width: 14 }}>{expanded["__root__"] === false ? "▶" : "▼"}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#7a7a7a" stroke="none"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#cfcfcf" }}>Tables</span>
      </div>
      {expanded["__root__"] !== false && entities.tables?.map(t => (
        <div key={t.name} style={{ paddingLeft: 24 }}>
          <div style={{ borderLeft: "2px solid #333", paddingLeft: 12, marginLeft: 6 }}>
            <div className="tree-node" onClick={() => toggle(t.name)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", cursor: "pointer" }}>
              <span style={{ fontSize: 10, color: "#7a7a7a", width: 14 }}>{expanded[t.name] ? "▼" : "▶"}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Table: {t.name}</span>
            </div>
          </div>
          {expanded[t.name] && t.columns?.map(c => (
            <div key={c.name} style={{ paddingLeft: 48 }}>
              <div style={{ borderLeft: "2px solid #333", paddingLeft: 12, marginLeft: 6 }}>
                <div className="tree-node" onClick={() => toggle(`${t.name}.${c.name}`)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 4px", cursor: "pointer" }}>
                  <span style={{ fontSize: 10, color: "#7a7a7a", width: 14 }}>{expanded[`${t.name}.${c.name}`] ? "▼" : "▶"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Col: {c.name}</span>
                </div>
              </div>
              {expanded[`${t.name}.${c.name}`] && (
                <div style={{ paddingLeft: 72 }}>
                  {[
                    `Type: ${c.type}`,
                    ...(c.pk ? ["Primary Key", "Auto Increment"] : []),
                    ...(c.fk ? [`Foreign Key (ref ${c.fk})`, "Required"] : []),
                  ].map((prop, i) => (
                    <div key={i} style={{ borderLeft: "2px solid #333", paddingLeft: 12, marginLeft: 6, padding: "2px 0 2px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "#5a5a5a" }}>{"☰"}</span>
                      <span style={{ fontSize: 12, color: "#8a8a8a" }}>{prop}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const MultiFileCode = memo(function MultiFileCode({ title, code, parseFiles, syntaxLang, downloadCode, onDeleteFile, onClearAll }) {
  const [activeTab, setActiveTab] = useState(0);
  const files = parseFiles(code);
  const safeTab = Math.min(activeTab, files.length - 1);

  return (
    <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #333" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#cfcfcf" }}>{title} ({files.length} files)</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={() => downloadCode(code, "code.zip")} style={{ fontSize: 12, padding: "5px 12px" }}>Download All</button>
          {onClearAll && <button className="btn-danger" onClick={onClearAll} style={{ fontSize: 12, padding: "5px 12px" }}>Clear All</button>}
        </div>
      </div>
      {files.length > 1 && (
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #333", background: "#1e1e1e", overflowX: "auto" }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", borderBottom: (safeTab === i) ? "2px solid #6366f1" : "2px solid transparent", background: (safeTab === i) ? "#252526" : "transparent" }}>
              <button onClick={() => setActiveTab(i)} style={{
                padding: "8px 12px", fontSize: 12, fontWeight: (safeTab === i) ? 600 : 400, cursor: "pointer", border: "none",
                background: "transparent", color: (safeTab === i) ? "#818cf8" : "#8a8a8a", whiteSpace: "nowrap",
              }}>{f.name}</button>
              {onDeleteFile && (
                <button className="delete-btn" onClick={() => { onDeleteFile(f.name); if (safeTab >= files.length - 1) setActiveTab(Math.max(0, safeTab - 1)); }}
                  style={{ border: "none", background: "transparent", color: "#5a5a5a", cursor: "pointer", fontSize: 14, padding: "0 6px 0 0", lineHeight: 1 }}
                  title={`Delete ${f.name}`}>&times;</button>
              )}
            </div>
          ))}
        </div>
      )}
      {files[safeTab] && (
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", top: 8, right: 12, display: "flex", gap: 6, zIndex: 2 }}>
            <button className="btn-secondary" onClick={() => downloadCode(files[safeTab].code, files[safeTab].name)}
              style={{ fontSize: 11, padding: "3px 10px", opacity: 0.8 }}>Download</button>
            {onDeleteFile && <button className="btn-danger" onClick={() => { onDeleteFile(files[safeTab].name); setActiveTab(Math.max(0, safeTab - 1)); }}
              style={{ fontSize: 11, padding: "3px 10px", opacity: 0.8 }}>Delete</button>}
          </div>
          <SyntaxHighlighter language={syntaxLang(files[activeTab].name)} style={oneDark}
            customStyle={{ margin: 0, borderRadius: 0, fontSize: 13, lineHeight: 1.6, maxHeight: 500, padding: "16px 16px 16px 12px" }}
            showLineNumbers wrapLongLines>
            {files[activeTab].code}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
});

const S = {
  wrap: { display: "flex", minHeight: "100vh", background: "#1e1e1e", color: "#e0e0e0", fontFamily: "'Inter', -apple-system, system-ui, sans-serif" },
  side: { background: "#181818", borderRight: "1px solid #2d2d2d", display: "flex", flexDirection: "column", transition: "width 0.2s ease, padding 0.2s ease", flexShrink: 0 },
  logo: { fontSize: 16, fontWeight: 700, margin: 0, color: "#e0e0e0", letterSpacing: 0.2 },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#1e1e1e" },
  topbar: { display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderBottom: "1px solid #2d2d2d", background: "#1e1e1e" },
  badge: { fontSize: 11, color: "#818cf8", background: "rgba(99,102,241,0.15)", padding: "3px 10px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  content: { flex: 1, padding: "28px 36px", overflowY: "auto", background: "#1e1e1e" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { padding: 32, width: 440, maxWidth: "90vw" },
  modalH: { fontSize: 20, fontWeight: 700, margin: "0 0 4px", color: "#e0e0e0" },
  modalSub: { fontSize: 13, color: "#7a7a7a", margin: "0 0 20px" },
  lbl: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#b4b4b4" },
  inp: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #3c3c3c", background: "#2d2d30", color: "#e0e0e0", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 14 },
  sel: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #3c3c3c", background: "#2d2d30", color: "#e0e0e0", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 14 },
  ta: { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid #3c3c3c", background: "#2d2d30", color: "#e0e0e0", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  cardWrap: { marginBottom: 16 },
  error: { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  warn: { padding: 12, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 10, color: "#fbbf24", fontSize: 13 },
  muted: { color: "#7a7a7a", fontSize: 12, margin: "0 0 8px", paddingLeft: 4 },
  code: { background: "#1e1e1e", margin: 0, padding: 16, fontFamily: "'Consolas', 'Fira Code', monospace", fontSize: 13, color: "#e6edf3", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 500, overflowY: "auto" },
};
