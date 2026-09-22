import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import api from "../api/client";

// ============================================================================
// XML PARSING — deterministic, no LLM. Reads the screen XML directly per the
// vocabulary in backend/app/services/ai_service.py's UI_XML_VOCABULARY_RULES.
// Tag-name spelling for the grid's own toolbar (search/count/refresh/export)
// and the bottom action toolbar's buttons has been observed to vary across
// generations (<button>/<action>/<actionButton>, <searchInput>/<search>, ...),
// so those are matched loosely (by substring on the lowercased tag name)
// rather than assuming one exact tag — attributes are always read the same
// way regardless of the tag they're found on.
// ============================================================================

function attr(el, name, fallback = "") {
  return el?.getAttribute(name) ?? fallback;
}

function textOf(el, selector) {
  return el?.querySelector(selector)?.textContent?.trim() || "";
}

function parseField(fieldEl) {
  return {
    name: attr(fieldEl, "name"),
    label: attr(fieldEl, "label") || attr(fieldEl, "name"),
    type: attr(fieldEl, "type") || "text",
    dataSource: attr(fieldEl, "dataSource"),
    valueField: attr(fieldEl, "valueField") || "id",
    displayField: attr(fieldEl, "displayField") || "name",
    lookupEntity: attr(fieldEl, "lookupEntity"),
    lookupField: attr(fieldEl, "lookupField"),
    readonly: attr(fieldEl, "readonly") === "true",
    binding: attr(fieldEl, "binding"),
    autoFill: attr(fieldEl, "autoFill"),
    formula: attr(fieldEl, "formula"),
    hint: textOf(fieldEl, ":scope > hint"),
    rules: Array.from(fieldEl.querySelectorAll(":scope > rule")).map((r) => ({
      required: attr(r, "required") === "true",
      pattern: attr(r, "pattern"),
      unique: attr(r, "unique") === "true",
      maxLength: attr(r, "maxLength"),
      minLength: attr(r, "minLength"),
      minValue: attr(r, "minValue"),
      maxValue: attr(r, "maxValue"),
    })),
  };
}

function parseFieldset(fsEl) {
  return {
    legend: attr(fsEl, "legend"),
    items: Array.from(fsEl.children)
      .map((child) => {
        const tag = child.tagName.toLowerCase();
        if (tag === "field") return { kind: "field", field: parseField(child) };
        if (tag === "fieldset") return { kind: "fieldset", fieldset: parseFieldset(child) };
        return null;
      })
      .filter(Boolean),
  };
}

function flattenFields(fieldsets) {
  const out = [];
  const walk = (items) => items.forEach((it) => (it.kind === "field" ? out.push(it.field) : walk(it.fieldset.items)));
  fieldsets.forEach((fs) => walk(fs.items));
  return out;
}

function parseGridToolbar(gridEl) {
  const toolbarEl = gridEl.querySelector(":scope > toolbar");
  const tags = toolbarEl ? Array.from(toolbarEl.children).map((c) => c.tagName.toLowerCase()) : [];
  const has = (needle) => tags.some((t) => t.includes(needle));
  return { search: has("search"), count: has("count"), refresh: has("refresh"), exportCsv: has("export") };
}

function parseBottomToolbar(screenEl) {
  const toolbarEl = Array.from(screenEl.querySelectorAll(":scope > toolbar")).find((t) => attr(t, "position") === "bottom");
  if (!toolbarEl) return null;
  return {
    buttons: Array.from(toolbarEl.children).map((b) => ({
      type: (attr(b, "type") || b.tagName.toLowerCase()).toLowerCase(),
      label: attr(b, "label") || b.tagName,
      style: attr(b, "style") || "secondary",
      // "confirmation" isn't always a plain "true"/"false" flag — generations vary between that
      // and a full confirmation message string (e.g. confirmation="Are you sure you want to
      // delete this task?"). Any non-empty value other than a literal "false" means "confirm",
      // and a real message string is used as the actual confirm() prompt when present.
      confirmation: (() => {
        const raw = attr(b, "confirmation");
        if (!raw || raw.toLowerCase() === "false") return "";
        return raw.toLowerCase() === "true" ? "Are you sure?" : raw;
      })(),
    })),
  };
}

