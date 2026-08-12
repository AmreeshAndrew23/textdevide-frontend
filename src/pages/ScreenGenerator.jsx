import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";

const CONTROL_TYPES = [
  "Text Input", "Dropdown", "Checkbox", "Date Picker", "Time Picker",
  "Text Area", "Number Input", "Email Input", "Phone Input",
  "Password Input", "URL Input", "File Upload", "Lookup",
];
const SCREEN_TYPES = ["Form", "Dashboard", "Grid", "Form with Grid", "Wizard", "Modal", "Other"];
const TABS = ["Screen Info", "Controls", "Grid", "Database", "Rules & Formulas", "Buttons"];

const uid = () => Math.random().toString(36).slice(2, 8);

const blankControl = () => ({
  id: uid(), name: "", type: "Text Input", label: "",
  required: "Yes", readonly: "No", dataType: "String", constraints: "",
});
const blankButton = () => ({
  id: uid(), name: "", action: "", conditions: "Always enabled",
  confirmation: "No", postAction: "",
});
const blankGridCol = () => ({
  id: uid(), name: "", header: "", type: "String",
  sortable: "Yes", filterable: "No", editable: "No",
});

function assembleTemplate(s) {
  const lines = [];
  lines.push(`Screen Name: ${s.screenName}`);
  lines.push(`Screen Purpose: ${s.purpose}`);
  lines.push(`Screen Type: ${s.screenType}`);
  lines.push(`Access Level: ${s.accessLevel}`);
  lines.push("");

  if (s.controls.length) {
    lines.push("Form Controls:");
    s.controls.forEach(c =>
      lines.push(`- ${c.name} | ${c.type} | ${c.label || c.name} | ${c.required} | ${c.readonly} | ${c.dataType} | ${c.constraints || "None"}`)
    );
    lines.push("");
  }

  if (s.hasGrid && s.gridCols.length) {
    lines.push(`Grid (${s.gridName || "Records"}):`);
    s.gridCols.forEach(c =>
      lines.push(`- ${c.name} | ${c.header || c.name} | ${c.type} | Sortable: ${c.sortable} | Filterable: ${c.filterable} | ${c.editable === "Yes" ? "Editable" : "Read-only"}`)
    );
    lines.push("");
  }

  if (s.dbMapping.trim()) { lines.push("Database Tables & Mapping:"); lines.push(s.dbMapping); lines.push(""); }
  if (s.dependencies.trim()) { lines.push("Dependencies & Relationships:"); lines.push(s.dependencies); lines.push(""); }
  if (s.validations.trim()) { lines.push("Validations & Business Rules:"); lines.push(s.validations); lines.push(""); }
  if (s.formulas.trim()) { lines.push("Formulas & Calculations:"); lines.push(s.formulas); lines.push(""); }

  if (s.buttons.length) {
    lines.push("Actions & Buttons:");
    s.buttons.forEach(b =>
      lines.push(`- ${b.name} | ${b.action} | ${b.conditions} | Confirmation: ${b.confirmation} | Post-action: ${b.postAction}`)
    );
    lines.push("");
  }

  if (s.notes.trim()) { lines.push("Additional Notes:"); lines.push(s.notes); }
  return lines.join("\n");
}

