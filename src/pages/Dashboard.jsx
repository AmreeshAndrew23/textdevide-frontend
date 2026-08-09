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
  // Drives the "Connected to DB" / "Sample data" badge next to the UI Preview tab — set from
  // the TDIDE_READY/TDIDE_INIT_DATA handshake below, keyed by the previewing screen's own
  // (primary) entity so it doesn't get confused by a lookup entity's data.
  const [dbPreviewStatus, setDbPreviewStatus] = useState(null);
  // Bridges the Studio's UI Preview iframes to real rows in the project's own Postgres
  // schema (proj_<id>, auto-created/kept in sync server-side) — so Add/Edit/Delete in one
  // screen's preview persists for real and shows up in another screen's preview too, instead
  // of fake sampleData or a browser-only mock. Protocol: TDIDE_READY / TDIDE_INIT_DATA /
  // TDIDE_DATA_CHANGE (see XML_TO_HTML_PROMPT's "CROSS-SCREEN DATA SYNC" section).
  useEffect(() => {
    const projectId = selectedProject?.id;
    if (!projectId) return;
    const handler = async (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "TDIDE_READY") {
        const wanted = msg.entities || [];
        const source = event.source;
        if (!wanted.length || !source) return;
        const data = {};
        await Promise.all(wanted.map(async (name) => {
          try {
            const res = await api.get(`/projects/${projectId}/preview-db/${encodeURIComponent(name)}`);
            // Always include the real answer, even an empty array — a screen's hardcoded fake
            // sample rows must get explicitly cleared on a genuinely-empty table, otherwise the
            // AI's placeholder data (e.g. "Computer Science", "Mathematics"...) silently rides
            // along and gets persisted the first time the user saves something real, since it
            // was never told the truth about there being nothing there yet.
            data[name] = res.data?.rows || [];
          } catch { /* table may not exist yet (no sync-schema run) — leave this entity untouched */ }
        }));
        source.postMessage({ type: "TDIDE_INIT_DATA", data }, "*");
        // wanted[0] is always the screen's own entity (lookups follow) — see TDIDE_LOOKUPS
        // in _inject_cross_screen_sync's injected script.
        setDbPreviewStatus({ entity: wanted[0], connected: Boolean(data[wanted[0]]?.length) });
      } else if (msg.type === "TDIDE_DATA_CHANGE" && msg.entity) {
        try {
          await api.put(`/projects/${projectId}/preview-db/${encodeURIComponent(msg.entity)}`, { rows: msg.rows || [] });
          setDbPreviewStatus(s => (s && s.entity === msg.entity ? { ...s, connected: true } : s));
        } catch { /* best-effort preview sync — don't block the UI on failure */ }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [selectedProject?.id]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("workbench");

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLanguage, setNewLanguage] = useState("Python");
  const [newFrontendLang, setNewFrontendLang] = useState("React");

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

  // Schema->Screen Studio (structured screen definition + tabbed workspace)
  const [studioTab, setStudioTab] = useState("preview"); // preview | frontend | backend | endpoints | entities | data | validations
  const [studioDataEntity, setStudioDataEntity] = useState(null);
  const [studioDataRows, setStudioDataRows] = useState(null);
  const [studioDataLoading, setStudioDataLoading] = useState(false);
  const [studioDataError, setStudioDataError] = useState("");
  useEffect(() => {
    setStudioDataEntity(null);
    setStudioDataRows(null);
    setStudioDataError("");
  }, [selectedProject?.id]);
  const [studioPrimaryEntities, setStudioPrimaryEntities] = useState([]);
  const [studioJoinedEntities, setStudioJoinedEntities] = useState([]);
  const [studioGenerating, setStudioGenerating] = useState(false);
  const [studioStep, setStudioStep] = useState("");
  const [studioError, setStudioError] = useState("");
  const [studioEndpoints, setStudioEndpoints] = useState(null);
  const [studioEndpointsLoading, setStudioEndpointsLoading] = useState(false);
  const [showNewEntityModal, setShowNewEntityModal] = useState(false);
  const [newEntityPrompt, setNewEntityPrompt] = useState("");
  const [newEntityGenerating, setNewEntityGenerating] = useState(false);
  const [newEntityError, setNewEntityError] = useState("");
  const [schemaUnresolved, setSchemaUnresolved] = useState([]);
  const [schemaAssistantTable, setSchemaAssistantTable] = useState(null);
  const [schemaAssistantTab, setSchemaAssistantTab] = useState("schema");
  const [schemaAssistantChat, setSchemaAssistantChat] = useState([]);
  const [schemaAssistantInput, setSchemaAssistantInput] = useState("");
  const [schemaAssistantSending, setSchemaAssistantSending] = useState(false);
  const [schemaAssistantSuggestions, setSchemaAssistantSuggestions] = useState([]);
  const schemaAssistantInputRef = useRef(null);
  useEffect(() => {
    const el = schemaAssistantInputRef.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [schemaAssistantInput]);

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
  const [studioShowMiddle, setStudioShowMiddle] = useState(true);
  const [studioShowPreview, setStudioShowPreview] = useState(true);
  const [screenChat, setScreenChat] = useState([]);
  const [screenChatInput, setScreenChatInput] = useState("");
  const screenChatInputRef = useRef(null);
  useEffect(() => {
    const el = screenChatInputRef.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [screenChatInput]);
  const [screenChatSending, setScreenChatSending] = useState(false);

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
    setStudioTab("preview"); setStudioPrimaryEntities([]); setStudioJoinedEntities([]); setStudioError(""); setStudioEndpoints(null);
    setShowNewEntityModal(false); setNewEntityPrompt(""); setNewEntityError("");
    setError(""); setSaveMsg("");
  };

  const handleCreateProject = async () => {
    if (!newName.trim()) return;
    try {
      const res = await api.post("/projects", { name: newName, language: newLanguage, frontend_language: newFrontendLang });
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

  const handleExtract = async () => {
    if (!description.trim() || !features.trim()) { setError("Please fill in both fields"); return; }
    setLoading(true); setError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/extract`, { description, features });
      setSelectedProject(res.data);
      setSchemaUnresolved(res.data.unresolved || []);
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
      setSchemaUnresolved(res.data.unresolved || []);
    } catch (err) { setError(err.response?.data?.detail || "Refinement failed"); }
    finally { setLoading(false); }
  };

  // "+ New entity from prompt" — extends the schema via the existing refine/extract endpoints.
  const handleGenerateNewEntity = async () => {
    if (!newEntityPrompt.trim()) return;
    setNewEntityGenerating(true); setNewEntityError("");
    try {
      const res = selectedProject.entities
        ? await api.post(`/projects/${selectedProject.id}/refine`, { entities: selectedProject.entities, instruction: `Add a new entity: ${newEntityPrompt}` })
        : await api.post(`/projects/${selectedProject.id}/extract`, { description: newEntityPrompt, features: newEntityPrompt });
      setSelectedProject(res.data);
      fetchProjects();
      setShowNewEntityModal(false);
      setNewEntityPrompt("");
    } catch (err) {
      setNewEntityError(err.response?.data?.detail || "Failed to generate schema");
    } finally {
      setNewEntityGenerating(false);
    }
  };

  // Client-side mirror of the backend's _schema_suggestions heuristic, used only for the
  // very first chip render when the assistant opens (before any chat round trip has happened).
  const computeSchemaSuggestions = (table, otherTables) => {
    const cols = table?.columns || [];
    const suggestions = [];
    const codeCol = cols.find(c => (c.name?.includes("code") || c.name?.endsWith("_no") || c.name?.endsWith("_number")) && !c.unique);
    if (codeCol) suggestions.push(`Make ${codeCol.name} unique`);
    const boolCol = cols.find(c => (c.type || "").toUpperCase().startsWith("BOOL") && !c.default);
    if (boolCol) suggestions.push(`Add a default for ${boolCol.name}`);
    if (!table?.audit_enabled) suggestions.push("Turn on auditing");
    else if (!table?.history_enabled) suggestions.push("Keep a full change history");
    if (otherTables?.length && !cols.some(c => c.fk)) suggestions.push(`Add a foreign key to ${otherTables[0].name}`);
    if (!suggestions.length) suggestions.push("Add a new column", "Add a validation rule", "Rename a column");
    return suggestions.slice(0, 3);
  };

  const openSchemaAssistant = (tableName) => {
    const table = (entities?.tables || []).find(t => t.name === tableName);
    const otherTables = (entities?.tables || []).filter(t => t.name !== tableName);
    setSchemaAssistantTable(tableName);
    setSchemaAssistantTab("schema");
    setSchemaAssistantChat([{
      role: "assistant",
      text: `You're editing the ${tableName} table. Ask me to add columns, define foreign keys, set validations, or configure the auto-number.`,
    }]);
    setSchemaAssistantInput("");
    setSchemaAssistantSuggestions(computeSchemaSuggestions(table, otherTables));
  };

  const closeSchemaAssistant = () => {
    setSchemaAssistantTable(null);
    setSchemaAssistantChat([]);
    setSchemaAssistantInput("");
    setSchemaAssistantSuggestions([]);
  };

  const handleSchemaAssistantSend = async (instructionOverride) => {
    const instruction = (instructionOverride ?? schemaAssistantInput).trim();
    if (!instruction || !schemaAssistantTable || schemaAssistantSending) return;
    setSchemaAssistantSending(true);
    setSchemaAssistantChat(c => [...c, { role: "user", text: instruction }]);
    setSchemaAssistantInput("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/schema-assistant/${encodeURIComponent(schemaAssistantTable)}`, { instruction });
      setSelectedProject(p => ({ ...p, entities: res.data.entities }));
      const newMessages = [{ role: "assistant", text: res.data.summary }];
      for (const u of res.data.unresolved || []) {
        newMessages.push({ role: "note", blocking: u.blocking, text: (u.blocking ? "⚠ " : "ℹ ") + u.question });
      }
      setSchemaAssistantChat(c => [...c, ...newMessages]);
      setSchemaAssistantSuggestions(res.data.suggestions || []);
    } catch (err) {
      setSchemaAssistantChat(c => [...c, { role: "assistant", text: err.response?.data?.detail || "Something went wrong applying that change." }]);
    } finally {
      setSchemaAssistantSending(false);
    }
  };

  // Renaming an already-generated screen shouldn't force a full regenerate (XML/HTML/API
  // are all keyed by screen id, not name) — this is a lightweight PUT of just the name,
  // fired on blur so typing doesn't spam requests mid-edit.
  const handleRenameScreen = async (newName) => {
    const trimmed = newName.trim();
    if (!activeScreenId || !trimmed) return;
    const current = screens.find(s => s.id === activeScreenId);
    if (current && current.name === trimmed) return;
    try {
      _syncScreens((await api.put(`/projects/${selectedProject.id}/screens/${activeScreenId}`, { name: trimmed })).data);
    } catch (err) {
      setStudioError(err.response?.data?.detail || "Rename failed");
    }
  };

  // Studio's "Generate Screen": save the structured definition (name + primary/joined
  // entities + freeform description) then run the existing XML -> HTML generation chain.
  // Finalizing a screen means the complete pipeline runs: XML (structure) -> HTML (live
  // preview) -> backend code (routes + models, in the project's language) and frontend
  // code (page component + API service, in the project's chosen frontend language). XML
  // and HTML are saved for the preview, but the "deliverable" code shown to the user is
  // the frontend + backend source, not the XML/HTML themselves.
  const handleStudioGenerate = async () => {
    if (!screenName.trim()) { setStudioError("Enter a screen name first"); return; }
    setStudioGenerating(true); setStudioError(""); setStudioStep("Saving screen definition...");
    let screenId = activeScreenId;
    const payload = { name: screenName.trim(), description: screenDesc, primary_entities: studioPrimaryEntities, joined_entities: studioJoinedEntities };
    try {
      if (!screenId) {
        const res = await api.post(`/projects/${selectedProject.id}/screens`, payload);
        const parsed = _syncScreens(res.data);
        screenId = parsed[parsed.length - 1].id;
        setActiveScreenId(screenId);
      } else {
        _syncScreens((await api.put(`/projects/${selectedProject.id}/screens/${screenId}`, payload)).data);
      }

      // Selecting more than one primary entity signals "this is a navigation/landing screen",
      // not a single-entity CRUD screen — the backend also detects this from the saved screen
      // and injects the list of already-built screens so navigation targets are real, not made up.
      const isHubScreen = studioPrimaryEntities.length > 1;
      const contextLine = studioPrimaryEntities.length
        ? isHubScreen
          ? `This is a navigation/landing screen that routes to the other screens covering these entities: ${studioPrimaryEntities.join(", ")}. `
          : `Primary entity: ${studioPrimaryEntities[0]}.${studioJoinedEntities.length ? ` Joined entities: ${studioJoinedEntities.join(", ")}.` : ""} `
        : "";
      setStudioStep("Generating screen structure (XML)...");
      const xmlRes = await api.post(`/projects/${selectedProject.id}/screens/${screenId}/generate-xml`, { description: contextLine + screenDesc });
      let parsed = _syncScreens(xmlRes.data);
      const xml = parsed.find(s => s.id === screenId)?.xml || "";
      setScreenXml(xml);
      setScreenChat([]); setScreenChatInput("");  // fresh base generation invalidates prior chat
      if (!xml) throw new Error("XML generation returned nothing");

      setStudioStep("Generating live preview (HTML)...");
      const htmlRes = await api.post(`/projects/${selectedProject.id}/screens/${screenId}/generate-html`, { xml, frontend_lang: frontendLang });
      parsed = _syncScreens(htmlRes.data);
      setScreenHtml(parsed.find(s => s.id === screenId)?.html || "");

      setStudioStep(`Generating backend (${selectedProject.language}) + frontend (${frontendLang}) code...`);
      const apiRes = await api.post(`/projects/${selectedProject.id}/screens/${screenId}/generate-api`, { xml });
      parsed = _syncScreens(apiRes.data);
      const apiCode = parsed.find(s => s.id === screenId)?.api || "";
      setScreenApi(apiCode);
      const contractsFile = parseFiles(apiCode).find(f => f.name.toLowerCase().includes("contract"));
      try { setStudioEndpoints(contractsFile ? normalizeEndpoints(JSON.parse(contractsFile.code)) : null); }
      catch { setStudioEndpoints(null); }

      setStudioTab("preview");
    } catch (err) {
      setStudioError(err.response?.data?.detail || "Screen generation failed");
    } finally {
      setStudioGenerating(false); setStudioStep("");
    }
  };

  // Iterative refinement chat, scoped to the currently selected screen. Runs once the
  // basic version exists (screenXml is set). Only updates XML/HTML on each message —
  // fast, cheap turnaround — rather than re-running the full backend+frontend code
  // generation on every small tweak. The Backend/Frontend Code tabs clear themselves
  // (screenApi resets server-side) so they never show code that's out of sync with the
  // latest UI; regenerate them explicitly once you're done iterating.
  const handleSendUiChat = async () => {
    const instruction = screenChatInput.trim();
    if (!instruction || !activeScreenId || screenChatSending) return;
    setScreenChatSending(true); setStudioError("");
    setScreenChat(c => [...c, { role: "user", text: instruction }]);
    setScreenChatInput("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/screens/${activeScreenId}/refine-ui`, { instruction });
      const parsed = _syncScreens(res.data);
      const screen = parsed.find(s => s.id === activeScreenId);
      setScreenXml(screen?.xml || "");
      setScreenHtml(screen?.html || "");
      setScreenApi(""); setStudioEndpoints(null);
      setScreenChat(screen?.ui_chat || []);
    } catch (err) {
      setStudioError(err.response?.data?.detail || "Couldn't apply that change");
      setScreenChat(c => c.slice(0, -1));  // roll back the optimistic user message on failure
      setScreenChatInput(instruction);
    } finally {
      setScreenChatSending(false);
    }
  };

  // REST Endpoints tab: reuses the existing per-screen API generation, then pulls the
  // api_contracts.json file out of the === FILENAME: === bundle for a structured view.
  // Tolerates whatever reasonable JSON shape the AI actually returns for api_contracts.json:
  // {endpoints:[...]}, a bare array, or an OpenAPI-style object keyed by path -> method.
  const normalizeEndpoints = (data) => {
    if (!data) return null;
    if (Array.isArray(data)) return data.length ? data : null;
    if (Array.isArray(data.endpoints)) return data.endpoints.length ? data.endpoints : null;
    const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
    const looksLikePathMap = Object.keys(data).every(k => k.startsWith("/"));
    if (looksLikePathMap) {
      const rows = [];
      for (const [path, methods] of Object.entries(data)) {
        if (!methods || typeof methods !== "object") continue;
        for (const [method, info] of Object.entries(methods)) {
          if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
          rows.push({ method: method.toUpperCase(), path, description: info?.description || info?.summary || "", trigger: info?.trigger || "" });
        }
      }
      return rows.length ? rows : null;
    }
    return null;
  };

  const handleLoadEndpoints = async () => {
    if (!screenXml || !activeScreenId) return;
    setStudioEndpointsLoading(true); setStudioError("");
    try {
      const res = await api.post(`/projects/${selectedProject.id}/screens/${activeScreenId}/generate-api`, { xml: screenXml });
      const parsed = _syncScreens(res.data);
      const apiCode = parsed.find(s => s.id === activeScreenId)?.api || "";
      setScreenApi(apiCode);
      const contractsFile = parseFiles(apiCode).find(f => f.name.toLowerCase().includes("contract"));
      let normalized = null;
      if (contractsFile) {
        try { normalized = normalizeEndpoints(JSON.parse(contractsFile.code)); }
        catch { normalized = null; }
      }
      setStudioEndpoints(normalized);
      if (!normalized) setStudioError("Generated an API, but couldn't find a readable endpoint list in the response — check the raw code in the Validations/User Interface tab.");
    } catch (err) {
      setStudioError(err.response?.data?.detail || "API generation failed");
    } finally {
      setStudioEndpointsLoading(false);
    }
  };

  const loadStudioData = async (entityName) => {
    if (!entityName || !selectedProject) return;
    setStudioDataEntity(entityName);
    setStudioDataLoading(true); setStudioDataError(""); setStudioDataRows(null);
    try {
      const res = await api.get(`/projects/${selectedProject.id}/preview-db/${encodeURIComponent(entityName)}`);
      setStudioDataRows(res.data?.rows || []);
    } catch (err) {
      setStudioDataError(err.response?.data?.detail || "Couldn't load data for this entity");
      setStudioDataRows([]);
    } finally {
      setStudioDataLoading(false);
    }
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
    setDbPreviewStatus(null);
    setActiveScreenId(screen.id);
    setScreenName(screen.name);
    setScreenDesc(screen.description || "");
    setScreenXml(screen.xml || "");
    setScreenHtml(screen.html || "");
    setScreenApi(screen.api || "");
    setScreenTab(screen.html ? "html" : screen.xml ? "xml" : "html");
    setShowScreenCode(false);
    setStudioPrimaryEntities(screen.primary_entities || (screen.primary_entity ? [screen.primary_entity] : []));
    setStudioJoinedEntities(screen.joined_entities || []);
    setScreenChat(screen.ui_chat || []);
    setScreenChatInput("");
    const contractsFile = parseFiles(screen.api || "").find(f => f.name.toLowerCase().includes("contract"));
    let normalized = null;
    if (contractsFile) {
      try { normalized = normalizeEndpoints(JSON.parse(contractsFile.code)); } catch { normalized = null; }
    }
    setStudioEndpoints(normalized);
    setStudioError("");
    setError("");
  };

  const handleNewScreen = () => {
    setDbPreviewStatus(null);
    setActiveScreenId(null);
    setScreenName(""); setScreenDesc(""); setScreenXml(""); setScreenHtml(""); setScreenApi("");
    setScreenTab("html"); setShowScreenCode(false);
    setStudioPrimaryEntities([]); setStudioJoinedEntities([]); setStudioEndpoints(null); setStudioError("");
    setScreenChat([]); setScreenChatInput("");
    setError("");
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

  // Field mapping only makes sense for a single-entity CRUD screen. Selecting more than one
  // primary entity means this is a navigation/landing screen instead — no single row of data
  // to map fields to, so there's nothing meaningful to show here.
  const studioMappingRows = useMemo(() => {
    if (!entities?.tables?.length || studioPrimaryEntities.length !== 1) return [];
    const rows = [];
    for (const tableName of [studioPrimaryEntities[0], ...studioJoinedEntities]) {
      const table = entities.tables.find(t => t.name === tableName);
      if (!table) continue;
      for (const col of table.columns || []) {
        const field = col.name.split("_").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
        rows.push({ field, path: `${tableName}.${col.name}` });
      }
    }
    return rows;
  }, [entities, studioPrimaryEntities, studioJoinedEntities]);
  const drafts = useMemo(() => projects.filter(p => p.status === "draft"), [projects]);
  const finalized = useMemo(() => projects.filter(p => p.status === "finalized"), [projects]);
  const tblCount = (p) => { try { return JSON.parse(p.entities)?.tables?.length || 0; } catch { return 0; } };
  const lang = selectedProject?.language || "Python";
  const fileExt = lang === "Python" ? "py" : lang === "Java" ? "java" : lang === "TypeScript" ? "ts" : "js";

  // Defensive net: strip a leading/trailing markdown code fence if the model added one
  // despite being told not to (e.g. ```json ... ``` or ```python ... ```).
  const stripMdFence = (text) => {
    const trimmed = text.trim();
    const m = trimmed.match(/^```[a-zA-Z0-9]*\n?([\s\S]*?)\n?```$/);
    return m ? m[1].trim() : trimmed;
  };

  const parseFiles = (code) => {
    if (!code) return [];
    const parts = code.split(/^=== FILENAME:\s*(.+?)\s*===$/m);
    if (parts.length <= 1) return [{ name: `code.${fileExt}`, code: stripMdFence(code) }];
    const files = [];
    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] && parts[i + 1]?.trim()) files.push({ name: parts[i].trim(), code: stripMdFence(parts[i + 1]) });
    }
    return files.length > 0 ? files : [{ name: `code.${fileExt}`, code: stripMdFence(code) }];
  };

  // Splits the generate-api bundle (routes/models/contracts/api_service/page_component)
  // into a backend-only bundle and a frontend-only bundle for separate display —
  // api_contracts.json is excluded here since the REST Endpoints tab handles that.
  const splitApiBundle = (code) => {
    if (!code) return { backend: "", frontend: "" };
    const files = parseFiles(code);
    const rebuild = (list) => list.map(f => `=== FILENAME: ${f.name} ===\n${f.code}`).join("\n\n");
    const backend = rebuild(files.filter(f => /^(routes|models)\b/i.test(f.name)));
    const frontend = rebuild(files.filter(f => /^(api_service|page_component)\b/i.test(f.name)));
    return { backend, frontend };
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
        { key: "workbench", label: "Schema→Screen Studio" },
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
            <p style={S.modalSub}>Give your project a name and choose a backend and frontend language</p>
            <label style={S.lbl}>Project Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My awesome project" style={S.inp} autoFocus />
            <label style={S.lbl}>Backend Language</label>
            <select value={newLanguage} onChange={e => setNewLanguage(e.target.value)} style={S.sel}>
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
            <label style={S.lbl}>Frontend Framework</label>
            <select value={newFrontendLang} onChange={e => setNewFrontendLang(e.target.value)} style={S.sel}>
              {FRONTEND_LANGUAGES.map(l => <option key={l}>{l}</option>)}
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
            <a href={selectedProject.github_repo_url} target="_blank" rel="noreferrer" title={selectedProject.github_repo}
              style={{ fontSize: 12, color: "#818cf8", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px solid #3c3c3c", borderRadius: 6, background: "#1e1e1e" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              Backend
            </a>
          )}
          {selectedProject?.github_frontend_repo_url && (
            <a href={selectedProject.github_frontend_repo_url} target="_blank" rel="noreferrer" title={selectedProject.github_frontend_repo}
              style={{ fontSize: 12, color: "#818cf8", textDecoration: "none", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", border: "1px solid #3c3c3c", borderRadius: 6, background: "#1e1e1e" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              Frontend
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

        <div style={activeSection === "workbench" ? { ...S.content, background: "var(--st-bg)", display: "flex", flexDirection: "column" } : S.content}>
          {selectedProject ? (
            <div className="fade-in" style={activeSection === "workbench"
              ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
              : { maxWidth: 820, paddingBottom: 80 }}>
              {error && <div style={S.error}>{error}</div>}

              {/* SCHEMA -> SCREEN STUDIO */}
              {activeSection === "workbench" && (
                <div className="studio-root" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--st-bg)", margin: "-28px -36px", overflow: "hidden" }}>
                  {/* TOP BAR */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 24px", background: "var(--st-surface)", borderBottom: "1px solid var(--st-border)", flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--st-accent)", flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 15 }}>Schema→Screen Studio</span>
                    <span style={{ color: "#d8d4e6" }}>|</span>
                    <span style={{ fontSize: 13, color: "var(--st-muted)" }}>{selectedProject.name}</span>
                    <span style={{ fontSize: 13, color: "var(--st-muted)" }}>/</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{screenName || "New Screen"}</span>
                    <div style={{ flex: 1 }} />
                    {studioGenerating && studioStep && (
                      <span style={{ fontSize: 12, color: "var(--st-muted)" }}>{studioStep}</span>
                    )}
                    <span className="studio-pill studio-pill-success">
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--st-success)", display: "inline-block" }} />
                      {selectedProject.language} · {selectedProject.status}
                    </span>
                    <button className="studio-btn-secondary" disabled={studioShowMiddle && !studioShowPreview}
                      onClick={() => setStudioShowMiddle(s => !s)}
                      title={studioShowMiddle ? "Hide the definition panel to see the preview full-screen" : "Show the definition panel"}>
                      {studioShowMiddle ? "Hide panel »" : "« Show panel"}
                    </button>
                    <button className="studio-btn-secondary" disabled={studioShowPreview && !studioShowMiddle}
                      onClick={() => setStudioShowPreview(s => !s)}
                      title={studioShowPreview ? "Hide the live preview" : "Show the live preview"}>
                      {studioShowPreview ? "Hide preview" : "Show preview"}
                    </button>
                    <button className="studio-btn-primary" onClick={handleStudioGenerate} disabled={studioGenerating}>
                      {studioGenerating ? <><span className="spinner" /> Generating...</> : "Generate Screen"}
                    </button>
                  </div>

                  <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                    {/* LEFT SIDEBAR */}
                    <div style={{ width: 210, flexShrink: 0, background: "var(--st-surface)", borderRight: "1px solid var(--st-border)", padding: "16px 10px", overflowY: "auto" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", marginBottom: 6 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--st-muted)", letterSpacing: 0.6 }}>IMPORTED SCHEMA</span>
                        <button onClick={() => setShowNewEntityModal(true)} title="New entity from prompt" style={{ background: "none", border: "none", color: "var(--st-accent)", cursor: "pointer", fontSize: 16, fontWeight: 700, lineHeight: 1 }}>+</button>
                      </div>
                      {(entities?.tables || []).map(t => (
                        <div key={t.name} onClick={() => openSchemaAssistant(t.name)} title="Open Schema Assistant"
                          className="studio-sidebar-item" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>• {t.name}</span>
                          <span style={{ fontSize: 11, color: "var(--st-muted)" }}>{t.columns?.length || 0}</span>
                        </div>
                      ))}
                      {!entities?.tables?.length && <div style={{ fontSize: 12, color: "var(--st-muted)", padding: "4px 8px" }}>No entities yet</div>}
                      <div onClick={() => setShowNewEntityModal(true)} className="studio-sidebar-item" style={{ color: "var(--st-accent)", fontWeight: 600 }}>+ New entity from prompt</div>

                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--st-muted)", letterSpacing: 0.6, margin: "18px 0 6px", padding: "0 8px" }}>SCREENS</div>
                      {screens.map(s => (
                        <div key={s.id} className={"studio-sidebar-item" + (activeScreenId === s.id ? " active" : "")} onClick={() => handleSelectScreen(s)}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▪ {s.name}</span>
                          <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete screen "${s.name}"? This can't be undone.`)) handleDeleteScreen(s.id); }}
                            title="Delete screen"
                            style={{ flexShrink: 0, background: "transparent", border: "none", color: "var(--st-muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}>
                            &times;
                          </button>
                        </div>
                      ))}
                      <div onClick={handleNewScreen} className="studio-sidebar-item" style={{ color: "var(--st-muted)" }}>+ New Screen</div>
                    </div>

                    {/* MIDDLE PANEL */}
                    {studioShowMiddle && (
                    <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--st-border)", padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
                      <div className="studio-card" style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Screen Definition</div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--st-muted)", display: "block", marginBottom: 4 }}>Screen name</label>
                        <input className="studio-input" value={screenName} onChange={e => setScreenName(e.target.value)}
                          onBlur={e => handleRenameScreen(e.target.value)}
                          placeholder="Employee Directory" style={{ marginBottom: 12 }} />

                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                          <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--st-muted)" }}>Primary entities</label>
                          {(entities?.tables?.length || 0) > 1 && (
                            <span onClick={() => setStudioPrimaryEntities((entities?.tables || []).map(t => t.name))}
                              style={{ fontSize: 11, color: "var(--st-accent)", cursor: "pointer", fontWeight: 600 }}>
                              Select all (landing page)
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: "var(--st-muted)", margin: "0 0 8px" }}>
                          Pick one for a normal data screen. Pick several — or "Select all" — to make this a
                          navigation/landing page that routes to the screens covering those entities.
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                          {(entities?.tables || []).map(t => {
                            const active = studioPrimaryEntities.includes(t.name);
                            return (
                              <span key={t.name}
                                onClick={() => setStudioPrimaryEntities(p => active ? p.filter(x => x !== t.name) : [...p, t.name])}
                                className={"studio-pill" + (active ? " studio-pill-soft" : "")}
                                style={{ cursor: "pointer", border: active ? "none" : "1px solid var(--st-border)", color: active ? undefined : "var(--st-muted)" }}>
                                {t.name}
                              </span>
                            );
                          })}
                          {!entities?.tables?.length && <span style={{ fontSize: 12, color: "var(--st-muted)" }}>No entities yet</span>}
                        </div>
                        {studioPrimaryEntities.length > 1 && (
                          <div className="studio-pill studio-pill-soft" style={{ marginBottom: 12, display: "inline-flex" }}>
                            Navigation hub — routes to {studioPrimaryEntities.length} screens
                          </div>
                        )}

                        <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--st-muted)", display: "block", marginBottom: 6 }}>Joined entities</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {(entities?.tables || []).filter(t => !studioPrimaryEntities.includes(t.name)).map(t => {
                            const active = studioJoinedEntities.includes(t.name);
                            return (
                              <span key={t.name} onClick={() => setStudioJoinedEntities(j => active ? j.filter(x => x !== t.name) : [...j, t.name])}
                                className={"studio-pill" + (active ? " studio-pill-soft" : "")}
                                style={{ cursor: "pointer", border: active ? "none" : "1px solid var(--st-border)", color: active ? undefined : "var(--st-muted)" }}>
                                {t.name}
                              </span>
                            );
                          })}
                          {(entities?.tables || []).length <= 1 && <span style={{ fontSize: 12, color: "var(--st-muted)" }}>No other entities to join</span>}
                        </div>
                      </div>

                      <div className="studio-card" style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Describe the UI</div>
                        <textarea className="studio-textarea" rows={5} value={screenDesc} onChange={e => setScreenDesc(e.target.value)}
                          placeholder="A searchable, filterable directory. Show name, email, department... Include filters and an 'Add' action." />

                        {screenXml && (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--st-border)" }}>
                            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Refine with chat</div>
                            {screenChat.length > 0 && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
                                {screenChat.map((m, i) => (
                                  <div key={i} style={{
                                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                                    background: m.role === "user" ? "var(--st-accent-soft)" : "var(--st-bg)",
                                    border: "1px solid var(--st-border)", borderRadius: 10, padding: "6px 10px",
                                    fontSize: 12.5, maxWidth: "90%",
                                  }}>
                                    {m.text}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                              <textarea ref={screenChatInputRef} className="studio-input studio-input-autosize" value={screenChatInput}
                                rows={1}
                                onChange={e => setScreenChatInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !screenChatSending) { e.preventDefault(); handleSendUiChat(); } }}
                                placeholder="e.g. add a status filter, make the save button blue... (Shift+Enter for a new line)"
                                disabled={screenChatSending} style={{ flex: 1, resize: "none", overflow: "hidden", lineHeight: 1.4 }} />
                              <button className="studio-btn-secondary" onClick={handleSendUiChat}
                                disabled={screenChatSending || !screenChatInput.trim()}>
                                {screenChatSending ? <span className="spinner" /> : "Send"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="studio-card" style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Field → Column Mapping</div>
                        {studioPrimaryEntities.length > 1 ? (
                          <div style={{ fontSize: 12.5, color: "var(--st-muted)" }}>This is a navigation screen, not a data screen — no fields to map.</div>
                        ) : studioMappingRows.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: "var(--st-muted)" }}>Pick a primary entity to see the field mapping.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", maxHeight: 260, overflowY: "auto" }}>
                            {studioMappingRows.map((r, i) => (
                              <div key={i} style={{ padding: "7px 0", borderBottom: i < studioMappingRows.length - 1 ? "1px solid var(--st-border)" : "none" }}>
                                <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.field}</div>
                                <div style={{ color: "var(--st-accent)", fontFamily: "ui-monospace, monospace", fontSize: 11.5, marginTop: 2, wordBreak: "break-all" }}>→ {r.path}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {studioError && <div style={{ fontSize: 12.5, color: "var(--st-danger)" }}>{studioError}</div>}
                    </div>
                    )}

                    {/* RIGHT WORKSPACE */}
                    {studioShowPreview && (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--st-surface)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, rowGap: 4, padding: "8px 20px 0", borderBottom: "1px solid var(--st-border)", flexShrink: 0 }}>
                        {[
                          { key: "preview", label: "UI Preview" },
                          { key: "frontend", label: "Frontend Code" },
                          { key: "backend", label: "Backend Code" },
                          { key: "endpoints", label: "REST Endpoints" },
                          { key: "entities", label: "Database Entities" },
                          { key: "data", label: "Data" },
                          { key: "validations", label: "Validations" },
                        ].map(t => (
                          <button key={t.key} className={"studio-tab" + (studioTab === t.key ? " active" : "")}
                            style={{ flexShrink: 0 }}
                            onClick={() => {
                              setStudioTab(t.key);
                              if (t.key === "endpoints" && !screenApi && screenXml) handleLoadEndpoints();
                              if (t.key === "data" && !studioDataLoading) {
                                const preferred = studioDataEntity || studioPrimaryEntities[0] || entities?.tables?.[0]?.name;
                                if (preferred) loadStudioData(preferred);
                              }
                            }}>
                            {t.label}
                          </button>
                        ))}
                        {dbPreviewStatus && (
                          <span className="studio-pill studio-pill-soft" style={{ marginLeft: "auto", alignSelf: "center", flexShrink: 0,
                              color: dbPreviewStatus.connected ? "var(--st-success, #16a34a)" : "var(--st-muted)" }}
                            title={dbPreviewStatus.connected
                              ? `Reading/writing real rows in this project's Postgres schema (${dbPreviewStatus.entity})`
                              : `No rows yet in the real DB for ${dbPreviewStatus.entity} — showing the screen's sample data`}>
                            {dbPreviewStatus.connected ? "● Connected to DB" : "○ Sample data"}
                          </span>
                        )}
                      </div>

                      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
                        {studioTab === "preview" && (
                          screenHtml ? (
                            <iframe key={`${activeScreenId}-${screenHtml.length}`} srcDoc={screenHtml}
                              style={{ width: "100%", height: "100%", minHeight: 480, border: "1px solid var(--st-border)", borderRadius: 8 }}
                              title="UI Preview" sandbox="allow-scripts allow-forms" />
                          ) : (
                            <div style={{ textAlign: "center", color: "var(--st-muted)", fontSize: 13, padding: 60 }}>
                              {studioGenerating ? "Generating..." : 'Define a screen on the left and click "Generate Screen" to see a live preview here.'}
                            </div>
                          )
                        )}

                        {studioTab === "frontend" && (
                          splitApiBundle(screenApi).frontend ? (
                            <MultiFileCode title={`Frontend Code (${frontendLang})`} code={splitApiBundle(screenApi).frontend} parseFiles={parseFiles} syntaxLang={syntaxLang} downloadCode={downloadCode} />
                          ) : (
                            <div style={{ color: "var(--st-muted)", fontSize: 13 }}>
                              {studioGenerating ? (studioStep || "Generating...") : screenXml ? 'Frontend code isn\'t generated yet — click "Generate Screen" to build it.' : "Generate a screen first."}
                            </div>
                          )
                        )}

                        {studioTab === "backend" && (
                          splitApiBundle(screenApi).backend ? (
                            <MultiFileCode title={`Backend Code (${selectedProject.language})`} code={splitApiBundle(screenApi).backend} parseFiles={parseFiles} syntaxLang={syntaxLang} downloadCode={downloadCode} />
                          ) : (
                            <div style={{ color: "var(--st-muted)", fontSize: 13 }}>
                              {studioGenerating ? (studioStep || "Generating...") : screenXml ? 'Backend code isn\'t generated yet — click "Generate Screen" to build it.' : "Generate a screen first."}
                            </div>
                          )
                        )}

                        {studioTab === "endpoints" && (
                          studioEndpointsLoading ? <div style={{ color: "var(--st-muted)", fontSize: 13 }}>Generating endpoints...</div> :
                          !screenXml ? <div style={{ color: "var(--st-muted)", fontSize: 13 }}>Generate a screen first.</div> :
                          !studioEndpoints ? (
                            <button className="studio-btn-secondary" onClick={handleLoadEndpoints}>Generate REST API</button>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <div style={{ fontSize: 12, color: "var(--st-muted)", marginBottom: 4 }}>{studioEndpoints.length} endpoint{studioEndpoints.length !== 1 ? "s" : ""}</div>
                              {studioEndpoints.map((ep, i) => (
                                <div key={i} className="studio-card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                                  <span className="studio-pill studio-pill-soft" style={{ fontFamily: "ui-monospace, monospace" }}>{ep.method}</span>
                                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}>{ep.path}</span>
                                  <span style={{ fontSize: 12.5, color: "var(--st-muted)" }}>{ep.description}</span>
                                  {ep.trigger && <span style={{ fontSize: 11, color: "var(--st-muted)", marginLeft: "auto" }}>via {ep.trigger}</span>}
                                </div>
                              ))}
                            </div>
                          )
                        )}

                        {studioTab === "entities" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {(entities?.tables || []).map(t => (
                              <div key={t.name} className="studio-card" style={{ overflow: "hidden" }}>
                                <div style={{ padding: "10px 14px", fontWeight: 700, fontSize: 13.5, borderBottom: "1px solid var(--st-border)", background: "#faf9fc" }}>{t.name}</div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                  <thead><tr style={{ color: "var(--st-muted)" }}>
                                    <th style={{ textAlign: "left", padding: "6px 14px" }}>Column</th>
                                    <th style={{ textAlign: "left", padding: "6px 14px" }}>Type</th>
                                    <th style={{ textAlign: "left", padding: "6px 14px" }}>Key</th>
                                  </tr></thead>
                                  <tbody>
                                    {(t.columns || []).map(c => (
                                      <tr key={c.name} style={{ borderTop: "1px solid var(--st-border)" }}>
                                        <td style={{ padding: "6px 14px" }}>{c.name}</td>
                                        <td style={{ padding: "6px 14px", color: "var(--st-muted)" }}>{c.type}</td>
                                        <td style={{ padding: "6px 14px" }}>
                                          {c.pk ? <span className="studio-pill studio-pill-soft">PK</span> : c.fk ? <span className="studio-pill" style={{ background: "#fef3c7", color: "#92400e" }}>FK</span> : ""}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                            {!entities?.tables?.length && <div style={{ color: "var(--st-muted)", fontSize: 13 }}>No entities yet — add one from the sidebar.</div>}
                          </div>
                        )}

                        {studioTab === "data" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              {(entities?.tables || []).map(t => (
                                <button key={t.name}
                                  className={"studio-pill" + (studioDataEntity === t.name ? "" : " studio-pill-soft")}
                                  style={studioDataEntity === t.name
                                    ? { background: "var(--st-accent)", color: "#fff", border: "none", cursor: "pointer" }
                                    : { cursor: "pointer", border: "1px solid var(--st-border)", background: "none" }}
                                  onClick={() => loadStudioData(t.name)}>
                                  {t.name}
                                </button>
                              ))}
                              <button className="studio-btn-secondary" style={{ marginLeft: "auto" }}
                                disabled={!studioDataEntity || studioDataLoading}
                                onClick={() => loadStudioData(studioDataEntity)}>
                                {studioDataLoading ? "Loading..." : "Refresh"}
                              </button>
                            </div>

                            {!entities?.tables?.length ? (
                              <div style={{ color: "var(--st-muted)", fontSize: 13 }}>No entities yet — add one from the sidebar.</div>
                            ) : !studioDataEntity ? (
                              <div style={{ color: "var(--st-muted)", fontSize: 13 }}>Pick an entity above to see its real rows.</div>
                            ) : studioDataLoading ? (
                              <div style={{ color: "var(--st-muted)", fontSize: 13 }}>Loading...</div>
                            ) : studioDataError ? (
                              <div style={{ fontSize: 12.5, color: "var(--st-danger)" }}>{studioDataError}</div>
                            ) : !studioDataRows?.length ? (
                              <div style={{ color: "var(--st-muted)", fontSize: 13 }}>
                                No rows in {studioDataEntity} yet — add one through a screen's UI Preview and it'll show up here.
                              </div>
                            ) : (
                              <div className="studio-card" style={{ overflow: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                  <thead><tr style={{ color: "var(--st-muted)" }}>
                                    {Object.keys(studioDataRows[0]).map(col => (
                                      <th key={col} style={{ textAlign: "left", padding: "6px 14px", whiteSpace: "nowrap" }}>{col}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {studioDataRows.map((row, i) => (
                                      <tr key={i} style={{ borderTop: "1px solid var(--st-border)" }}>
                                        {Object.keys(studioDataRows[0]).map(col => (
                                          <td key={col} style={{ padding: "6px 14px", whiteSpace: "nowrap" }}>
                                            {row[col] === null || row[col] === undefined ? <span style={{ color: "var(--st-muted)" }}>—</span> : String(row[col])}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                <div style={{ padding: "8px 14px", fontSize: 11.5, color: "var(--st-muted)", borderTop: "1px solid var(--st-border)" }}>
                                  {studioDataRows.length} row{studioDataRows.length !== 1 ? "s" : ""}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {studioTab === "validations" && (
                          <div>
                            {validationRules ? (
                              <div className="studio-card" style={{ padding: 16, marginBottom: 16, whiteSpace: "pre-wrap", fontSize: 13 }}>{validationRules}</div>
                            ) : (
                              <div style={{ color: "var(--st-muted)", fontSize: 13, marginBottom: 16 }}>No validation rules yet.</div>
                            )}
                            {validationCode && (
                              <SyntaxHighlighter language={syntaxLang(parseFiles(validationCode)[0]?.name || "")} style={oneDark} customStyle={{ borderRadius: 8, fontSize: 12.5 }}>
                                {validationCode}
                              </SyntaxHighlighter>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </div>

                  {/* New entity from prompt modal */}
                  {showNewEntityModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(31,27,46,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
                      onClick={() => setShowNewEntityModal(false)}>
                      <div className="studio-card" onClick={e => e.stopPropagation()} style={{ padding: 24, width: 460 }}>
                        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>New entity from prompt</div>
                        <p style={{ fontSize: 12.5, color: "var(--st-muted)", margin: "0 0 14px" }}>Describe the entity in plain language.</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                          {["Time-off requests", "Performance reviews"].map(chip => (
                            <span key={chip} onClick={() => setNewEntityPrompt(chip)} className="studio-pill" style={{ cursor: "pointer", border: "1px solid var(--st-border)", color: "var(--st-muted)" }}>{chip}</span>
                          ))}
                        </div>
                        <textarea className="studio-textarea" rows={4} value={newEntityPrompt} onChange={e => setNewEntityPrompt(e.target.value)}
                          placeholder="e.g. Track employee time-off requests with start date, end date, type, and approval status." style={{ marginBottom: 12 }} />
                        {newEntityError && <div style={{ fontSize: 12.5, color: "var(--st-danger)", marginBottom: 10 }}>{newEntityError}</div>}
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button className="studio-btn-secondary" onClick={() => setShowNewEntityModal(false)}>Cancel</button>
                          <button className="studio-btn-primary" onClick={handleGenerateNewEntity} disabled={newEntityGenerating || !newEntityPrompt.trim()}>
                            {newEntityGenerating ? <><span className="spinner" /> Generating...</> : "Generate schema"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Schema Assistant — per-table chat + tabbed detail editor */}
                  {schemaAssistantTable && (() => {
                    const table = (entities?.tables || []).find(t => t.name === schemaAssistantTable) || { name: schemaAssistantTable, columns: [] };
                    const cols = table.columns || [];
                    const fkCols = cols.filter(c => c.fk);
                    const validations = table.validations || [];
                    const autoCols = cols.filter(c => c.autonumber);
                    const defaultCols = cols.filter(c => c.default !== null && c.default !== undefined && c.default !== "");
                    const formatAutonumber = (a) => {
                      if (!a) return "";
                      const width = a.leading_zeroes || 4;
                      const sample = String(a.start_number ?? 1).padStart(width, "0");
                      const resetLabel = { never: "never resets", on_stop: `cycles at ${a.stop_number}`, yearly: "resets yearly", monthly: "resets monthly", daily: "resets daily", field_based: `resets per ${a.reset?.field || "field"}` }[a.reset?.type] || "never resets";
                      return `${a.prefix || ""}${sample}${a.suffix || ""} · ${resetLabel}`;
                    };
                    const columnIcon = (c) => {
                      if (c.pk) return "🔑";
                      if (c.fk) return "→";
                      if (c.autonumber) return "#";
                      const t = (c.type || "").toUpperCase();
                      if (t.includes("BOOL")) return "⊙";
                      if (t.includes("NUMERIC") || t.includes("DECIMAL") || t.includes("MONEY")) return "$";
                      if (t.includes("TIMESTAMP") || t.includes("DATE")) return "⏱";
                      return "T";
                    };
                    const tabs = [
                      { key: "schema", label: "Schema", count: cols.length },
                      { key: "fk", label: "Foreign Keys", count: fkCols.length },
                      { key: "validations", label: "Validations", count: validations.length },
                      { key: "autonumber", label: "Auto-number", count: autoCols.length },
                      { key: "defaults", label: "Defaults", count: defaultCols.length },
                    ];
                    return (
                      <div style={{ position: "fixed", inset: 0, background: "rgba(31,27,46,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={closeSchemaAssistant}>
                        <div onClick={e => e.stopPropagation()} style={{ width: "90vw", maxWidth: 1300, height: "85vh", background: "var(--st-bg)", borderRadius: 14, overflow: "hidden", display: "flex", boxShadow: "0 24px 70px rgba(0,0,0,0.35)" }}>
                          {/* LEFT: chat */}
                          <div style={{ width: 340, flexShrink: 0, background: "var(--st-surface)", borderRight: "1px solid var(--st-border)", display: "flex", flexDirection: "column" }}>
                            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--st-border)", display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--st-accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>◆</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Schema Assistant</div>
                                <div style={{ fontSize: 11.5, color: "var(--st-muted)" }}>Editing · {table.name}</div>
                              </div>
                              <span style={{ fontSize: 11, color: "var(--st-success)", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--st-success)", display: "inline-block" }} /> online
                              </span>
                              <button onClick={closeSchemaAssistant} title="Close" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--st-muted)", padding: 0, marginLeft: 4 }}>✕</button>
                            </div>

                            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                              {schemaAssistantChat.map((m, i) => (
                                <div key={i} style={{
                                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                                  background: m.role === "user" ? "var(--st-accent)" : m.role === "note" ? (m.blocking ? "#fef2f2" : "#fffbeb") : "var(--st-bg)",
                                  color: m.role === "user" ? "white" : m.role === "note" ? (m.blocking ? "#991b1b" : "#92400e") : "var(--st-text)",
                                  border: m.role === "user" ? "none" : m.role === "note" ? `1px solid ${m.blocking ? "#fecaca" : "#fde68a"}` : "1px solid var(--st-border)",
                                  borderRadius: 12, padding: "9px 13px", fontSize: m.role === "note" ? 12 : 13, lineHeight: 1.5, maxWidth: "88%",
                                }}>
                                  {m.text}
                                </div>
                              ))}
                              {schemaAssistantSending && (
                                <div style={{ alignSelf: "flex-start", color: "var(--st-muted)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                                  <span className="spinner" /> thinking...
                                </div>
                              )}
                            </div>

                            {schemaAssistantSuggestions.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 16px 12px" }}>
                                {schemaAssistantSuggestions.map(s => (
                                  <span key={s} onClick={() => handleSchemaAssistantSend(s)}
                                    className="studio-pill" style={{ cursor: "pointer", border: "1px solid var(--st-border)", color: "var(--st-muted)", fontSize: 11.5 }}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div style={{ padding: 14, borderTop: "1px solid var(--st-border)", display: "flex", gap: 8, alignItems: "flex-end" }}>
                              <textarea ref={schemaAssistantInputRef} className="studio-input" rows={1} value={schemaAssistantInput}
                                onChange={e => setSchemaAssistantInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !schemaAssistantSending) { e.preventDefault(); handleSchemaAssistantSend(); } }}
                                placeholder="e.g. add a manager_id foreign key and turn on auditing... (Shift+Enter for a new line)"
                                disabled={schemaAssistantSending}
                                style={{ flex: 1, resize: "none", overflow: "hidden", lineHeight: 1.4 }} />
                              <button className="studio-btn-secondary" onClick={() => handleSchemaAssistantSend()} disabled={schemaAssistantSending || !schemaAssistantInput.trim()}>
                                {schemaAssistantSending ? <span className="spinner" /> : "Send"}
                              </button>
                            </div>
                          </div>

                          {/* RIGHT: table detail */}
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--st-surface)" }}>
                            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--st-border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 20, fontWeight: 700 }}>{table.name}</span>
                                  <span className="studio-pill studio-pill-soft" style={{ fontSize: 10.5, fontWeight: 700 }}>TABLE</span>
                                </div>
                                <div style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 3 }}>
                                  {table.description || "No description yet"} · {cols.length} columns · public schema
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button className="studio-btn-secondary" style={{ fontSize: 12 }} onClick={() => handleDownload("sql")} title="Download the whole project's schema as SQL">Download SQL</button>
                                <button className="studio-btn-secondary" style={{ fontSize: 12 }} onClick={() => handleDownload("json")} title="Download the whole project's schema as JSON">Download JSON</button>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 22, padding: "0 24px", borderBottom: "1px solid var(--st-border)", flexShrink: 0 }}>
                              {tabs.map(t => (
                                <button key={t.key} className={"studio-tab" + (schemaAssistantTab === t.key ? " active" : "")} onClick={() => setSchemaAssistantTab(t.key)}>
                                  {t.label} {t.count > 0 && <span style={{ opacity: 0.6 }}>{t.count}</span>}
                                </button>
                              ))}
                            </div>

                            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
                              {schemaAssistantTab === "schema" && (
                                <>
                                  <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                                    <div onClick={() => handleSchemaAssistantSend(table.audit_enabled ? "Turn off auditing" : "Turn on auditing (track created_by / modified_by and timestamps)")}
                                      className="studio-card" style={{ flex: 1, padding: 14, display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
                                      <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--st-border)", background: table.audit_enabled ? "var(--st-accent)" : "transparent", color: "white", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, marginTop: 1 }}>
                                        {table.audit_enabled ? "✓" : ""}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>Auditing</div>
                                        <div style={{ fontSize: 11.5, color: "var(--st-muted)" }}>Track created_by / modified_by + timestamps</div>
                                      </div>
                                    </div>
                                    <div onClick={() => handleSchemaAssistantSend(table.history_enabled ? "Turn off history tracking" : "Keep a full row-version change history")}
                                      className="studio-card" style={{ flex: 1, padding: 14, display: "flex", gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
                                      <div style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid var(--st-border)", background: table.history_enabled ? "var(--st-accent)" : "transparent", color: "white", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, marginTop: 1 }}>
                                        {table.history_enabled ? "✓" : ""}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 700, fontSize: 13 }}>History</div>
                                        <div style={{ fontSize: 11.5, color: "var(--st-muted)" }}>Keep full row-version change log</div>
                                      </div>
                                    </div>
                                  </div>

                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                                    <thead><tr style={{ color: "var(--st-muted)" }}>
                                      <th style={{ textAlign: "left", padding: "6px 10px" }}>Column</th>
                                      <th style={{ textAlign: "left", padding: "6px 10px" }}>Type</th>
                                      <th style={{ textAlign: "left", padding: "6px 10px" }}>Null</th>
                                      <th style={{ textAlign: "left", padding: "6px 10px" }}>Key</th>
                                      <th style={{ textAlign: "left", padding: "6px 10px" }}>Default</th>
                                    </tr></thead>
                                    <tbody>
                                      {cols.map(c => (
                                        <tr key={c.name} style={{ borderTop: "1px solid var(--st-border)" }}>
                                          <td style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ opacity: 0.7, width: 14, display: "inline-block", textAlign: "center" }}>{columnIcon(c)}</span>{c.name}
                                          </td>
                                          <td style={{ padding: "8px 10px", color: "var(--st-muted)", fontFamily: "ui-monospace, monospace" }}>{c.type}</td>
                                          <td style={{ padding: "8px 10px", color: "var(--st-muted)" }}>{c.pk ? "NO" : c.nullable === false ? "NO" : "YES"}</td>
                                          <td style={{ padding: "8px 10px" }}>
                                            {c.pk ? <span className="studio-pill studio-pill-soft" style={{ fontSize: 10.5 }}>PK</span>
                                              : c.fk ? <span className="studio-pill" style={{ fontSize: 10.5, background: "#dbeafe", color: "#1d4ed8" }}>FK</span> : ""}
                                          </td>
                                          <td style={{ padding: "8px 10px", color: "var(--st-muted)", fontFamily: "ui-monospace, monospace" }}>{c.default ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  <button className="studio-btn-secondary" style={{ marginTop: 16 }}
                                    onClick={() => { setSchemaAssistantInput("Add a column named "); schemaAssistantInputRef.current?.focus(); }}>
                                    + Add column
                                  </button>
                                </>
                              )}

                              {schemaAssistantTab === "fk" && (
                                fkCols.length === 0 ? <div style={{ fontSize: 13, color: "var(--st-muted)" }}>No foreign keys yet — ask the assistant to add one.</div> : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {fkCols.map(c => (
                                      <div key={c.name} className="studio-card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                                        <span style={{ color: "var(--st-muted)" }}>→</span>
                                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "var(--st-accent)" }}>{c.fk}</span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}

                              {schemaAssistantTab === "validations" && (
                                validations.length === 0 ? <div style={{ fontSize: 13, color: "var(--st-muted)" }}>No validation rules yet — ask the assistant to add one.</div> : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {validations.map((v, i) => (
                                      <div key={i} className="studio-card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{v.column}</span>
                                        <span className="studio-pill studio-pill-soft" style={{ fontSize: 10.5 }}>{v.type}</span>
                                        {v.detail && <span style={{ fontSize: 12, color: "var(--st-muted)" }}>{v.detail}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}

                              {schemaAssistantTab === "autonumber" && (
                                autoCols.length === 0 ? <div style={{ fontSize: 13, color: "var(--st-muted)" }}>No auto-numbered columns — ask the assistant to configure one, e.g. "auto-number the {table.name.toLowerCase()}_code".</div> : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {autoCols.map(c => (
                                      <div key={c.name} className="studio-card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "var(--st-muted)" }}>{formatAutonumber(c.autonumber)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}

                              {schemaAssistantTab === "defaults" && (
                                defaultCols.length === 0 ? <div style={{ fontSize: 13, color: "var(--st-muted)" }}>No default values set yet.</div> : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {defaultCols.map(c => (
                                      <div key={c.name} className="studio-card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "var(--st-accent)" }}>{c.default}</span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
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

                      {schemaUnresolved.length > 0 && (
                        <div className="card" style={{ padding: 16, marginTop: 16, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "#d97706" }}>Worth a look</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {schemaUnresolved.map((u, i) => (
                              <div key={i} style={{ fontSize: 12.5, color: "#b4b4b4", display: "flex", gap: 6 }}>
                                <span>{u.blocking ? "⚠" : "ℹ"}</span>
                                <span>{u.entity ? `[${u.entity}${u.column ? "." + u.column : ""}] ` : ""}{u.question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{
                        marginTop: 16, padding: 16, borderRadius: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                        background: selectedProject.status === "finalized" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.03)",
                        border: selectedProject.status === "finalized" ? "1px solid rgba(34,197,94,0.35)" : "1px solid #3c3c3c",
                      }}>
                        <span style={{ color: selectedProject.status === "finalized" ? "#22c55e" : "#7a7a7a", fontWeight: 600, flex: 1 }}>
                          {selectedProject.status === "finalized" ? "Schema finalized" : "Draft — download anytime to check the schema before finalizing"}
                        </span>
                        <button className="btn-primary" onClick={() => handleDownload("sql")} style={{ fontSize: 13, padding: "8px 16px" }}>Download SQL</button>
                        <button className="btn-purple" onClick={() => handleDownload("json")} style={{ fontSize: 13, padding: "8px 16px" }}>Download JSON</button>
                      </div>

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
                          onBlur={e => handleRenameScreen(e.target.value)}
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
                                : <iframe srcDoc={screenHtml} style={{ width: "100%", minHeight: 600, border: "none" }} title="Preview" sandbox="allow-scripts allow-forms" />}
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

              {/* Toast for save/push/generation status messages */}
              {saveMsg && (
                <div style={{ position: "fixed", bottom: 24, right: 28, zIndex: 100 }}>
                  <div className="toast">{saveMsg}</div>
                </div>
              )}
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
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#1e1e1e", minHeight: 0 },
  topbar: { display: "flex", alignItems: "center", gap: 12, padding: "10px 24px", borderBottom: "1px solid #2d2d2d", background: "#1e1e1e" },
  badge: { fontSize: 11, color: "#818cf8", background: "rgba(99,102,241,0.15)", padding: "3px 10px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  content: { flex: 1, padding: "28px 36px", overflowY: "auto", background: "#1e1e1e", minHeight: 0 },
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