export function parseScreenXml(xmlString) {
  if (!xmlString || !xmlString.trim()) return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlString, "application/xml");
    if (doc.querySelector("parsererror")) return null;
  } catch {
    return null;
  }
  const screenEl = doc.querySelector("screen");
  if (!screenEl) return null;

  const metadataEl = screenEl.querySelector(":scope > metadata");
  const metadata = {
    entity: textOf(metadataEl, "entity"),
    dataSource: textOf(metadataEl, "dataSource"),
    screenModes: textOf(metadataEl, "screenModes"),
  };

  const headerEl = screenEl.querySelector(":scope > header");
  const header = {
    title: textOf(headerEl, "title") || attr(screenEl, "title"),
    subtitle: textOf(headerEl, "subtitle"),
    breadcrumb: textOf(headerEl, "breadcrumb"),
  };

  const formEl = screenEl.querySelector(":scope > form");
  const form = formEl ? { fieldsets: Array.from(formEl.querySelectorAll(":scope > fieldset")).map(parseFieldset) } : null;

  const gridEl = screenEl.querySelector(":scope > grid");
  const grid = gridEl
    ? {
        readonly: attr(gridEl, "readonly") === "true",
        pagination: attr(gridEl, "pagination") === "true",
        pageSize: parseInt(attr(gridEl, "pageSize", "10"), 10) || 10,
        emptyMessage: attr(gridEl, "emptyMessage", "No records found."),
        columns: Array.from(gridEl.querySelectorAll(":scope > column")).map((c) => ({
          id: attr(c, "id"),
          header: attr(c, "header") || attr(c, "id"),
          binding: attr(c, "binding") || attr(c, "id"),
          sortable: attr(c, "sortable") === "true",
          filterable: attr(c, "filterable") === "true",
          hyperlink: attr(c, "hyperlink") === "true",
        })),
        toolbar: parseGridToolbar(gridEl),
        sampleData: Array.from(gridEl.querySelectorAll(":scope > sampleData > row")).map((rowEl) => {
          const row = {};
          Array.from(rowEl.children).forEach((c) => { row[c.tagName] = c.textContent?.trim() || ""; });
          return row;
        }),
      }
    : null;

  const bottomToolbar = parseBottomToolbar(screenEl);

  const navEl = screenEl.querySelector(":scope > navigation");
  const navigation = navEl
    ? {
        navItems: Array.from(navEl.querySelectorAll(":scope > navItem")).map((n) => ({
          targetScreen: attr(n, "targetScreen"),
          label: attr(n, "label") || attr(n, "targetScreen"),
          description: attr(n, "description"),
          icon: attr(n, "icon"),
        })),
      }
    : null;

  const authEl = screenEl.querySelector(":scope > auth");
  const auth = authEl
    ? {
        entity: attr(authEl, "entity"),
        signupFields: Array.from(authEl.querySelectorAll(":scope > signup > field")).map(parseField),
        loginFields: Array.from(authEl.querySelectorAll(":scope > login > field")).map(parseField),
      }
    : null;

  return { screen: { id: attr(screenEl, "id"), title: attr(screenEl, "title"), purpose: attr(screenEl, "purpose") }, metadata, header, form, grid, bottomToolbar, navigation, auth };
}

// ============================================================================
// NEW SCHEMA — the declarative query/event vocabulary (dataSources/queries/ui/
// events/execute/map/when/set/message/stop) that replaces the form/grid/auth/
// navigation vocabulary above for new screens. Detected by the presence of a
// top-level <ui> element, which the old vocabulary never used (it put <field>/
// <grid> directly under <form>/<screen>). See ai_service.UI_XML_VOCABULARY_RULES
// and preview_db_service.run_event for what actually executes server-side —
// this parser only needs to know WHICH elements carry a change/click event, not
// what the event does: all query execution, condition evaluation, and control
// flow (<execute>/<when>/<map>/<set>/<message>/<stop>) happens on the server;
// the client only ever sends {elementId, eventType, fieldValues} and applies
// back a flat action list mechanically.
// ============================================================================

const NEW_SCHEMA_RE = /<ui[\s>]/;

export function isNewSchemaXml(xmlString) {
  return NEW_SCHEMA_RE.test(xmlString || "");
}

// <event type="..." element="fieldOrButtonId"> lives in ONE top-level <events> block (a sibling
// of <ui>, not nested inside the field/button it's wired to) — mirrors how <queries> is one
// top-level list rather than scattered per-field. Built once per document, then looked up by id
// when constructing each field/button below.
function parseEventMap(doc) {
  const map = {};
  doc.querySelectorAll("events > event").forEach((ev) => {
    const elId = attr(ev, "element");
    const type = attr(ev, "type");
    if (!elId || !type) return;
    (map[elId] || (map[elId] = [])).push(type);
  });
  return map;
}

function parseNewField(el, eventMap) {
  return {
    kind: "field",
    id: attr(el, "id"),
    label: attr(el, "label") || attr(el, "id"),
    type: attr(el, "type") || "text",
    readonly: attr(el, "readonly") === "true",
    persistenceMapping: attr(el, "persistenceMapping"),
    hint: textOf(el, ":scope > hint"),
    rules: Array.from(el.querySelectorAll(":scope > rule")).map((r) => ({
      required: attr(r, "required") === "true",
      pattern: attr(r, "pattern"),
      maxLength: attr(r, "maxLength"),
      minValue: attr(r, "minValue"),
      maxValue: attr(r, "maxValue"),
    })),
    eventTypes: eventMap[attr(el, "id")] || [],
  };
}