export default function ScreenGenerator() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [previewTab, setPreviewTab] = useState("preview");

  const [screenName, setScreenName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [screenType, setScreenType] = useState("Form");
  const [accessLevel, setAccessLevel] = useState("All Users");

  const [controls, setControls] = useState([blankControl()]);
  const [hasGrid, setHasGrid] = useState(false);
  const [gridName, setGridName] = useState("");
  const [gridCols, setGridCols] = useState([blankGridCol()]);

  const [dbMapping, setDbMapping] = useState("");
  const [dependencies, setDependencies] = useState("");
  const [validations, setValidations] = useState("");
  const [formulas, setFormulas] = useState("");
  const [notes, setNotes] = useState("");
  const [buttons, setButtons] = useState([
    { ...blankButton(), name: "Save", action: "Save record", conditions: "Required fields filled", confirmation: "No", postAction: "Refresh / show success" },
    { ...blankButton(), name: "Clear", action: "Reset form fields", conditions: "Always enabled", confirmation: "No", postAction: "Clear all inputs" },
    { ...blankButton(), name: "Cancel", action: "Discard and go back", conditions: "Always enabled", confirmation: "No", postAction: "Navigate back" },
  ]);

  const updateControl = (id, key, val) =>
    setControls(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  const removeControl = id => setControls(prev => prev.filter(c => c.id !== id));

  const updateGridCol = (id, key, val) =>
    setGridCols(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  const removeGridCol = id => setGridCols(prev => prev.filter(c => c.id !== id));

  const updateButton = (id, key, val) =>
    setButtons(prev => prev.map(b => b.id === id ? { ...b, [key]: val } : b));
  const removeButton = id => setButtons(prev => prev.filter(b => b.id !== id));

  const handleGenerate = async () => {
    if (!screenName.trim()) { setError("Screen Name is required."); setTab(0); return; }
    if (!controls.some(c => c.name.trim())) { setError("Add at least one control with a name."); setTab(1); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const template = assembleTemplate({
        screenName, purpose, screenType, accessLevel,
        controls, hasGrid, gridName, gridCols,
        dbMapping, dependencies, validations, formulas, buttons, notes,
      });
      const res = await api.post("/generate/from-template", { template });
      setResult(res.data);
      setPreviewTab("preview");
    } catch (err) {
      setError(err.response?.data?.detail || "Generation failed — check your API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <button onClick={() => navigate("/")} style={s.backBtn}>← Back</button>
          <div>
            <h1 style={s.headerTitle}>Screen Generator</h1>
            <p style={s.headerSub}>Fill in the template sections — AI generates a live preview</p>
          </div>
        </div>
        <button onClick={handleGenerate} disabled={loading} className="btn-primary" style={{ opacity: loading ? 0.6 : 1 }}>
          {loading ? "Generating…" : "⚡ Generate Screen"}
        </button>
      </div>

      <div style={s.body}>
        {/* Form panel */}
        <div style={s.formPanel}>
          {/* Tabs */}
          <div style={s.tabs}>
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{ ...s.tabBtn, ...(tab === i ? s.tabActive : {}) }}>
                {t}
              </button>
            ))}
          </div>

          <div style={s.formBody}>
            {error && <div style={s.errorBox}>{error}</div>}

            {/* Tab 0 — Screen Info */}
            {tab === 0 && (
              <div style={s.section}>
                <Field label="Screen Name *" hint="e.g. Customer Registration Form">
                  <input style={s.input} value={screenName} onChange={e => setScreenName(e.target.value)} placeholder="Customer Registration Form" />
                </Field>
                <Field label="Screen Purpose" hint="What does this screen do?">
                  <input style={s.input} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Register new customers in the system" />
                </Field>
                <Field label="Screen Type">
                  <select style={s.input} value={screenType} onChange={e => setScreenType(e.target.value)}>
                    {SCREEN_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Access Level">
                  <input style={s.input} value={accessLevel} onChange={e => setAccessLevel(e.target.value)} placeholder="All Users / Admin / Sales Team" />
                </Field>
              </div>
            )}

            {/* Tab 1 — Controls */}
            {tab === 1 && (
              <div style={s.section}>
                <p style={s.sectionHint}>Define all form input controls on the screen.</p>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["Field Name", "Type", "Label", "Required", "Read-only", "Data Type", "Constraints", ""].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {controls.map(c => (
                        <tr key={c.id}>
                          <td style={s.td}><input style={s.cellInput} value={c.name} onChange={e => updateControl(c.id, "name", e.target.value)} placeholder="firstName" /></td>
                          <td style={s.td}>
                            <select style={s.cellInput} value={c.type} onChange={e => updateControl(c.id, "type", e.target.value)}>
                              {CONTROL_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={s.td}><input style={s.cellInput} value={c.label} onChange={e => updateControl(c.id, "label", e.target.value)} placeholder="First Name" /></td>
                          <td style={s.td}>
                            <select style={s.cellInput} value={c.required} onChange={e => updateControl(c.id, "required", e.target.value)}>
                              <option>Yes</option><option>No</option>
                            </select>
                          </td>
                          <td style={s.td}>
                            <select style={s.cellInput} value={c.readonly} onChange={e => updateControl(c.id, "readonly", e.target.value)}>
                              <option>No</option><option>Yes</option>
                            </select>
                          </td>
                          <td style={s.td}><input style={s.cellInput} value={c.dataType} onChange={e => updateControl(c.id, "dataType", e.target.value)} placeholder="String" /></td>
                          <td style={s.td}><input style={s.cellInput} value={c.constraints} onChange={e => updateControl(c.id, "constraints", e.target.value)} placeholder="Max 50 chars" /></td>
                          <td style={s.td}><button onClick={() => removeControl(c.id)} style={s.removeBtn}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setControls(p => [...p, blankControl()])} className="btn-secondary" style={{ marginTop: 12 }}>
                  + Add Control
                </button>
              </div>
            )}

            {/* Tab 2 — Grid */}
            {tab === 2 && (
              <div style={s.section}>
                <label style={s.checkRow}>
                  <input type="checkbox" checked={hasGrid} onChange={e => setHasGrid(e.target.checked)} style={{ marginRight: 8 }} />
                  This screen has a data grid / table
                </label>
                {hasGrid && (
                  <>
                    <Field label="Grid Name" hint="e.g. Order Line Items">
                      <input style={s.input} value={gridName} onChange={e => setGridName(e.target.value)} placeholder="Order Line Items" />
                    </Field>
                    <div style={s.tableWrap}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            {["Column Name", "Header Label", "Data Type", "Sortable", "Filterable", "Editable", ""].map(h => (
                              <th key={h} style={s.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gridCols.map(c => (
                            <tr key={c.id}>
                              <td style={s.td}><input style={s.cellInput} value={c.name} onChange={e => updateGridCol(c.id, "name", e.target.value)} placeholder="orderDate" /></td>
                              <td style={s.td}><input style={s.cellInput} value={c.header} onChange={e => updateGridCol(c.id, "header", e.target.value)} placeholder="Order Date" /></td>
                              <td style={s.td}><input style={s.cellInput} value={c.type} onChange={e => updateGridCol(c.id, "type", e.target.value)} placeholder="String" /></td>
                              {["sortable", "filterable", "editable"].map(key => (
                                <td key={key} style={s.td}>
                                  <select style={s.cellInput} value={c[key]} onChange={e => updateGridCol(c.id, key, e.target.value)}>
                                    <option>Yes</option><option>No</option>
                                  </select>
                                </td>
                              ))}
                              <td style={s.td}><button onClick={() => removeGridCol(c.id)} style={s.removeBtn}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => setGridCols(p => [...p, blankGridCol()])} className="btn-secondary" style={{ marginTop: 12 }}>
                      + Add Column
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Tab 3 — Database */}
            {tab === 3 && (
              <div style={s.section}>
                <Field label="Primary Table & Columns" hint="Table name, column names, PK/FK info">
                  <textarea style={{ ...s.input, height: 120, resize: "vertical" }} value={dbMapping}
                    onChange={e => setDbMapping(e.target.value)}
                    placeholder={"Primary Table: Customer (CustomerID PK, FirstName, LastName, Email, CountryID FK)\nLookup: Country (CountryID PK, CountryName)"} />
                </Field>
                <Field label="Control → Column Mapping" hint="Which field maps to which table column">
                  <textarea style={{ ...s.input, height: 100, resize: "vertical" }} value={dependencies}
                    onChange={e => setDependencies(e.target.value)}
                    placeholder={"firstName → Customer.FirstName\ncountryID → Customer.CountryID\ncityID → Customer.CityID (depends on countryID)"} />
                </Field>
              </div>
            )}

            {/* Tab 4 — Rules & Formulas */}
            {tab === 4 && (
              <div style={s.section}>
                <Field label="Validations & Business Rules">
                  <textarea style={{ ...s.input, height: 140, resize: "vertical" }} value={validations}
                    onChange={e => setValidations(e.target.value)}
                    placeholder={"- FirstName, LastName, Email, Status are required\n- Email must be unique and match email format\n- DOB cannot be in the future\n- City dropdown filters based on selected Country"} />
                </Field>
                <Field label="Formulas & Calculated Fields">
                  <textarea style={{ ...s.input, height: 100, resize: "vertical" }} value={formulas}
                    onChange={e => setFormulas(e.target.value)}
                    placeholder={"LineTotal = Quantity × UnitPrice\nTotalAmount = SUM(LineTotal) for all rows"} />
                </Field>
                <Field label="Additional Notes / Special Behaviours">
                  <textarea style={{ ...s.input, height: 80, resize: "vertical" }} value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any other important behaviour, navigation flow, print/export, integrations..." />
                </Field>
              </div>
            )}

            {/* Tab 5 — Buttons */}
            {tab === 5 && (
              <div style={s.section}>
                <p style={s.sectionHint}>Define all action buttons on the screen.</p>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["Button Label", "Action", "Enabled When", "Confirm?", "After Action", ""].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {buttons.map(b => (
                        <tr key={b.id}>
                          <td style={s.td}><input style={s.cellInput} value={b.name} onChange={e => updateButton(b.id, "name", e.target.value)} placeholder="Save" /></td>
                          <td style={s.td}><input style={s.cellInput} value={b.action} onChange={e => updateButton(b.id, "action", e.target.value)} placeholder="Save record to DB" /></td>
                          <td style={s.td}><input style={s.cellInput} value={b.conditions} onChange={e => updateButton(b.id, "conditions", e.target.value)} placeholder="Required fields filled" /></td>
                          <td style={s.td}>
                            <select style={s.cellInput} value={b.confirmation} onChange={e => updateButton(b.id, "confirmation", e.target.value)}>
                              <option>No</option><option>Yes</option>
                            </select>
                          </td>
                          <td style={s.td}><input style={s.cellInput} value={b.postAction} onChange={e => updateButton(b.id, "postAction", e.target.value)} placeholder="Show success toast" /></td>
                          <td style={s.td}><button onClick={() => removeButton(b.id)} style={s.removeBtn}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setButtons(p => [...p, blankButton()])} className="btn-secondary" style={{ marginTop: 12 }}>
                  + Add Button
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Preview panel */}
        <div style={s.previewPanel}>
          <div style={s.previewHeader}>
            <span style={s.previewTitle}>Preview</span>
            {result && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPreviewTab("preview")} style={{ ...s.previewTabBtn, ...(previewTab === "preview" ? s.previewTabActive : {}) }}>UI Preview</button>
                <button onClick={() => setPreviewTab("xml")} style={{ ...s.previewTabBtn, ...(previewTab === "xml" ? s.previewTabActive : {}) }}>XML</button>
              </div>
            )}
          </div>

          <div style={s.previewBody}>
            {loading && (
              <div style={s.centerMsg}>
                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <p style={{ color: "#888", marginTop: 16 }}>Generating screen…</p>
              </div>
            )}
            {!loading && !result && (
              <div style={s.centerMsg}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
                <p style={{ color: "#888", textAlign: "center" }}>
                  Fill in the template sections on the left,<br />then click <strong>⚡ Generate Screen</strong>
                </p>
              </div>
            )}
            {!loading && result && previewTab === "preview" && (
              <iframe
                srcDoc={result.html}
                style={s.iframe}
                title="Screen Preview"
                sandbox="allow-scripts"
              />
            )}
            {!loading && result && previewTab === "xml" && (
              <pre style={s.xmlPre}>{result.xml}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#cfcfcf", marginBottom: 6 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "#666", marginLeft: 8 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0c29", color: "#fff", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #222", background: "#13102e", flexShrink: 0 },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  backBtn: { background: "none", border: "1px solid #333", color: "#aaa", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 },
  headerTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  headerSub: { margin: "2px 0 0", fontSize: 12, color: "#666" },
  body: { flex: 1, display: "flex", overflow: "hidden", height: "calc(100vh - 65px)" },
  formPanel: { width: 480, minWidth: 420, display: "flex", flexDirection: "column", borderRight: "1px solid #222", overflow: "hidden" },
  tabs: { display: "flex", borderBottom: "1px solid #222", background: "#13102e", flexShrink: 0, overflowX: "auto" },
  tabBtn: { flex: "none", padding: "10px 14px", fontSize: 12, fontWeight: 500, color: "#888", background: "none", border: "none", cursor: "pointer", borderBottom: "2px solid transparent", whiteSpace: "nowrap" },
  tabActive: { color: "#818cf8", borderBottomColor: "#818cf8" },
  formBody: { flex: 1, overflowY: "auto", padding: 20 },
  section: {},
  sectionHint: { fontSize: 12, color: "#666", marginBottom: 12, marginTop: 0 },
  input: { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 7, border: "1px solid #333", background: "#1a1a2e", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "6px 8px", color: "#666", fontWeight: 600, borderBottom: "1px solid #222", whiteSpace: "nowrap" },
  td: { padding: "4px 4px" },
  cellInput: { width: "100%", boxSizing: "border-box", padding: "5px 7px", borderRadius: 5, border: "1px solid #2a2a40", background: "#1a1a2e", color: "#fff", fontSize: 12, outline: "none" },
  removeBtn: { background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14, padding: "2px 4px" },
  checkRow: { display: "flex", alignItems: "center", fontSize: 13, color: "#cfcfcf", marginBottom: 16, cursor: "pointer" },
  errorBox: { background: "#ff4d4f22", border: "1px solid #ff4d4f", color: "#ff4d4f", borderRadius: 7, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  previewPanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  previewHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #222", background: "#13102e", flexShrink: 0 },
  previewTitle: { fontSize: 13, fontWeight: 600, color: "#888" },
  previewTabBtn: { padding: "5px 14px", borderRadius: 6, border: "1px solid #333", background: "none", color: "#888", fontSize: 12, cursor: "pointer" },
  previewTabActive: { background: "#1e1b4b", color: "#818cf8", borderColor: "#4f46e5" },
  previewBody: { flex: 1, overflow: "hidden", position: "relative" },
  centerMsg: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  iframe: { width: "100%", height: "100%", border: "none", background: "#fff" },
  xmlPre: { margin: 0, padding: 20, fontSize: 11, color: "#9ca3af", overflowY: "auto", height: "100%", boxSizing: "border-box", background: "#0a0818", whiteSpace: "pre-wrap", wordBreak: "break-word" },
};