function parseNewButton(el, eventMap) {
  return {
    kind: "button",
    id: attr(el, "id"),
    label: attr(el, "label") || attr(el, "id"),
    style: attr(el, "style") || "secondary",
    eventTypes: eventMap[attr(el, "id")] || [],
  };
}

function parseNewGrid(el) {
  return {
    kind: "grid",
    id: attr(el, "id"),
    label: attr(el, "label") || attr(el, "id"),
    readonly: attr(el, "readonly") !== "false",
    emptyMessage: attr(el, "emptyMessage", "No records found."),
    columns: Array.from(el.querySelectorAll(":scope > column")).map((c) => ({
      id: attr(c, "id"),
      header: attr(c, "header") || attr(c, "id"),
      binding: attr(c, "binding") || attr(c, "id"),
    })),
  };
}

function parseUiItems(containerEl, eventMap) {
  return Array.from(containerEl.children)
    .map((child) => {
      const tag = child.tagName.toLowerCase();
      if (tag === "field") return parseNewField(child, eventMap);
      if (tag === "button") return parseNewButton(child, eventMap);
      if (tag === "grid") return parseNewGrid(child);
      if (tag === "fieldset") return { kind: "fieldset", legend: attr(child, "legend"), items: parseUiItems(child, eventMap) };
      return null;
    })
    .filter(Boolean);
}

function flattenUiItems(items) {
  const out = [];
  const walk = (arr) => arr.forEach((it) => (it.kind === "fieldset" ? walk(it.items) : out.push(it)));
  walk(items);
  return out;
}

export function parseNewScreenXml(xmlString) {
  if (!xmlString || !xmlString.trim()) return null;
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlString, "application/xml");
    if (doc.querySelector("parsererror")) return null;
  } catch {
    return null;
  }
  const screenEl = doc.querySelector("screen");
  if (!screenEl) return null;

  const headerEl = screenEl.querySelector(":scope > header");
  const header = {
    title: textOf(headerEl, "title") || attr(screenEl, "title"),
    subtitle: textOf(headerEl, "subtitle"),
  };

  const eventMap = parseEventMap(doc);
  const uiEl = screenEl.querySelector(":scope > ui");
  const items = uiEl ? parseUiItems(uiEl, eventMap) : [];
  const flat = flattenUiItems(items);

  return {
    screen: { id: attr(screenEl, "id"), title: attr(screenEl, "title") },
    header,
    items,
    fields: flat.filter((i) => i.kind === "field"),
    grids: flat.filter((i) => i.kind === "grid"),
    buttons: flat.filter((i) => i.kind === "button"),
  };
}

async function runScreenEvent(projectId, screenId, elementId, eventType, fieldValues) {
  const res = await api.post(`/projects/${projectId}/screens/${screenId}/run-event`, {
    elementId, eventType, fieldValues,
  });
  return res.data?.actions || [];
}

// ============================================================================
// DATA LAYER — the existing, real preview-db endpoints (Postgres rows in
// proj_<id>). No new backend needed; GET/PUT already do everything a live
// CRUD screen needs (see preview_db_service.py). PUT always replaces the
// WHOLE row array for an entity — never a partial diff — so callers must
// keep every row (including ones not being edited right now) in the array
// they send, and must preserve each existing row's real `id` so identity
// stays stable across saves (a row with no `id` gets a fresh one assigned).
// ============================================================================

async function fetchEntityRows(projectId, entityName) {
  if (!projectId || !entityName) return { rows: [], synced: false };
  try {
    const res = await api.get(`/projects/${projectId}/preview-db/${encodeURIComponent(entityName)}`);
    return { rows: res.data?.rows || [], synced: Boolean(res.data?.synced) };
  } catch {
    return { rows: [], synced: false };
  }
}

async function saveEntityRows(projectId, entityName, rows) {
  await api.put(`/projects/${projectId}/preview-db/${encodeURIComponent(entityName)}`, { rows });
}

// Fetches (once, deduped) every distinct dataSource/lookupEntity a screen's fields reference,
// for dropdown/lookup options — separate from the primary entity's own row data.
function useReferenceData(projectId, entityNames) {
  const [data, setData] = useState({});
  const key = entityNames.join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const names = [...new Set(entityNames.filter(Boolean))];
      const results = await Promise.all(names.map((n) => fetchEntityRows(projectId, n)));
      if (cancelled) return;
      const next = {};
      names.forEach((n, i) => { next[n] = results[i].rows; });
      setData(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, key]);
  return data;
}

// ============================================================================
// FORMULA — a small, safe arithmetic evaluator (+,-,*,/,parens, numbers, and
// known field names only) for readonly computed fields, e.g.
// formula="internal_marks + external_marks". Never uses eval()/Function() on
// anything that isn't already reduced to pure digits/operators.
// ============================================================================

function evalFormula(expr, values) {
  if (!expr) return null;
  let substituted = expr;
  Object.keys(values)
    .sort((a, b) => b.length - a.length) // longer names first, avoid partial-word clashes
    .forEach((name) => {
      const val = Number(values[name]);
      substituted = substituted.replace(new RegExp(`\\b${name}\\b`, "g"), Number.isFinite(val) ? String(val) : "0");
    });
  if (!/^[0-9+\-*/.() \s]+$/.test(substituted)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${substituted});`)();
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

// ============================================================================
// FIELD INPUT — one real HTML control per vocabulary field type.
// ============================================================================

function FieldInput({ field, value, onChange, options }) {
  if (field.binding === "hidden") return null;
  const commonProps = {
    id: `field-${field.name}`,
    name: field.name,
    disabled: field.readonly,
    required: field.rules?.some((r) => r.required),
  };

  let control;
  switch (field.type) {
    case "select": {
      const opts = options?.[field.dataSource] || [];
      control = (
        <select {...commonProps} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Select —</option>
          {opts.map((o) => (
            <option key={o[field.valueField]} value={o[field.valueField]}>{o[field.displayField] ?? o[field.valueField]}</option>
          ))}
        </select>
      );
      break;
    }
    case "lookup": {
      // v1: a plain searchable dropdown sourced from lookupEntity, not the full modal-search UX.
      const opts = options?.[field.lookupEntity] || [];
      control = (
        <select {...commonProps} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Search / Select —</option>
          {opts.map((o) => (
            <option key={o.id ?? o[field.lookupField]} value={o[field.lookupField]}>{o[field.lookupField]}</option>
          ))}
        </select>
      );
      break;
    }
    case "checkbox":
      control = <input {...commonProps} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
      break;
    case "textarea":
      control = <textarea {...commonProps} value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={3} />;
      break;
    case "file":
      // Real file storage isn't implemented (declined for this pass) — inert, labeled honestly.
      control = <input {...commonProps} type="file" disabled title="File upload isn't implemented yet" />;
      break;
    case "number":
      control = <input {...commonProps} type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value)} min={field.rules?.find((r) => r.minValue)?.minValue} max={field.rules?.find((r) => r.maxValue)?.maxValue} />;
      break;
    case "date":
    case "time":
    case "email":
    case "url":
    case "color":
    case "password":
      control = <input {...commonProps} type={field.type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "phone":
      control = <input {...commonProps} type="tel" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = (
        <input
          {...commonProps}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.rules?.find((r) => r.maxLength)?.maxLength || undefined}
          pattern={field.rules?.find((r) => r.pattern)?.pattern || undefined}
        />
      );
  }

  return (
    <div style={styles.fieldWrap}>
      <label htmlFor={commonProps.id} style={styles.label}>{field.label}{commonProps.required ? " *" : ""}</label>
      {control}
      {field.hint && <div style={styles.hint}>{field.hint}</div>}
    </div>
  );
}

// ============================================================================
// AUTH RENDERER — no real backend/hashing exists anymore (that lived in the
// now-retired generate-api output). Signup/login round-trip against the real
// entity's rows via preview-db exactly like any other entity — this is a
// preview-only simulation, plaintext, NOT secure. Labeled as such.
// ============================================================================

function AuthRenderer({ xml, projectId }) {
  const [isLogin, setIsLogin] = useState(true);
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = isLogin ? xml.auth.loginFields : xml.auth.signupFields;
  const identifyingField = xml.auth.loginFields.find((f) => f.type === "email" || f.type === "text")?.name || "email";
  const passwordField = fields.find((f) => f.type === "password")?.name || "password";

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      const { rows } = await fetchEntityRows(projectId, xml.auth.entity);
      if (isLogin) {
        const match = rows.find((r) => String(r[identifyingField] ?? "").toLowerCase() === String(values[identifyingField] ?? "").toLowerCase());
        if (!match || String(match[passwordField] ?? "") !== String(values[passwordField] ?? "")) {
          setError("Invalid credentials");
        } else {
          setSuccess(`Logged in as ${match[identifyingField]}`);
        }
      } else {
        if (values.password !== values.confirmPassword) { setError("Passwords do not match"); return; }
        const exists = rows.some((r) => String(r[identifyingField] ?? "").toLowerCase() === String(values[identifyingField] ?? "").toLowerCase());
        if (exists) { setError(`${identifyingField} already registered`); return; }
        const { confirmPassword, ...toStore } = values; // eslint-disable-line no-unused-vars
        await saveEntityRows(projectId, xml.auth.entity, [...rows, toStore]);
        setSuccess("Account created — you can log in now.");
        setIsLogin(true);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.authCard}>
      <h2 style={styles.title}>{isLogin ? "Log In" : "Sign Up"}</h2>
      <p style={styles.previewNotice}>Preview only — accounts are plain rows in the project's preview data, not real hashed/secure auth.</p>
      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>{success}</div>}
      <form onSubmit={submit}>
        {fields.map((f) => (
          <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
        ))}
        <button type="submit" disabled={busy} style={styles.primaryBtn}>{busy ? "..." : isLogin ? "Log In" : "Sign Up"}</button>
      </form>
      <button type="button" style={styles.linkBtn} onClick={() => { setIsLogin((v) => !v); setError(""); setSuccess(""); }}>
        {isLogin ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );
}

// ============================================================================
// NAVIGATION RENDERER — real navigation, direct function call (native React
// now, no iframe/postMessage boundary).
// ============================================================================

function NavigationRenderer({ xml, onNavigate }) {
  return (
    <div style={styles.navGrid}>
      {xml.navigation.navItems.map((item) => (
        <button key={item.targetScreen} style={styles.navCard} onClick={() => onNavigate?.(item.targetScreen)}>
          <div style={styles.navLabel}>{item.label}</div>
          {item.description && <div style={styles.navDesc}>{item.description}</div>}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// CRUD RENDERER — form + grid + toolbar, any subset present.
// ============================================================================

function CrudRenderer({ xml, projectId }) {
  const primaryEntity = xml.metadata.entity;
  const allFields = xml.form ? flattenFields(xml.form.fieldsets) : [];
  const referencedEntities = useMemo(
    () => allFields.flatMap((f) => [f.dataSource, f.lookupEntity]).filter(Boolean),
    [xml]
  );
  const options = useReferenceData(projectId, referencedEntities);

  const [rows, setRows] = useState(xml.grid?.sampleData || []);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [values, setValues] = useState({});
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const { rows: r, synced: s } = await fetchEntityRows(projectId, primaryEntity);
    setRows(s ? r : (xml.grid?.sampleData || []));
    setSynced(s);
    setLoading(false);
  }, [projectId, primaryEntity, xml]);

  useEffect(() => {
    loadedRef.current = false;
    reload().then(() => { loadedRef.current = true; });
    setEditingId(null);
    setValues({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryEntity, projectId]);

  // Live formula recalculation whenever a dependency field changes.
  useEffect(() => {
    allFields.forEach((f) => {
      if (!f.formula) return;
      const computed = evalFormula(f.formula, values);
      if (computed !== null && values[f.name] !== computed) {
        setValues((s) => ({ ...s, [f.name]: computed }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  const startNew = () => { setEditingId(null); setValues({}); setError(""); };
  const startEdit = (row) => { setEditingId(row.id); setValues(row); setError(""); };

  const handleSave = async () => {
    for (const f of allFields) {
      if (f.rules?.some((r) => r.required) && (values[f.name] === undefined || values[f.name] === "")) {
        setError(`${f.label} is required`);
        return;
      }
    }
    const saveBtn = xml.bottomToolbar?.buttons.find((b) => b.type === "save");
    if (saveBtn?.confirmation && !window.confirm(saveBtn.confirmation)) return;
    setBusy(true); setError("");
    try {
      const next = editingId != null
        ? rows.map((r) => (r.id === editingId ? { ...values, id: editingId } : r))
        : [...rows, values];
      await saveEntityRows(projectId, primaryEntity, next);
      setRows(next);
      setSynced(true);
      startNew();
    } catch {
      setError("Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row) => {
    const deleteBtn = xml.bottomToolbar?.buttons.find((b) => b.type === "delete");
    if (deleteBtn?.confirmation && !window.confirm(deleteBtn.confirmation)) return;
    setBusy(true); setError("");
    try {
      const next = rows.filter((r) => r.id !== row.id);
      await saveEntityRows(projectId, primaryEntity, next);
      setRows(next);
      if (editingId === row.id) startNew();
    } catch {
      setError("Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const displayRows = useMemo(() => {
    let out = rows;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
    }
    if (sortCol) {
      out = [...out].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * sortDir;
      });
    }
    return out;
  }, [rows, search, sortCol, sortDir]);

  const exportCsv = () => {
    if (!xml.grid) return;
    const cols = xml.grid.columns;
    const lines = [cols.map((c) => c.header).join(",")];
    displayRows.forEach((r) => lines.push(cols.map((c) => JSON.stringify(r[c.binding] ?? "")).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${primaryEntity || "data"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const buttons = xml.bottomToolbar?.buttons || [];

  return (
    <div style={styles.crudWrap}>
      {!synced && !loading && (
        <div style={styles.previewNotice}>No saved data yet for this screen — save something to create it for real.</div>
      )}
      {error && <div style={styles.error}>{error}</div>}

      {xml.form && (
        <div style={styles.formCard}>
          {xml.form.fieldsets.map((fs, i) => (
            <fieldset key={i} style={styles.fieldset}>
              {fs.legend && <legend style={styles.legend}>{fs.legend}</legend>}
              {fs.items.map((it, j) =>
                it.kind === "field" ? (
                  <FieldInput key={j} field={it.field} value={values[it.field.name]} options={options}
                    onChange={(v) => setValues((s) => ({ ...s, [it.field.name]: v }))} />
                ) : (
                  <fieldset key={j} style={styles.fieldset}>
                    {it.fieldset.legend && <legend style={styles.legend}>{it.fieldset.legend}</legend>}
                    {it.fieldset.items.filter((x) => x.kind === "field").map((x, k) => (
                      <FieldInput key={k} field={x.field} value={values[x.field.name]} options={options}
                        onChange={(v) => setValues((s) => ({ ...s, [x.field.name]: v }))} />
                    ))}
                  </fieldset>
                )
              )}
            </fieldset>
          ))}
          {buttons.length > 0 && (
            <div style={styles.btnRow}>
              {buttons.filter((b) => b.type === "save" || b.type === "clear" || b.type === "cancel").map((b) => (
                <button key={b.type} disabled={busy}
                  style={b.type === "save" ? styles.primaryBtn : styles.secondaryBtn}
                  onClick={b.type === "save" ? handleSave : startNew}>
                  {busy && b.type === "save" ? "Saving..." : b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {xml.grid && (
        <div style={styles.gridCard}>
          <div style={styles.gridToolbar}>
            {xml.grid.toolbar.search && (
              <input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} style={styles.searchInput} />
            )}
            {xml.grid.toolbar.count && <span style={styles.countBadge}>{displayRows.length} records</span>}
            {xml.grid.toolbar.refresh && <button style={styles.secondaryBtn} onClick={reload}>Refresh</button>}
            {xml.grid.toolbar.exportCsv && <button style={styles.secondaryBtn} onClick={exportCsv}>Export CSV</button>}
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                {xml.grid.columns.map((c) => (
                  <th key={c.id} style={styles.th} onClick={() => c.sortable && (setSortCol(c.binding), setSortDir((d) => (sortCol === c.binding ? -d : 1)))}>
                    {c.header}{c.sortable && sortCol === c.binding ? (sortDir > 0 ? " ▲" : " ▼") : ""}
                  </th>
                ))}
                {!xml.grid.readonly && <th style={styles.th}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={xml.grid.columns.length + 1} style={styles.emptyCell}>Loading...</td></tr>
              ) : displayRows.length === 0 ? (
                <tr><td colSpan={xml.grid.columns.length + 1} style={styles.emptyCell}>{xml.grid.emptyMessage}</td></tr>
              ) : (
                displayRows.map((row, i) => (
                  <tr key={row.id ?? i}>
                    {xml.grid.columns.map((c) =>
                      c.hyperlink ? (
                        <td key={c.id} style={styles.td}><a href="#" style={styles.hyperlink} onClick={(e) => { e.preventDefault(); startEdit(row); }}>{row[c.binding]}</a></td>
                      ) : (
                        <td key={c.id} style={styles.td}>{String(row[c.binding] ?? "")}</td>
                      )
                    )}
                    {!xml.grid.readonly && (
                      <td style={styles.td}>
                        <button style={styles.linkBtn} onClick={() => startEdit(row)}>Edit</button>
                        {buttons.some((b) => b.type === "delete") && (
                          <button style={{ ...styles.linkBtn, color: "var(--st-danger, #dc2626)" }} onClick={() => handleDelete(row)}>Delete</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QUERY/EVENT RENDERER — new schema. Fields/grids/buttons are rendered purely
// from the parsed shape (no server call needed to draw the screen); a field's
// change (on commit, i.e. blur/checkbox-toggle) or a button's click, if that
// element declares that event type, POSTs {elementId, eventType, fieldValues}
// to run-event and mechanically applies back the returned action list — this
// component never evaluates a condition, never parses <execute>/<when>, and
// never touches SQL. See preview_db_service.run_event for what actually runs.
// ============================================================================

function NewFieldInput({ field, value, disabled, onCommit }) {
  const [localValue, setLocalValue] = useState(value ?? "");
  useEffect(() => { setLocalValue(value ?? ""); }, [value]);
  const commonProps = {
    id: `qfield-${field.id}`,
    disabled: disabled || field.readonly,
    required: field.rules?.some((r) => r.required),
  };
  const commit = (v) => { if (v !== value) onCommit(v); };

  let control;
  switch (field.type) {
    case "checkbox":
      control = <input {...commonProps} type="checkbox" checked={Boolean(value)} onChange={(e) => onCommit(e.target.checked)} />;
      break;
    case "textarea":
      control = <textarea {...commonProps} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => commit(localValue)} rows={3} />;
      break;
    case "number":
      control = (
        <input {...commonProps} type="number" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => commit(localValue)}
          min={field.rules?.find((r) => r.minValue)?.minValue} max={field.rules?.find((r) => r.maxValue)?.maxValue} />
      );
      break;
    case "date":
    case "time":
    case "email":
    case "url":
    case "color":
    case "password":
      control = <input {...commonProps} type={field.type} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => commit(localValue)} />;
      break;
    default:
      // "select" has no declared options source in this schema (dropdown contents come from a
      // query result mapped onto a grid, not a static field option list) — falls back to a plain
      // text input rather than rendering a dropdown with nothing in it.
      control = (
        <input {...commonProps} type="text" value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={() => commit(localValue)}
          maxLength={field.rules?.find((r) => r.maxLength)?.maxLength || undefined}
          pattern={field.rules?.find((r) => r.pattern)?.pattern || undefined} />
      );
  }

  return (
    <div style={styles.fieldWrap}>
      <label htmlFor={commonProps.id} style={styles.label}>{field.label}{commonProps.required ? " *" : ""}</label>
      {control}
      {field.hint && <div style={styles.hint}>{field.hint}</div>}
    </div>
  );
}

function QueryEventScreenRenderer({ xml, projectId, screenId }) {
  const [fieldValues, setFieldValues] = useState({});
  const [gridRows, setGridRows] = useState({});
  const [messages, setMessages] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setFieldValues({});
    setGridRows({});
    setMessages([]);
  }, [screenId]);

  const applyActions = useCallback((actions) => {
    setFieldValues((prev) => {
      let next = prev;
      actions.forEach((a) => {
        if ((a.type === "map" || a.type === "set") && a.target?.startsWith("field:")) {
          next = { ...next, [a.target.slice("field:".length)]: a.value };
        }
      });
      return next;
    });
    setGridRows((prev) => {
      let next = prev;
      actions.forEach((a) => {
        if ((a.type === "map" || a.type === "set") && a.target?.startsWith("grid:") && Array.isArray(a.value)) {
          next = { ...next, [a.target.slice("grid:".length)]: a.value };
        }
      });
      return next;
    });
    setMessages(actions.filter((a) => a.type === "message").map((a) => ({ type: a.messageType || "info", value: a.value })));
  }, []);

  const fireEvent = useCallback(async (elementId, eventType, valuesOverride) => {
    if (!projectId || !screenId) return;
    setBusyId(elementId);
    try {
      const actions = await runScreenEvent(projectId, screenId, elementId, eventType, valuesOverride ?? fieldValues);
      applyActions(actions);
    } catch {
      setMessages([{ type: "error", value: "Something went wrong — please try again." }]);
    } finally {
      setBusyId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, screenId, fieldValues, applyActions]);

  const handleFieldCommit = (field, value) => {
    const nextValues = { ...fieldValues, [field.id]: value };
    setFieldValues(nextValues);
    setMessages([]);
    if (field.eventTypes.includes("change")) fireEvent(field.id, "change", nextValues);
  };

  const renderItems = (items) => items.map((it, i) => {
    if (it.kind === "fieldset") {
      return (
        <fieldset key={i} style={styles.fieldset}>
          {it.legend && <legend style={styles.legend}>{it.legend}</legend>}
          {renderItems(it.items)}
        </fieldset>
      );
    }
    if (it.kind === "field") {
      return (
        <NewFieldInput key={it.id} field={it} value={fieldValues[it.id]} disabled={busyId === it.id}
          onCommit={(v) => handleFieldCommit(it, v)} />
      );
    }
    if (it.kind === "button") {
      return (
        <button key={it.id} disabled={busyId != null}
          style={it.style === "primary" ? styles.primaryBtn : it.style === "danger" ? styles.dangerBtn : styles.secondaryBtn}
          onClick={() => it.eventTypes.includes("click") && fireEvent(it.id, "click")}>
          {busyId === it.id ? "..." : it.label}
        </button>
      );
    }
    if (it.kind === "grid") {
      const rows = gridRows[it.id] || [];
      return (
        <div key={it.id} style={styles.gridCard}>
          {it.label && <div style={styles.gridLabel}>{it.label}</div>}
          <table style={styles.table}>
            <thead>
              <tr>{it.columns.map((c) => <th key={c.id} style={styles.th}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={it.columns.length || 1} style={styles.emptyCell}>{it.emptyMessage}</td></tr>
              ) : rows.map((row, ri) => (
                <tr key={ri}>{it.columns.map((c) => <td key={c.id} style={styles.td}>{String(row[c.binding] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return null;
  });

  return (
    <div style={styles.crudWrap}>
      {messages.map((m, i) => (
        <div key={i} style={m.type === "error" ? styles.error : m.type === "success" ? styles.success : styles.previewNotice}>{m.value}</div>
      ))}
      <div style={styles.formCard}>{renderItems(xml.items)}</div>
    </div>
  );
}

// ============================================================================
// TOP-LEVEL ENTRY POINT
// ============================================================================

export default function XmlScreenRenderer({ xml, projectId, screenId, onNavigate }) {
  const isNew = isNewSchemaXml(xml);
  const parsed = useMemo(() => (isNew ? parseNewScreenXml(xml) : parseScreenXml(xml)), [xml, isNew]);

  if (!xml) {
    return <div style={styles.emptyState}>Define a screen on the left and generate it to see a live preview here.</div>;
  }
  if (!parsed) {
    return <div style={styles.emptyState}>Couldn't parse this screen's XML.</div>;
  }

  return (
    <div style={styles.root}>
      {parsed.header?.title && (
        <div style={styles.header}>
          <h2 style={styles.headerTitle}>{parsed.header.title}</h2>
          {parsed.header.subtitle && <p style={styles.headerSubtitle}>{parsed.header.subtitle}</p>}
        </div>
      )}
      {isNew ? (
        <QueryEventScreenRenderer xml={parsed} projectId={projectId} screenId={screenId} />
      ) : parsed.auth ? (
        <AuthRenderer xml={parsed} projectId={projectId} />
      ) : parsed.navigation ? (
        <NavigationRenderer xml={parsed} onNavigate={onNavigate} />
      ) : (
        <CrudRenderer xml={parsed} projectId={projectId} />
      )}
    </div>
  );
}

// ============================================================================
// STYLES — plain inline objects, matching this app's existing style approach
// (Dashboard.jsx uses inline styles + CSS var tokens throughout, no CSS-in-JS
// library) so this component drops in without a new dependency.
// ============================================================================

const styles = {
  root: { padding: 20, fontFamily: "inherit", color: "var(--st-text, #1f2937)" },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: 700, margin: 0 },
  headerSubtitle: { fontSize: 13, color: "var(--st-muted, #6b7280)", margin: "4px 0 0" },
  emptyState: { textAlign: "center", color: "var(--st-muted, #6b7280)", fontSize: 13, padding: 60 },
  previewNotice: { fontSize: 12, color: "var(--st-muted, #6b7280)", background: "var(--st-bg, #f9fafb)", border: "1px solid var(--st-border, #e5e7eb)", borderRadius: 6, padding: "8px 12px", marginBottom: 12 },
  error: { fontSize: 13, color: "#dc2626", background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 6, padding: "8px 12px", marginBottom: 12 },
  success: { fontSize: 13, color: "#16a34a", background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 6, padding: "8px 12px", marginBottom: 12 },
  authCard: { maxWidth: 380, margin: "0 auto" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  fieldWrap: { marginBottom: 12 },
  label: { display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4 },
  hint: { fontSize: 11.5, color: "var(--st-muted, #6b7280)", marginTop: 2 },
  primaryBtn: { padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--clr-primary, #6366f1)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { padding: "8px 16px", borderRadius: 6, border: "1px solid var(--st-border, #e5e7eb)", background: "#fff", color: "inherit", fontSize: 13, cursor: "pointer" },
  dangerBtn: { padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--st-danger, #dc2626)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  gridLabel: { fontWeight: 700, fontSize: 13, padding: "10px 12px", borderBottom: "1px solid var(--st-border, #e5e7eb)" },
  linkBtn: { background: "none", border: "none", color: "var(--clr-primary, #6366f1)", cursor: "pointer", fontSize: 12.5, padding: "2px 6px" },
  navGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 },
  navCard: { textAlign: "left", padding: 16, borderRadius: 10, border: "1px solid var(--st-border, #e5e7eb)", background: "#fff", cursor: "pointer" },
  navLabel: { fontWeight: 700, fontSize: 14 },
  navDesc: { fontSize: 12.5, color: "var(--st-muted, #6b7280)", marginTop: 4 },
  crudWrap: { display: "flex", flexDirection: "column", gap: 20 },
  formCard: { border: "1px solid var(--st-border, #e5e7eb)", borderRadius: 10, padding: 16 },
  fieldset: { border: "none", padding: 0, margin: "0 0 12px" },
  legend: { fontWeight: 700, fontSize: 13, marginBottom: 8, padding: 0 },
  btnRow: { display: "flex", gap: 8, marginTop: 8 },
  gridCard: { border: "1px solid var(--st-border, #e5e7eb)", borderRadius: 10, overflow: "hidden" },
  gridToolbar: { display: "flex", gap: 10, alignItems: "center", padding: 10, borderBottom: "1px solid var(--st-border, #e5e7eb)" },
  searchInput: { flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--st-border, #e5e7eb)", fontSize: 13 },
  countBadge: { fontSize: 12, color: "var(--st-muted, #6b7280)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--st-border, #e5e7eb)", cursor: "pointer", userSelect: "none" },
  td: { padding: "8px 12px", borderBottom: "1px solid var(--st-border, #f3f4f6)" },
  emptyCell: { textAlign: "center", padding: 30, color: "var(--st-muted, #6b7280)" },
  hyperlink: { color: "var(--clr-primary, #6366f1)", textDecoration: "none" },
};
