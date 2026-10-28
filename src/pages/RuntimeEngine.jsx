import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import api, { API_ORIGIN } from "../api/client";
import { ERDiagram } from "../components/ERDiagram";
import { useAuth } from "../context/AuthContext";
import {
  Users, UserCog, Building2, Home, Folder, DollarSign, Clock, Palmtree, Warehouse,
  ShoppingCart, Receipt, CreditCard, Shield, Wrench, ClipboardCheck, FileText,
  GraduationCap, BookOpen, HeartPulse, Stethoscope, Lock, NotebookPen, Car, Package, Briefcase,
  Search, ChevronDown, X as XIcon, Download,
} from "lucide-react";

// The second, independent "Runtime Engine" — its own standalone space, NOT nested under any
// project (confirmed with the user: "we need to have a separate space for both"). Lists/creates
// Applications built from the Application/Entity/Relationship/Validation/DataSource/Screen/Action
// vocabulary (see backend-node's src/runtimeEngine/), completely separate from the existing
// Dashboard/project workflow, which this page never touches.

const ELEMENT_TAGS = ["Entity", "Relationship", "Validation", "DataSource", "Screen", "Action", "Theme", "Session", "Auditing", "AutoNumber"];

// GitHub client ids are not secret (only the server-held CLIENT_SECRET is) — safe to read
// client-side the same way VITE_GOOGLE_CLIENT_ID already is for the Studio's own login page.
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || "";

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
    return {
      label: el.getAttribute("label") || bind,
      bind,
      control: el.getAttribute("control"),
      optionsFrom: (el.getAttribute("optionsFrom") || "").replace(/^query:/, "") || null,
      readonly: el.getAttribute("readonly") === "true",
    };
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
  const requiresRoleAttr = root.getAttribute("requiresRole");
  const requiresRole = requiresRoleAttr ? requiresRoleAttr.split(",").map((r) => r.trim()).filter(Boolean) : [];
  return { entity, fields, buttons, grid, requiresRole: requiresRole.length ? requiresRole : null };
}

// Entity field metadata (type/required/enum values) — drives real input controls (date pickers,
// number inputs, enum dropdowns, required markers) instead of treating every field as plain text.
// Same fixed conventions the backend's isAccount Entity must match exactly (see
// applicationModel.ts's assertAccountEntityShape/looksLikeAccountEntity) — kept as literal sets
// here too, deliberately not imported (that module is server-only), same tradeoff as every other
// small duplicated helper in this engine. TWO shapes, same dual-shape reasoning as the backend:
// LEGACY (username-based) is what already-generated apps still use; CURRENT (email-based) is what
// every app generates from now on (email identity, OTP verification, OAuth sign-in).
const LEGACY_ACCOUNT_FIELD_NAMES = new Set(["id", "username", "passwordHash", "mustChangePassword"]);
const CURRENT_ACCOUNT_FIELD_NAMES = new Set([
  "id", "email", "passwordHash", "mustChangePassword", "firstName", "lastName", "dob", "emailVerified", "authProvider",
]);

function parseEntityForRun(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  const fields = Array.from(root.querySelectorAll("Field")).map((f) => ({
    name: f.getAttribute("name"),
    type: f.getAttribute("type") || "string",
    key: f.getAttribute("key") === "true",
    required: f.getAttribute("required") === "true",
    values: Array.from(f.querySelectorAll("Value")).map((v) => v.textContent.trim()).filter(Boolean),
  }));
  // Defense in depth, same reasoning as applicationModel.ts's parseEntityElement: the AI
  // sometimes forgets isAccount="true" even when it gets the User entity's field shape exactly
  // right — an Entity literally named "User" with exactly one of the two known-good field sets IS
  // the account entity, attribute or not, so login/signup never silently breaks over a missed
  // attribute.
  const name = root.getAttribute("name") || "";
  const fieldNames = fields.map((f) => f.name);
  const matchesShape = (shape) => fieldNames.length === shape.size && fieldNames.every((n) => shape.has(n));
  const looksLikeAccount = name === "User" && (matchesShape(LEGACY_ACCOUNT_FIELD_NAMES) || matchesShape(CURRENT_ACCOUNT_FIELD_NAMES));
  return {
    fields, isAccount: root.getAttribute("isAccount") === "true" || looksLikeAccount, icon: root.getAttribute("icon") || null,
    // Whether this account entity supports email/OTP/OAuth (the current shape) vs the older,
    // plain username/password convention — drives whether the Run panel shows the OAuth buttons
    // and the VerifyEmail/ForgotPassword/ResetPassword screens at all.
    hasEmailIdentity: fieldNames.includes("email"),
  };
}

function parseRelationshipForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  return { fromEntity: el.getAttribute("fromEntity"), fromField: el.getAttribute("fromField"), toEntity: el.getAttribute("toEntity") };
}

function parseDataSourceForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  const selectEl = el.querySelector("Select");
  return { entity: selectEl?.getAttribute("entity") || null };
}

// Minimal client-side extraction of a Validation/Action element's own entity binding + a short
// human-readable summary — same spirit as parseScreenForRun above, just enough for the ER Map's
// "every node, and what it's connected to" tables, not a full typed model (that's applicationModel.ts's
// job, server-only).
function parseValidationForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  const conditionEl = el.querySelector("Condition");
  const messageEl = el.querySelector("Message");
  return {
    id: el.getAttribute("id") || "",
    entity: el.getAttribute("entity"),
    when: el.getAttribute("when") || "onSave",
    onViolation: el.getAttribute("onViolation") || "reject",
    test: conditionEl?.getAttribute("test") || "",
    message: messageEl ? messageEl.textContent.trim() : "",
  };
}

function parseActionForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  const steps = Array.from(el.querySelectorAll("Steps > *")).map((s) => {
    if (s.tagName === "Set") return `Set ${s.getAttribute("field")} = ${s.getAttribute("value")}`;
    if (s.tagName === "Save") return "Save";
    if (s.tagName === "Notify") return `Notify ${s.getAttribute("to")}`;
    return s.tagName;
  });
  return { entity: el.getAttribute("entity"), steps };
}

function humanize(name) {
  return (name || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function initialsFor(name) {
  const parts = (name || "").trim().split(/[\s._@]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function displayNameFor(identity) {
  if (!identity) return "there";
  const base = identity.includes("@") ? identity.split("@")[0] : identity;
  return base.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Real line-icons (lucide-react), not emoji — a module's icon is resolved in two steps, the same
// "declared value, then structural fallback" pattern already used for isAccount detection:
//   1. The generating AI can name an icon directly via <Entity icon="...">, chosen from this same
//      whitelist (see aiService.ts's prompt) — lets a genuinely novel entity (something the keyword
//      rules below were never written for) still get a sensible icon instead of the generic one.
//   2. Failing that, keyword-matched against the entity name, checked in order, first match wins.
//   3. "file-text" as the last-resort generic fallback.
const ICON_COMPONENTS = {
  users: Users, "user-cog": UserCog, building: Building2, home: Home, folder: Folder,
  "dollar-sign": DollarSign, clock: Clock, "palm-tree": Palmtree, warehouse: Warehouse,
  "shopping-cart": ShoppingCart, receipt: Receipt, "credit-card": CreditCard, shield: Shield,
  wrench: Wrench, "clipboard-check": ClipboardCheck, "file-text": FileText,
  "graduation-cap": GraduationCap, "book-open": BookOpen, "heart-pulse": HeartPulse,
  stethoscope: Stethoscope, lock: Lock, notebook: NotebookPen, car: Car, package: Package,
  briefcase: Briefcase,
};
const MODULE_ICON_RULES = [
  [/employee|staff/i, "users"], [/designation|position/i, "briefcase"],
  [/department|branch|office\b/i, "building"], [/property|^unit\b/i, "home"],
  [/lease|contract/i, "file-text"], [/tenant|customer|client/i, "user-cog"],
  [/vendor|supplier/i, "warehouse"], [/project/i, "folder"],
  [/payroll|salary/i, "dollar-sign"], [/attendance|timesheet|hours/i, "clock"],
  [/leave|holiday/i, "palm-tree"], [/purchase|procurement|^order\b/i, "shopping-cart"],
  [/invoice|bill\b/i, "receipt"], [/payment/i, "credit-card"],
  [/claim|insurance|policy/i, "shield"], [/maintenance|repair/i, "wrench"],
  [/inspection|audit/i, "clipboard-check"], [/document/i, "file-text"],
  [/student/i, "graduation-cap"], [/course|class|subject|training/i, "book-open"],
  [/exam/i, "clipboard-check"], [/patient/i, "heart-pulse"], [/doctor/i, "stethoscope"],
  [/role|access|permission/i, "lock"], [/^user|account/i, "user-cog"],
  [/note|task|todo|announcement/i, "notebook"], [/vehicle|^car\b/i, "car"],
  [/inventory|stock|product|asset/i, "package"],
];
function iconNameForEntity(entityName, explicitIcon) {
  if (explicitIcon && ICON_COMPONENTS[explicitIcon]) return explicitIcon;
  for (const [re, name] of MODULE_ICON_RULES) if (re.test(entityName || "")) return name;
  return "file-text";
}
function ModuleIcon({ entity, icon, size = 17, style }) {
  const Cmp = ICON_COMPONENTS[iconNameForEntity(entity, icon)];
  return <Cmp size={size} strokeWidth={1.75} style={style} />;
}

// Same keyword-matched approach as the icon rules, grouping modules into a left-nav section
// header (screenshot reference: "PEOPLE" / "TIME" / "PROJECTS") instead of one flat list — checked
// in order, first match wins, with "General" as the catch-all for anything unmatched.
const MODULE_GROUP_RULES = [
  [/employee|staff|designation|^user|account|role|access/i, "People"],
  [/department|organization|branch|office/i, "Organization"],
  [/attendance|leave|holiday|timesheet|punch|shift/i, "Time"],
  [/project|assignment|task|milestone/i, "Projects"],
  [/payroll|salary|reimbursement|expense|invoice|bill|payment|budget|claim/i, "Finance"],
  [/purchase|vendor|supplier|procurement|order|asset|inventory|stock|product/i, "Operations"],
  [/training|course|class|subject|exam|enrollment/i, "Learning"],
  [/announcement|document|policy|note/i, "Workspace"],
];
function groupForEntity(entityName) {
  for (const [re, group] of MODULE_GROUP_RULES) if (re.test(entityName || "")) return group;
  return "General";
}

const AUTH_SCREEN_NAMES = new Set(["Login", "Signup", "ChangePassword", "VerifyEmail", "ForgotPassword", "ResetPassword"]);
// Reachable before any session exists (from a "Forgot password?" link on Login, or right after a
// successful register), but — unlike Login/Signup — they don't get the tab switcher, just a plain
// "← Back to Login" so there's always a way out.
const PRE_LOGIN_AUX_SCREENS = new Set(["VerifyEmail", "ForgotPassword", "ResetPassword"]);

// A small, reusable "every node of this type, and which Entity it's connected to" table — used by
// the ER Map's Validations/Screens/Actions/DataSources sections below the schema table, so the
// graph's non-Entity nodes (and their FOR_ENTITY connection) are visible from inside the Studio
// instead of only in Neo4j Browser.
function ElementTable({ title, columns, rows, emptyLabel }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--st-muted)" }}>{emptyLabel}</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.05)" }}>
              {columns.map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--st-border)" }}>
                {row.map((cell, j) => <td key={j} style={{ padding: "6px 10px" }}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// A real searchable lookup picker for any FK/dropdown field, universal across every generated
// app (driven purely by the optionsFrom/DataSource data every app already has — no per-app XML
// change needed). Replaces a plain <select>, which is fine for a handful of rows but unusable
// once the related entity (Employee, Vendor, ...) has hundreds — type to filter, click to pick.
function LookupPicker({ value, options, disabled, theme, placeholder, onChange, inputStyle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const loading = options === "loading";
  const list = Array.isArray(options) ? options : [];
  const selected = list.find((o) => String(o.value) === String(value));
  const q = query.trim().toLowerCase();
  const filtered = q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        style={{
          ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          cursor: disabled || loading ? "default" : "pointer", textAlign: "left", font: "inherit",
          color: selected ? inputStyle.color : "#9ca3af",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {loading ? "Loading…" : selected ? selected.label : (placeholder || "— Select —")}
        </span>
        {!disabled && !loading && <ChevronDown size={15} style={{ flexShrink: 0, color: "#9ca3af" }} />}
      </button>
      {open && !disabled && !loading && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            background: "#fff", border: `1px solid ${theme.accent}55`, borderRadius: `${theme.cornerRadius}px`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderBottom: "1px solid #e5e7eb" }}>
            <Search size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              style={{ flex: 1, border: "none", outline: "none", font: "inherit", fontSize: "0.9em" }}
            />
            {value !== "" && value != null && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                title="Clear"
                style={{ border: "none", background: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}
              >
                <XIcon size={14} />
              </button>
            )}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: "0.85em", color: "#9ca3af" }}>No matches.</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{
                    padding: "7px 12px", fontSize: "0.9em", cursor: "pointer",
                    background: String(o.value) === String(value) ? `${theme.accent}14` : "transparent",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${theme.accent}22`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = String(o.value) === String(value) ? `${theme.accent}14` : "transparent"; }}
                >
                  {o.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// What a real running app's left nav actually is: one entry per ENTITY (grouped by what the
// screens are about), not a raw list of every Screen element's own XML name — "I have to click
// one screen name, enter detail, come back out" is the tag-browsing/inspection view, not this.
// Each module's primary screen is its Grid (browse) screen when one exists, since that's the
// natural "home" for an entity; an entity with only a form (no browse) uses that form directly.
// role is the current session's resolved AccessRole name (null for an app with no RBAC, or before
// a role-gated app finishes logging in) — a module whose primary screen declares requiresRole and
// doesn't include this role is left out of the array ENTIRELY, not just hidden in the nav, so
// loadModuleCounts never fetches its /rows endpoint for a user who shouldn't see it at all.
function buildAppModules(detail, role = null) {
  if (!detail) return [];
  const screens = detail.elements.filter((e) => e.tag === "Screen" && !AUTH_SCREEN_NAMES.has(e.name));
  const parsedByName = new Map(screens.map((el) => [el.name, { el, parsed: parseScreenForRun(el.xml) }]));
  const modules = [];
  const seen = new Set();
  for (const el of screens) {
    const entityName = parsedByName.get(el.name).parsed.entity;
    if (!entityName || seen.has(entityName)) continue;
    seen.add(entityName);
    const gridEntry = [...parsedByName.values()].find((e) => e.parsed.entity === entityName && e.parsed.grid);
    const primaryRequiresRole = (gridEntry || parsedByName.get(el.name)).parsed.requiresRole;
    if (primaryRequiresRole && (!role || !primaryRequiresRole.includes(role))) continue;
    // The form screen for creating/editing a row of this entity — preferred via the grid's own
    // rowClick target (the AI always wires these together), falling back to any other form
    // screen bound to the same entity, so "+ New" has somewhere real to go even without a grid.
    const formEntry = (gridEntry && [...parsedByName.values()].find((e) => e.el.name === gridEntry.parsed.grid?.rowClick?.targetScreen))
      || [...parsedByName.values()].find((e) => e.parsed.entity === entityName && !e.parsed.grid);
    // The entity's own declared icon (if the AI set one), read straight off its <Entity> element —
    // ModuleIcon falls back to the keyword rules itself when this is null.
    const entityEl = detail.elements.find((e) => e.tag === "Entity" && e.name === entityName);
    modules.push({
      key: entityName, label: humanize(entityName), group: groupForEntity(entityName),
      icon: entityEl ? parseEntityForRun(entityEl.xml).icon : null,
      screenEl: (gridEntry || parsedByName.get(el.name)).el,
      formScreenEl: formEntry?.el || null,
    });
  }
  return modules;
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

// Client-side file save — a Blob + temporary <a download>, the same pattern this engine's own
// generated apps use for CSV export (see aiService.ts's prompt) — no server round-trip needed
// since buildFullXml already has everything.
function downloadTextFile(filename, contents, mimeType = "application/xml") {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A safe, readable filename from the application's own name — strips anything that isn't
// alphanumeric/space/dash/underscore so it never produces an invalid filename on any OS.
function xmlFilenameFor(name) {
  const safe = (name || "application").trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-") || "application";
  return `${safe}.xml`;
}

// Converts this Application's Entity/Relationship elements into the SAME {tables:[{name,
// columns:[{name,type,pk,fk}]}]} shape ERDiagram.jsx/erDiagram.js already render for the (now
// retired) old engine's schema view — zero changes needed to either, just a new source shape.
function applicationToErTables(detail) {
  const entityEls = detail.elements.filter((e) => e.tag === "Entity");
  const relationships = detail.elements.filter((e) => e.tag === "Relationship").map((e) => parseRelationshipForRunFull(e.xml));
  const tables = entityEls.map((el) => {
    const { fields } = parseEntityForRun(el.xml);
    const columns = fields.map((f) => {
      const rel = relationships.find((r) => r.fromEntity === el.name && r.fromField === f.name);
      return { name: f.name, type: f.type, pk: f.key, fk: rel ? `${rel.toEntity}.${rel.toField}` : null };
    });
    return { name: el.name, columns };
  });
  return { tables };
}

// parseRelationshipForRun (above) drops toField since nothing needed it until now — a separate
// small parser here rather than widening that one's return shape for every other caller.
function parseRelationshipForRunFull(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  return {
    fromEntity: el.getAttribute("fromEntity"), fromField: el.getAttribute("fromField"),
    toEntity: el.getAttribute("toEntity"), toField: el.getAttribute("toField"),
  };
}

// A persistent, theme-colored title band above a running Screen — logo (or a monogram fallback)
// + the Application's own name, so a running app reads as "a real app with a shell" rather than
// a bare panel floating inside the Studio's own chrome. Carries theme.primary, same as every
// other primary-colored surface in the Run panel.
function AppBar({ theme, appName }) {
  return (
    <div style={{ background: theme.primary, padding: "10px 18px", display: "flex", alignItems: "center", gap: 10 }}>
      {theme.logo ? (
        <img src={theme.logo} alt="" style={{ height: 24, display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
      ) : (
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>
          {(appName || "?").charAt(0).toUpperCase()}
        </div>
      )}
      <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.05em", fontFamily: theme.fontFamily }}>{appName}</div>
    </div>
  );
}

export default function RuntimeEngine() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState("");

  // Creation is name-only now — "ask for project name... when user clicks on it asks for the
  // description" — the description step itself lives in the detail view's "Describe" panel below,
  // not this modal, since the same flow is reused later to add MORE to an existing application.
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTag, setActiveTag] = useState("Entity");
  const [activeElement, setActiveElement] = useState(null); // { tag, name, xml }
  const [showFullXml, setShowFullXml] = useState(false);
  const [showErMap, setShowErMap] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditEvents, setAuditEvents] = useState(null);

  // The "Describe your application" panel — works identically for a brand-new, empty application
  // and for adding more to an existing one later (one entity now, more later; screens now or
  // later): generate always sends the CURRENT full xml as existingXml, so the AI reworks it in
  // place rather than starting over, then an explicit "Apply" persists it via PUT.
  const [genDescription, setGenDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [pendingXml, setPendingXml] = useState(null); // generated, not yet applied
  const [applying, setApplying] = useState(false);
  const [showDescribePanel, setShowDescribePanel] = useState(false);

  const [runFieldValues, setRunFieldValues] = useState({});
  const [runMessages, setRunMessages] = useState([]);
  const [running, setRunning] = useState(false);
  const [gridRows, setGridRows] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [gridSort, setGridSort] = useState({ bind: null, dir: "asc" });
  const [optionsCache, setOptionsCache] = useState({}); // dsName -> "loading" | [{value,label}]
  const [successMessage, setSuccessMessage] = useState("");
  const [uploadingFields, setUploadingFields] = useState({}); // field bind -> true while its picture is uploading

  // Real per-application end-user accounts (see backend-node's runtimeEngine/appAuth.ts) — only
  // relevant for an Application with a real isAccount Entity; every other Application behaves
  // exactly as before (no gate at all). loggedIn/loggedInIdentity are this tab's own belief about
  // the (httpOnly, unreadable-from-JS) session cookie — reset whenever a different application is
  // selected, since each application's session is independent.
  const [loggedIn, setLoggedIn] = useState(false);
  const [loggedInIdentity, setLoggedInIdentity] = useState(null);
  // RBAC — the resolved AccessRole name from the session's login response (see
  // applicationEngine.ts's runLogin), or null for an app that doesn't use the optional roleId
  // convention. Drives which modules buildAppModules even includes, not just which nav entries are
  // visually hidden — a role-restricted module's /rows endpoint should never be called at all for
  // a user who shouldn't see it, and the backend's requiresRole check is the real enforcement
  // either way (this is purely so a disallowed user doesn't see the module at all).
  const [loggedInRole, setLoggedInRole] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [restoringKey, setRestoringKey] = useState(null);

  // Full-screen "use the real app" mode — a proper left nav grouped by entity (buildAppModules),
  // not the Studio's raw per-tag element browser. Entered automatically once an application has
  // real content, since opening a project should show the app, not its schema.
  const [runMode, setRunMode] = useState(false);
  const [moduleCounts, setModuleCounts] = useState({}); // entityName -> "loading" | number, for the Dashboard's stat cards
  // "Something's not working — fix it" without leaving Run mode: reuses the exact same
  // describe/rework/apply pipeline as the Studio's own Describe panel (genDescription,
  // handleGenerate, pendingXml, handleApplyDescription) — just a different entry point, so a
  // problem noticed while actually using the app doesn't require exiting to the Studio first.
  const [showFixModal, setShowFixModal] = useState(false);
  // Pure presentation state for the enterprise-styled shell (sidebar collapse, the nav's own
  // live filter box, the notification bell's dropdown) — none of it round-trips to the server.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);

  function loadApplications() {
    return api.get("/runtime-applications").then((res) => setApplications(res.data)).catch(() => setError("Failed to load applications."));
  }

  useEffect(() => { loadApplications(); }, []);

  function closeNewModal() {
    setShowNewModal(false); setNewName(""); setCreateError("");
  }

  function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError("");
    api.post("/runtime-applications", { name: newName })
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
    setShowErMap(false);
    setShowAuditLog(false);
    setAuditEvents(null);
    setShowDescribePanel(false);
    setGenDescription(""); setGenError(""); setPendingXml(null);
    setLoggedIn(false); setLoggedInIdentity(null); setLoggedInRole(null); setMustChangePassword(false);
    setRunMode(false);
    setDetailLoading(true);
    api.get(`/runtime-applications/${id}`)
      .then((res) => {
        setDetail(res.data);
        setActiveTag("Entity");
        enterAppOrDescribe(res.data);
      })
      .catch(() => setError("Failed to load that application's details."))
      .finally(() => setDetailLoading(false));
  }

  // Opening a project should show the real app, not its schema — land straight in full-screen
  // Run mode (gated into Login first if the app has real accounts), falling back to the
  // Describe panel only for a genuinely empty, freshly-created application.
  function enterAppOrDescribe(d) {
    if (d.elements.length === 0) {
      setShowDescribePanel(true);
      return;
    }
    const loginEl = findAccountEntityEl(d) && d.elements.find((e) => e.tag === "Screen" && e.name === "Login");
    if (loginEl) {
      setRunMode(true);
      openElement(loginEl);
      return;
    }
    const modules = buildAppModules(d);
    if (modules.length > 0) {
      setRunMode(true);
      setActiveElement(null); // land on the Dashboard overview first, not straight into one module
      loadModuleCounts(d.id, modules);
    }
  }

  // Record counts for the Dashboard's stat cards — one small request per module's entity, fired
  // in parallel; each card updates independently as its own count arrives.
  function loadModuleCounts(appId, modules) {
    setModuleCounts(Object.fromEntries(modules.map((m) => [m.key, "loading"])));
    modules.forEach((m) => {
      api.get(`/runtime-applications/${appId}/entities/${m.key}/rows`)
        .then((res) => setModuleCounts((c) => ({ ...c, [m.key]: res.data.rows.length })))
        .catch(() => setModuleCounts((c) => ({ ...c, [m.key]: null })));
    });
  }

  // Owner-only read-back of the security/audit log (see auditLog.ts) — logins, registrations,
  // deletes, restores, and RBAC denials for this application.
  function loadAuditLog() {
    setAuditEvents(null);
    api.get(`/runtime-applications/${selectedId}/audit-log`)
      .then((res) => setAuditEvents(res.data.events))
      .catch(() => setAuditEvents([]));
  }

  // Deep-link from the Dashboard's project grid (/runtime-engine?id=123) straight into that
  // application's detail view, same as clicking its card here would.
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (idParam) selectApplication(Number(idParam));
  }, [searchParams]);

  // Finds the one Entity marked isAccount="true" (always "User" by convention) — present only on
  // applications with real end-user accounts.
  function findAccountEntityEl(d) {
    return d?.elements.find((e) => e.tag === "Entity" && parseEntityForRun(e.xml).isAccount) || null;
  }

  function handleGenerate() {
    if (!genDescription.trim()) return;
    setGenerating(true);
    setGenError("");
    setPendingXml(null);
    const existingXml = detail && detail.elements.length > 0 ? buildFullXml(detail) : undefined;
    api.post("/runtime-applications/generate", { description: genDescription, existingXml })
      .then((res) => setPendingXml(res.data.xml))
      .catch((e) => setGenError(e.response?.data?.message || e.response?.data?.detail || "Failed to generate — try rephrasing the description."))
      .finally(() => setGenerating(false));
  }

  function handleApplyDescription() {
    if (!pendingXml || !selectedId) return;
    setApplying(true);
    setGenError("");
    // Matches handleGenerate's own choice: an application that already had content got a
    // targeted FRAGMENT back (see generateApplicationFixXml) and must be merged in with PATCH,
    // never replaced wholesale with PUT — that full-replace path is only ever correct for the
    // brand-new, empty-application case this same condition already distinguishes.
    const isFix = detail && detail.elements.length > 0;
    const request = isFix
      ? api.patch(`/runtime-applications/${selectedId}`, { xml: pendingXml })
      : api.put(`/runtime-applications/${selectedId}`, { xml: pendingXml });
    request
      .then(() => {
        setGenDescription(""); setPendingXml(null); setShowDescribePanel(false); setShowFixModal(false);
        return api.get(`/runtime-applications/${selectedId}`).then((res) => {
          setDetail(res.data);
          setActiveTag("Entity");
          if (!loggedIn) {
            enterAppOrDescribe(res.data);
          } else if (runMode) {
            // Already using the app (fixed something via the in-Run-mode modal below) — refresh
            // the Dashboard's counts and land there, without re-triggering the login gate.
            setActiveElement(null);
            loadModuleCounts(selectedId, buildAppModules(res.data, loggedInRole));
          }
        });
      })
      .catch((e) => setGenError(e.response?.data?.message || e.response?.data?.detail || "Failed to apply — try again."))
      .finally(() => setApplying(false));
  }

  function handleLogout() {
    if (!selectedId) return;
    setLoggingOut(true);
    api.post(`/runtime-applications/${selectedId}/auth/logout`)
      .finally(() => {
        setLoggingOut(false);
        setLoggedIn(false); setLoggedInIdentity(null); setLoggedInRole(null); setMustChangePassword(false);
        setActiveElement(null);
      });
  }

  // Uploads one picture for a type="image" field — stores just the returned URL as that field's
  // value, same as any other field; the actual bytes live on disk (see runtimeEngine/uploads.ts),
  // never in runFieldValues itself.
  function handleImageUpload(bind, file) {
    if (!file || !selectedId) return;
    setUploadingFields((u) => ({ ...u, [bind]: true }));
    const formData = new FormData();
    formData.append("file", file);
    api.post(`/runtime-applications/${selectedId}/uploads`, formData)
      .then((res) => setRunFieldValues((cur) => ({ ...cur, [bind]: res.data.url })))
      .catch((e) => setError(e.response?.data?.message || e.response?.data?.detail || "Image upload failed."))
      .finally(() => setUploadingFields((u) => ({ ...u, [bind]: false })));
  }

  function deleteApplication(id) {
    if (!window.confirm("Delete this application? This can't be undone.")) return;
    api.delete(`/runtime-applications/${id}`)
      .then(() => { if (selectedId === id) { setSelectedId(null); setDetail(null); } return loadApplications(); })
      .catch(() => setError("Failed to delete this application."));
  }

  // The list card only carries a summary (elementCounts), not the full XML — reuse the already-
  // loaded detail when this IS the open application, otherwise fetch it fresh just for the
  // download, so grabbing an app's XML never requires opening it first.
  function downloadApplicationXml(app) {
    if (selectedId === app.id && detail) {
      downloadTextFile(xmlFilenameFor(detail.name), buildFullXml(detail));
      return;
    }
    api.get(`/runtime-applications/${app.id}`)
      .then((res) => downloadTextFile(xmlFilenameFor(res.data.name), buildFullXml(res.data)))
      .catch(() => setError("Failed to download this application's XML."));
  }

  function loadGridRows(entityName, includeDeleted) {
    setGridLoading(true);
    api.get(`/runtime-applications/${selectedId}/entities/${entityName}/rows`, { params: includeDeleted ? { includeDeleted: "true" } : {} })
      .then((res) => setGridRows(res.data.rows))
      .catch(() => { setGridRows([]); setError("Failed to load this entity's rows."); })
      .finally(() => setGridLoading(false));
  }

  function restoreGridRow(entityName, row, keyField) {
    const key = row[keyField];
    setRestoringKey(key);
    api.post(`/runtime-applications/${selectedId}/entities/${entityName}/rows/${encodeURIComponent(key)}/restore`)
      .then(() => loadGridRows(entityName, showDeleted))
      .catch((e) => setError(e.response?.data?.message || e.response?.data?.detail || "Failed to restore this record."))
      .finally(() => setRestoringKey(null));
  }

  // Fetches+caches a DataSource's compiled rows as {value,label} options (see the new backend
  // route) — reused for both a form field's real dropdown AND a grid column's FK display, since
  // both just need "given this id, what's the human-readable label" for the SAME related entity.
  function ensureDataSourceOptions(dsName) {
    if (!dsName || !selectedId || optionsCache[dsName]) return;
    setOptionsCache((c) => ({ ...c, [dsName]: "loading" }));
    api.get(`/runtime-applications/${selectedId}/datasources/${dsName}/options`)
      .then((res) => setOptionsCache((c) => ({ ...c, [dsName]: res.data.options })))
      .catch(() => setOptionsCache((c) => ({ ...c, [dsName]: [] })));
  }

  // Finds the DataSource (if any) whose <Select entity="..."> matches a given entity — the same
  // DataSource the AI already generated for a dropdown Field pointing at that entity, reused here
  // to resolve a Grid's raw FK id columns into readable labels too.
  function dataSourceForEntity(entityName) {
    const dsEl = detail?.elements.find((e) => e.tag === "DataSource" && parseDataSourceForRun(e.xml).entity === entityName);
    return dsEl?.name || null;
  }

  function fkColumnsForGrid(gridEntityName, columns) {
    if (!detail) return {};
    const rels = detail.elements.filter((e) => e.tag === "Relationship").map((e) => parseRelationshipForRun(e.xml));
    const map = {};
    for (const col of columns) {
      const rel = rels.find((r) => r.fromEntity === gridEntityName && r.fromField === col.bind);
      const ds = rel && dataSourceForEntity(rel.toEntity);
      if (ds) map[col.bind] = ds;
    }
    return map;
  }

  // Opens a Screen element — a Grid screen immediately fetches its entity's real rows (a browse
  // view); a form screen starts blank unless prefill is given (editing an existing row, via a
  // Grid's rowClick). Also pre-fetches whatever dropdown/FK-display DataSources the screen needs,
  // so selects and resolved FK labels are ready by the time the rows/fields render.
  function openElement(el, prefill) {
    setActiveElement(el);
    setRunFieldValues(prefill || {});
    setRunMessages([]);
    setSuccessMessage("");
    setGridRows(null);
    setGridSearch("");
    setGridSort({ bind: null, dir: "asc" });
    setShowDeleted(false);
    const parsed = el.tag === "Screen" ? parseScreenForRun(el.xml) : null;
    if (parsed?.grid?.entity) {
      loadGridRows(parsed.grid.entity);
      Object.values(fkColumnsForGrid(parsed.grid.entity, parsed.grid.columns)).forEach(ensureDataSourceOptions);
    }
    if (parsed?.fields) {
      parsed.fields.forEach((f) => { if (f.control === "dropdown" && f.optionsFrom) ensureDataSourceOptions(f.optionsFrom); });
    }
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
    setSuccessMessage("");
    return api.post(`/runtime-applications/${selectedId}/screens/${activeElement.name}/run`, {
      elementId: action, action, fieldValues,
    })
      .then((res) => {
        const resultActions = res.data.actions || [];
        setRunMessages(resultActions);
        // Required, not optional polish: a ConcurrencyError/ValidationError still comes back as an
        // HTTP 200 with an error/conflict-shaped message buried in actions — without this guard, a
        // save that actually failed would show a green "Saved successfully." banner stacked on top
        // of the red/amber one explaining why it didn't.
        const hasProblem = resultActions.some((a) => a.type === "message" && (a.messageType === "error" || a.messageType === "conflict"));
        if (!hasProblem) {
          if (action === "save") setSuccessMessage("Saved successfully.");
          else if (action === "delete") setSuccessMessage("Deleted — restore it from “Show deleted” if needed.");
        }
        // login/changePassword/verifyEmail/OAuth signal a new session this way (see
        // applicationEngine.ts) — the cookie itself is already set server-side by the time this
        // response arrives.
        const session = resultActions.find((a) => a.type === "session");
        if (session) {
          setLoggedIn(true);
          setLoggedInIdentity(session.identity);
          setLoggedInRole(session.role ?? null);
          setMustChangePassword(session.mustChangePassword);
          if (session.mustChangePassword) {
            const cpEl = detail?.elements.find((e) => e.tag === "Screen" && e.name === "ChangePassword");
            if (cpEl) openElement(cpEl);
          } else {
            setActiveElement(null); // back to the normal app view
          }
        } else if (action === "register" && !hasProblem) {
          // A current-shape (email-based) registration succeeds WITHOUT a session — the account
          // is unverified until the emailed OTP is confirmed (see applicationEngine.ts's
          // runRegister). Carry the submitted email straight into VerifyEmail so the user doesn't
          // have to retype it.
          const veEl = detail?.elements.find((e) => e.tag === "Screen" && e.name === "VerifyEmail");
          if (veEl) openElement(veEl, { email: fieldValues.email });
        }
        return resultActions;
      })
      .catch((e) => {
        const value = e.response?.data?.message || e.response?.data?.detail || "Run failed.";
        setRunMessages([{ type: "message", messageType: "error", value }]);
        return [];
      })
      .finally(() => setRunning(false));
  }

  // GitHub's OAuth flow is a real redirect (unlike Google's in-page credential popup) — the
  // browser leaves this page entirely and comes back with ?code=&state= in the URL. state carries
  // the applicationId (see handleGithubOAuthClick below) so this only fires for the app that's
  // actually open, and the ref guards against firing twice (React 18 double-invokes effects in
  // dev) or replaying the same code again on a later re-render. Defined after runAction, not
  // before, so the closure always captures the current function rather than a stale reference.
  const githubCallbackHandledRef = useRef(false);
  useEffect(() => {
    if (githubCallbackHandledRef.current || !detail || !activeElement) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state || Number(state) !== selectedId) return;
    githubCallbackHandledRef.current = true;
    const redirectUri = `${window.location.origin}${window.location.pathname}?id=${selectedId}`;
    // Deliberate exception: this effect IS "subscribing to an external system" (the browser just
    // came back from a real OAuth redirect) and calling setState in response to that external
    // signal — exactly the documented exception to this rule, not a render-triggered side effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runAction("githubLogin", { code, redirectUri }).finally(() => {
      params.delete("code");
      params.delete("state");
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    });
  }, [detail, activeElement, selectedId]);

  // GitHub has no in-page credential flow like Google's — this sends the browser away to GitHub's
  // own authorize page; the matching useEffect above picks the user back up on return. state
  // carries the applicationId so the callback effect only acts on the app that's actually open.
  function handleGithubOAuthClick() {
    const redirectUri = `${window.location.origin}${window.location.pathname}?id=${selectedId}`;
    const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("user:email")}&state=${selectedId}`;
    window.location.href = url;
  }

  // Deletes straight from the grid row, using the CURRENT (Grid) screen's own entity binding —
  // the "delete" built-in only needs screen.entity, so there's no need to navigate to the form
  // screen first just to remove a record.
  function deleteGridRow(row, keyField) {
    if (!window.confirm("Delete this record? You can restore it later from “Show deleted”.")) return;
    runAction("delete", { [keyField]: row[keyField] }).then(() => {
      const parsed = parseScreenForRun(activeElement.xml);
      if (parsed?.grid?.entity) loadGridRows(parsed.grid.entity, showDeleted);
    });
  }

  const elementsByTag = detail ? detail.elements.filter((e) => e.tag === activeTag) : [];
  const screenForRun = activeElement?.tag === "Screen" ? parseScreenForRun(activeElement.xml) : null;
  const screenEntityDef = screenForRun?.entity ? detail?.elements.find((e) => e.tag === "Entity" && e.name === screenForRun.entity) : null;
  const screenEntityFields = screenEntityDef ? parseEntityForRun(screenEntityDef.xml).fields : [];
  const screenKeyField = screenEntityFields.find((f) => f.key)?.name || "id";

  // The "Reload latest" action on a conflict banner (see runAction's "conflict" messageType,
  // emitted when entityStore.ts's ConcurrencyError fires) — re-fetches exactly the one record that
  // just failed to save and resets the form to it, discarding the user's local edits along with
  // the stale __version that caused the conflict in the first place. Defined down here, after
  // screenForRun/screenKeyField, rather than up with the other action functions, so it doesn't
  // close over them before they're declared.
  function reloadLatestRow() {
    if (!activeElement || !screenForRun?.entity) return;
    const key = runFieldValues[screenKeyField];
    if (!key) return;
    api.get(`/runtime-applications/${selectedId}/entities/${screenForRun.entity}/rows/${encodeURIComponent(key)}`)
      .then((res) => openElement(activeElement, res.data.row))
      .catch((e) => setError(e.response?.data?.message || e.response?.data?.detail || "Failed to reload this record."));
  }

  const themeEl = detail?.elements.find((e) => e.tag === "Theme");
  const theme = parseThemeForRun(themeEl?.xml);
  const fkColumnMap = screenForRun?.grid ? fkColumnsForGrid(screenForRun.grid.entity, screenForRun.grid.columns) : {};
  const accountEntityEl = findAccountEntityEl(detail);
  // The Login/ChangePassword gate itself is opened at the two moments it can actually change
  // (selectApplication's load, and runAction's login/changePassword result) rather than via an
  // effect watching derived state — see those two functions.
  const needsLoginGate = !!accountEntityEl && !loggedIn;
  // Whether this app's account entity uses the current (email/OTP/OAuth) convention vs the older
  // plain username/password one — drives whether the Login/Signup screens show the OAuth buttons
  // and the "Forgot password?" link at all (an older app renders exactly as it always has).
  const accountHasEmailIdentity = !!accountEntityEl && parseEntityForRun(accountEntityEl.xml).hasEmailIdentity;

  function optionLabel(dsName, value) {
    const opts = optionsCache[dsName];
    if (!Array.isArray(opts)) return null;
    return opts.find((o) => String(o.value) === String(value))?.label ?? null;
  }

  const visibleGridRows = (() => {
    if (!gridRows) return gridRows;
    let rows = gridRows;
    if (gridSearch.trim()) {
      const q = gridSearch.trim().toLowerCase();
      rows = rows.filter((row) =>
        (screenForRun?.grid.columns || []).some((c) => {
          const raw = fkColumnMap[c.bind] ? optionLabel(fkColumnMap[c.bind], row[c.bind]) ?? row[c.bind] : row[c.bind];
          return String(raw ?? "").toLowerCase().includes(q);
        })
      );
    }
    if (gridSort.bind) {
      const { bind, dir } = gridSort;
      rows = [...rows].sort((a, b) => {
        const av = fkColumnMap[bind] ? optionLabel(fkColumnMap[bind], a[bind]) ?? a[bind] : a[bind];
        const bv = fkColumnMap[bind] ? optionLabel(fkColumnMap[bind], b[bind]) ?? b[bind] : b[bind];
        const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  })();

  function toggleSort(bind) {
    setGridSort((s) => (s.bind === bind ? { bind, dir: s.dir === "asc" ? "desc" : "asc" } : { bind, dir: "asc" }));
  }

  // Renders whatever Screen is currently open — shared between the Studio's own per-tag element
  // browser AND the full-screen Run mode below, so there's exactly one implementation of "what a
  // Grid/Form screen looks like." embedded=true (Run mode) suppresses the per-screen AppBar/Back
  // row, since Run mode already has its own persistent top bar and left nav doing that job.
  function renderGridScreen(embedded) {
    const pad = theme.density === "compact" ? "5px 10px" : "10px 14px";
    // The ONLY way a brand-new record ever gets created — the grid's own paired form screen,
    // opened blank (no prefill) rather than pre-filled from a clicked row. Without this there was
    // no "+ New" anywhere: a fresh app's grids were empty with no visible way to put data in them.
    const newRecordScreenName = screenForRun.grid.rowClick?.targetScreen;
    const newRecordEl = newRecordScreenName ? detail.elements.find((e) => e.tag === "Screen" && e.name === newRecordScreenName) : null;
    const openNewRecordForm = () => { if (newRecordEl) openElement(newRecordEl); };
    const newButtonStyle = {
      background: theme.primary, color: "#fff", border: "none", borderRadius: `${theme.cornerRadius}px`,
      padding: theme.density === "compact" ? "6px 14px" : "8px 16px", fontFamily: "inherit", fontSize: "0.9em",
      fontWeight: 600, cursor: "pointer",
    };
    return (
      <div style={{ borderRadius: embedded ? 0 : `${theme.cornerRadius}px`, fontFamily: theme.fontFamily, fontSize: `${theme.fontSize}px`, boxShadow: embedded ? "none" : "0 1px 3px rgba(0,0,0,0.06)", border: embedded ? "none" : "1px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {!embedded && <AppBar theme={theme} appName={detail.name} />}
        <div style={{ background: embedded ? "transparent" : theme.background, padding: embedded ? 0 : 18 }}>
          {!embedded && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <button className="studio-btn-secondary" onClick={() => setActiveElement(null)}>← Back</button>
              <div style={{ fontSize: "0.8em", color: "#8a8a99" }}>{activeElement.name}</div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: embedded ? 0 : 10, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: "1.3em", color: embedded ? "var(--st-text)" : theme.primary }}>{embedded ? screenForRun.entity : `Browse: ${screenForRun.entity}`}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.82em", color: "#8a8a99", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => { setShowDeleted(e.target.checked); loadGridRows(screenForRun.grid.entity, e.target.checked); }}
                />
                Show deleted
              </label>
              {newRecordEl && <button style={newButtonStyle} onClick={openNewRecordForm}>+ New {screenForRun.entity}</button>}
            </div>
          </div>
          {gridRows && (
            <div style={{ fontSize: "0.8em", color: "#8a8a99", marginBottom: 12 }}>{visibleGridRows.length} of {gridRows.length} record{gridRows.length === 1 ? "" : "s"}</div>
          )}
          {gridRows && gridRows.length > 0 && (
            <input
              value={gridSearch}
              onChange={(e) => setGridSearch(e.target.value)}
              placeholder={`Search ${screenForRun.entity.toLowerCase()}s…`}
              style={{
                width: "100%", boxSizing: "border-box", padding: theme.density === "compact" ? "6px 10px" : "8px 12px",
                borderRadius: `${theme.cornerRadius}px`, border: "1px solid #d1d5db", fontFamily: "inherit", fontSize: "0.9em", marginBottom: 12,
              }}
            />
          )}
          {successMessage && (
            <div style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: `${theme.cornerRadius}px`, padding: "8px 12px", fontSize: "0.85em", marginBottom: 12 }}>
              {successMessage}
            </div>
          )}
          {gridLoading && <div style={{ color: "#888" }}>Loading…</div>}
          {!gridLoading && gridRows?.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#8a8a99" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🗂️</div>
              <div style={{ marginBottom: 14 }}>No {screenForRun.entity.toLowerCase()}s yet.</div>
              {newRecordEl && <button style={newButtonStyle} onClick={openNewRecordForm}>+ New {screenForRun.entity}</button>}
            </div>
          )}
          {!gridLoading && gridRows?.length > 0 && visibleGridRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#8a8a99" }}>No records match "{gridSearch}".</div>
          )}
          {!gridLoading && visibleGridRows?.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme.primary }}>
                  {screenForRun.grid.columns.map((c) => (
                    <th
                      key={c.bind}
                      onClick={() => toggleSort(c.bind)}
                      style={{ textAlign: "left", padding: pad, color: "#fff", fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    >
                      {c.header}{gridSort.bind === c.bind ? (gridSort.dir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th style={{ background: theme.primary }} />
                </tr>
              </thead>
              <tbody>
                {visibleGridRows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 ? "rgba(0,0,0,0.03)" : "transparent", transition: "background 0.12s",
                      opacity: row.__deletedAt ? 0.55 : 1,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 ? "rgba(0,0,0,0.03)" : "transparent"; }}
                  >
                    {screenForRun.grid.columns.map((c) => {
                      const display = fkColumnMap[c.bind] ? (optionLabel(fkColumnMap[c.bind], row[c.bind]) ?? row[c.bind]) : row[c.bind];
                      const isImageColumn = screenEntityFields.find((fd) => fd.name === c.bind)?.type === "image";
                      return (
                        <td
                          key={c.bind}
                          onClick={() => screenForRun.grid.rowClick?.targetScreen && openRowForEdit(screenForRun.grid.rowClick.targetScreen, row)}
                          style={{ padding: pad, borderBottom: "1px solid rgba(0,0,0,0.08)", cursor: screenForRun.grid.rowClick ? "pointer" : "default" }}
                        >
                          {isImageColumn
                            ? (display ? <img src={`${API_ORIGIN}${display}`} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "50%", display: "block" }} /> : "—")
                            : String(display ?? "")}
                        </td>
                      );
                    })}
                    <td style={{ padding: pad, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      {row.__deletedAt ? (
                        <button
                          onClick={() => restoreGridRow(screenForRun.grid.entity, row, screenKeyField)}
                          disabled={restoringKey === row[screenKeyField]}
                          style={{ background: "none", border: "1px solid #16a34a", color: "#16a34a", borderRadius: `${theme.cornerRadius}px`, fontSize: "0.85em", padding: "3px 10px", cursor: "pointer" }}
                        >
                          {restoringKey === row[screenKeyField] ? "Restoring…" : "Restore"}
                        </button>
                      ) : (
                        <button
                          onClick={() => deleteGridRow(row, screenKeyField)}
                          style={{ background: "none", border: `1px solid ${theme.accent}`, color: theme.accent, borderRadius: `${theme.cornerRadius}px`, fontSize: "0.85em", padding: "3px 10px", cursor: "pointer" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = theme.accent; e.currentTarget.style.color = "#fff"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = theme.accent; }}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {runMessages.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {runMessages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13, padding: m.messageType === "error" || m.messageType === "conflict" ? "8px 12px" : 0,
                    borderRadius: `${theme.cornerRadius}px`,
                    background: m.messageType === "error" ? "#fef2f2" : m.messageType === "conflict" ? "#fffbeb" : "transparent",
                    border: m.messageType === "error" ? "1px solid #fecaca" : m.messageType === "conflict" ? "1px solid #fde68a" : "none",
                    color: m.messageType === "error" ? "#dc2626" : m.messageType === "conflict" ? "#b45309" : "inherit",
                  }}
                >
                  {m.value}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderFormScreen(embedded) {
    return (
      <div style={{ borderRadius: embedded ? 0 : `${theme.cornerRadius}px`, fontFamily: theme.fontFamily, fontSize: `${theme.fontSize}px`, maxWidth: embedded ? "none" : 480, boxShadow: embedded ? "none" : "0 1px 3px rgba(0,0,0,0.06)", border: embedded ? "none" : "1px solid rgba(0,0,0,0.06)", overflow: "hidden" }}>
        {!embedded && <AppBar theme={theme} appName={detail.name} />}
        <div style={{ background: embedded ? "transparent" : theme.background, padding: embedded ? 0 : 18 }}>
          {/* No "← Back" on Login/Signup (the tab switcher below is their navigation) or while a
              password change is mandatory (ChangePassword) — but VerifyEmail/ForgotPassword/
              ResetPassword, also reachable pre-login, DO get a way out: back to Login. */}
          {!embedded && (() => {
            const onAuthTabScreen = needsLoginGate && (activeElement.name === "Login" || activeElement.name === "Signup");
            const onPreLoginAuxScreen = needsLoginGate && PRE_LOGIN_AUX_SCREENS.has(activeElement.name);
            const forcedPasswordChange = activeElement.name === "ChangePassword" && mustChangePassword;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                {!onAuthTabScreen && !forcedPasswordChange && (
                  <button
                    className="studio-btn-secondary"
                    onClick={() => {
                      const loginEl = onPreLoginAuxScreen && detail.elements.find((e) => e.tag === "Screen" && e.name === "Login");
                      if (loginEl) openElement(loginEl); else setActiveElement(null);
                    }}
                  >
                    ← Back{onPreLoginAuxScreen ? " to Login" : ""}
                  </button>
                )}
                <div style={{ fontSize: "0.8em", color: "#8a8a99" }}>{activeElement.name}</div>
              </div>
            );
          })()}
          {/* The very first account has nowhere to come from except Signup — a real,
              equally-weighted tab switcher (not a small link under Login) so a brand
              new user actually notices there's a way to create an account at all. */}
          {needsLoginGate && (activeElement.name === "Login" || activeElement.name === "Signup") ? (
            <div style={{ display: "flex", gap: 0, marginTop: embedded ? 0 : 10, marginBottom: 16, borderBottom: `1px solid ${theme.accent}33` }}>
              {["Signup", "Login"].map((name) => {
                const screenEl = detail.elements.find((e) => e.tag === "Screen" && e.name === name);
                const active = activeElement.name === name;
                return (
                  <button
                    key={name}
                    onClick={() => { if (screenEl && !active) openElement(screenEl); else if (!screenEl) setError(`No ${name} screen found.`); }}
                    style={{
                      flex: 1, padding: "10px 0", background: "none", border: "none", cursor: screenEl ? "pointer" : "default",
                      fontWeight: active ? 700 : 500, fontSize: "1em", fontFamily: "inherit",
                      color: active ? theme.primary : "#8a8a99",
                      borderBottom: active ? `2px solid ${theme.primary}` : "2px solid transparent",
                      opacity: screenEl ? 1 : 0.4,
                    }}
                  >
                    {name === "Signup" ? "Create account" : "Log in"}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ fontWeight: 700, fontSize: "1.15em", marginTop: embedded ? 0 : 10, marginBottom: 12, color: theme.primary }}>
              {embedded ? activeElement.name
                : activeElement.name === "ChangePassword" ? "Change Password"
                : `${runFieldValues[screenKeyField] ? "Edit" : "New"} ${screenForRun.entity}`}
            </div>
          )}
          {activeElement.name === "ChangePassword" && mustChangePassword && (
            <div style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a", borderRadius: `${theme.cornerRadius}px`, padding: "8px 12px", fontSize: "0.85em", marginBottom: 12 }}>
              You must change your password before continuing.
            </div>
          )}
          {successMessage && (
            <div style={{ background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", borderRadius: `${theme.cornerRadius}px`, padding: "8px 12px", fontSize: "0.85em", marginBottom: 12 }}>
              {successMessage}
            </div>
          )}
          {screenForRun.fields.map((f) => {
            const fieldDef = screenEntityFields.find((fd) => fd.name === f.bind);
            const inputStyle = {
              width: "100%", boxSizing: "border-box", padding: theme.density === "compact" ? "5px 8px" : "8px 10px",
              borderRadius: `${theme.cornerRadius}px`, border: "1px solid #d1d5db", fontFamily: "inherit", fontSize: "inherit",
              background: f.readonly ? "#f3f4f6" : "#fff", color: f.readonly ? "#6b7280" : "inherit",
            };
            const focusHandlers = {
              onFocus: (e) => { e.target.style.borderColor = theme.accent; e.target.style.outline = "none"; },
              onBlur: (e) => { e.target.style.borderColor = "#d1d5db"; },
            };
            const value = runFieldValues[f.bind] ?? "";
            const setValue = (v) => setRunFieldValues((cur) => ({ ...cur, [f.bind]: v }));

            // password/currentPassword/newPassword are submitted-only (never real Fields
            // on User — see aiService.ts's prompt) so fieldDef is always undefined for
            // them; mask them regardless, by bind name, before falling through to type.
            const isPasswordField = /password/i.test(f.bind || "");

            let control;
            if (isPasswordField) {
              control = <input type="password" autoComplete={f.bind === "password" ? "current-password" : "new-password"} style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} {...focusHandlers} />;
            } else if (fieldDef?.type === "image") {
              const uploading = uploadingFields[f.bind];
              control = (
                <div>
                  {value && (
                    <img
                      src={`${API_ORIGIN}${value}`} alt=""
                      style={{ display: "block", width: 96, height: 96, objectFit: "cover", borderRadius: `${theme.cornerRadius}px`, marginBottom: 8, border: "1px solid #d1d5db" }}
                    />
                  )}
                  <input
                    type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={f.readonly || uploading}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(f.bind, file); }}
                    style={{ fontSize: "0.85em" }}
                  />
                  {uploading && <div style={{ fontSize: "0.8em", color: "#8a8a99", marginTop: 4 }}>Uploading…</div>}
                </div>
              );
            } else if (f.control === "dropdown" && f.optionsFrom) {
              const opts = optionsCache[f.optionsFrom];
              control = (
                <LookupPicker
                  value={value}
                  options={opts}
                  disabled={f.readonly}
                  theme={theme}
                  inputStyle={inputStyle}
                  onChange={setValue}
                />
              );
            } else if (fieldDef?.type === "enum" && fieldDef.values.length > 0) {
              control = (
                <select style={inputStyle} disabled={f.readonly} value={value} onChange={(e) => setValue(e.target.value)} {...focusHandlers}>
                  <option value="">— Select —</option>
                  {fieldDef.values.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              );
            } else if (fieldDef?.type === "boolean") {
              control = (
                <input type="checkbox" disabled={f.readonly} checked={value === true || value === "true"} onChange={(e) => setValue(e.target.checked)} style={{ width: 18, height: 18 }} />
              );
            } else if (fieldDef?.type === "date") {
              control = <input type="date" disabled={f.readonly} style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} {...focusHandlers} />;
            } else if (fieldDef?.type === "integer" || fieldDef?.type === "decimal") {
              control = (
                <input
                  type="number" step={fieldDef.type === "decimal" ? "any" : "1"} disabled={f.readonly} style={inputStyle}
                  value={value} onChange={(e) => setValue(e.target.value)} {...focusHandlers}
                />
              );
            } else {
              control = <input type="text" disabled={f.readonly} style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} {...focusHandlers} />;
            }

            return (
              <div key={f.bind} style={{ marginBottom: theme.density === "compact" ? 6 : 12 }}>
                <label style={{ fontSize: "0.85em", fontWeight: 600, display: "block", marginBottom: 4 }}>
                  {f.label}{fieldDef?.required && <span style={{ color: "#dc2626" }}> *</span>}
                </label>
                {control}
              </div>
            );
          })}
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
                  fontWeight: 600, cursor: running ? "default" : "pointer", opacity: running ? 0.6 : 1, transition: "opacity 0.12s",
                }}
                onMouseEnter={(e) => { if (!running) e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { if (!running) e.currentTarget.style.opacity = "1"; }}
              >
                {running ? "Running…" : b.label}
              </button>
            ))}
          </div>
          {/* "Forgot password?" only on Login, and only for the current (email-based) account
              shape — an older, username-based app has no such screen to send them to. */}
          {activeElement.name === "Login" && accountHasEmailIdentity && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => {
                  const fpEl = detail.elements.find((e) => e.tag === "Screen" && e.name === "ForgotPassword");
                  if (fpEl) openElement(fpEl); else setError("No ForgotPassword screen found.");
                }}
                style={{ background: "none", border: "none", padding: 0, color: theme.accent, fontSize: "0.85em", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
              >
                Forgot password?
              </button>
            </div>
          )}
          {/* Google/GitHub sign-in — never XML-declared (see aiService.ts's prompt), injected
              here automatically whenever the account entity supports email identity at all. */}
          {(activeElement.name === "Login" || activeElement.name === "Signup") && accountHasEmailIdentity && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.accent}22`, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: "0.8em", color: "#8a8a99" }}>or continue with</div>
              <GoogleLogin
                onSuccess={(credentialResponse) => runAction("googleLogin", { credential: credentialResponse.credential })}
                onError={() => setRunMessages([{ type: "message", messageType: "error", value: "Google sign-in failed." }])}
                theme="outline"
                size="medium"
                text={activeElement.name === "Signup" ? "signup_with" : "signin_with"}
              />
              {GITHUB_CLIENT_ID && (
                <button
                  onClick={handleGithubOAuthClick}
                  style={{
                    width: 232, padding: "8px 0", borderRadius: `${theme.cornerRadius}px`, border: "1px solid #d1d5db",
                    background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: "0.9em", fontWeight: 500,
                  }}
                >
                  {activeElement.name === "Signup" ? "Sign up with GitHub" : "Sign in with GitHub"}
                </button>
              )}
            </div>
          )}
          {runMessages.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {runMessages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "0.9em", padding: m.messageType === "error" || m.messageType === "conflict" ? "8px 12px" : 0,
                    borderRadius: `${theme.cornerRadius}px`,
                    background: m.messageType === "error" ? "#fef2f2" : m.messageType === "conflict" ? "#fffbeb" : "transparent",
                    border: m.messageType === "error" ? "1px solid #fecaca" : m.messageType === "conflict" ? "1px solid #fde68a" : "none",
                    color: m.messageType === "error" ? "#dc2626" : m.messageType === "conflict" ? "#b45309" : "inherit",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                  }}
                >
                  <span>{m.value}</span>
                  {m.messageType === "conflict" && (
                    <button
                      onClick={reloadLatestRow}
                      style={{
                        background: "#b45309", color: "#fff", border: "none", borderRadius: `${theme.cornerRadius}px`,
                        padding: "4px 10px", fontSize: "0.85em", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                      }}
                    >
                      Reload latest
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full-screen "use the real app" mode — a persistent AppBar + a left nav grouped by entity
  // (buildAppModules), filling the whole viewport rather than sitting inside the Studio's own
  // padded two-column card layout. This is what "look like a real app, desktop, full screen"
  // means: a running application has its own shell, not a schema browser you click into.
  if (runMode && detail) {
    const modules = buildAppModules(detail, loggedInRole);
    const groupOrder = [...new Set(modules.map((m) => m.group))];
    const filteredModules = navSearch.trim()
      ? modules.filter((m) => m.label.toLowerCase().includes(navSearch.trim().toLowerCase()))
      : modules;
    const identity = accountEntityEl && loggedIn ? loggedInIdentity : (user?.email || detail.name);
    const identitySubtitle = accountEntityEl && loggedIn ? "Signed in" : "Workspace owner";
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: theme.background, display: "flex", flexDirection: "column", fontFamily: theme.fontFamily }}>
        <div className="studio-root" style={{ background: "var(--st-surface)", borderBottom: "1px solid var(--st-border)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <button onClick={() => setRunMode(false)} className="studio-btn-secondary" style={{ fontSize: 12.5 }}>← Exit</button>
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
            style={{ background: "transparent", border: "1px solid var(--st-border)", borderRadius: 7, width: 30, height: 30, cursor: "pointer", color: "var(--st-text)", fontSize: 13, flexShrink: 0 }}
          >
            ☰
          </button>
          {theme.logo ? (
            <img src={theme.logo} alt="" style={{ height: 26, display: "block", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
          ) : (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: theme.primary, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {(detail.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: "1.02em", color: "var(--st-text)", whiteSpace: "nowrap" }}>{detail.name}</div>
          <div style={{ flex: 1, maxWidth: 420, marginLeft: 16, position: "relative" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, color: "var(--st-muted)", pointerEvents: "none" }}>🔍</span>
            <input
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Search modules…"
              className="studio-input"
              style={{ width: "100%", paddingLeft: 30, fontSize: 13 }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              title="Notifications"
              style={{ background: "transparent", border: "1px solid var(--st-border)", borderRadius: 8, width: 34, height: 34, cursor: "pointer", color: "var(--st-text)", fontSize: 14, flexShrink: 0 }}
            >
              🔔
            </button>
            {showNotifications && (
              <div
                className="studio-card"
                style={{ position: "absolute", right: 0, top: 40, width: 220, padding: 14, fontSize: 12.5, color: "var(--st-muted)", zIndex: 10 }}
                onMouseLeave={() => setShowNotifications(false)}
              >
                You're all caught up — no new notifications.
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, paddingLeft: 12, borderLeft: "1px solid var(--st-border)" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: theme.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12.5, flexShrink: 0 }}>
              {initialsFor(identity)}
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--st-text)" }}>{identity}</div>
              {accountEntityEl && loggedIn ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      const cp = detail.elements.find((e) => e.tag === "Screen" && e.name === "ChangePassword");
                      if (cp) openElement(cp); else setError("No ChangePassword screen found.");
                    }}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "var(--st-accent)" }}
                  >
                    Change password
                  </button>
                  <button onClick={handleLogout} disabled={loggingOut} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "var(--st-danger)" }}>
                    {loggingOut ? "Logging out…" : "Logout"}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--st-muted)" }}>{identitySubtitle}</div>
              )}
            </div>
          </div>
        </div>
        {showFixModal && (
          // className="studio-root" here is load-bearing, not decorative: every --st-* color
          // variable the studio-card/studio-btn-*/studio-textarea classes below depend on is only
          // ever DEFINED on an element with this class (see styles.css) — Run mode's own root never
          // carries it (its content renders the APP's own theme, not the Studio's), so without this
          // wrapper the modal's background/border/button colors all silently fail to resolve,
          // which is exactly why it read as "not clearly visible."
          <div className="studio-root" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setShowFixModal(false)}>
            <div className="studio-card" style={{ width: 560, padding: 24, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: "var(--st-text)" }}>Fix or update this application</div>
              <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 16 }}>
                Describe what's wrong or what should change — a screen behaving oddly, a validation
                that's too strict, a field that should be there and isn't. Only the specific thing
                you describe gets touched — every other screen, entity, and all your existing data
                stay exactly as they are.
              </p>
              <textarea
                className="studio-textarea"
                value={genDescription}
                onChange={(e) => setGenDescription(e.target.value)}
                placeholder="The Timesheet form lets me submit negative hours — it shouldn't. Also add a 'notes' field to Attendance."
                rows={4}
                style={{ width: "100%", marginBottom: 8, resize: "vertical" }}
              />
              <button className="studio-btn-primary" onClick={handleGenerate} disabled={generating || !genDescription.trim()}>
                {generating ? "Generating…" : "Generate Fix"}
              </button>
              {genError && <div style={{ color: "var(--st-danger)", fontSize: 12.5, marginTop: 8 }}>{genError}</div>}
              {pendingXml && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Review before applying:</div>
                  <pre style={{ background: "#13111c", color: "#e2e8f0", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, maxHeight: "35vh" }}>
                    {pendingXml}
                  </pre>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="studio-btn-primary" onClick={handleApplyDescription} disabled={applying}>
                      {applying ? "Applying…" : "Apply Fix"}
                    </button>
                    <button className="studio-btn-secondary" onClick={() => setPendingXml(null)}>Discard</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <button className="studio-btn-secondary" onClick={() => { setShowFixModal(false); setGenDescription(""); setPendingXml(null); setGenError(""); }}>Close</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {!needsLoginGate && (
            // Same --st-* scoping reason as the Fix modal/Dashboard above. Grouped like a real
            // enterprise app's nav (People/Time/Finance/…, see groupForEntity) rather than one flat
            // list, with a collapse toggle and a live filter fed by the top bar's search box.
            <div className="studio-root" style={{ width: sidebarCollapsed ? 64 : 220, borderRight: "1px solid var(--st-border)", padding: sidebarCollapsed ? "14px 8px" : 14, overflowY: "auto", background: "var(--st-surface)", flexShrink: 0, display: "flex", flexDirection: "column", transition: "width 0.15s" }}>
              <div style={{ flex: 1 }}>
                <div
                  onClick={() => setActiveElement(null)}
                  title="Dashboard"
                  style={{
                    padding: sidebarCollapsed ? "9px 0" : "9px 12px", borderRadius: 6, cursor: "pointer", marginBottom: 10, fontSize: 13.5,
                    fontWeight: !activeElement ? 700 : 500, background: !activeElement ? `${theme.primary}1a` : "transparent", color: !activeElement ? theme.primary : "var(--st-text)",
                    borderBottom: "1px solid var(--st-border)", paddingBottom: 12,
                    display: "flex", alignItems: "center", gap: 8, justifyContent: sidebarCollapsed ? "center" : "flex-start",
                  }}
                >
                  <span>🏠</span>
                  {!sidebarCollapsed && "Dashboard"}
                </div>
                {groupOrder.map((group) => {
                  const items = filteredModules.filter((m) => m.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group} style={{ marginTop: 14 }}>
                      {!sidebarCollapsed && (
                        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--st-muted)", textTransform: "uppercase", padding: "0 12px", marginBottom: 6 }}>
                          {group}
                        </div>
                      )}
                      {items.map((m) => {
                        const active = screenForRun?.entity === m.key;
                        return (
                          <div
                            key={m.key}
                            onClick={() => openElement(m.screenEl)}
                            title={m.label}
                            style={{
                              padding: sidebarCollapsed ? "9px 0" : "9px 12px", borderRadius: 6, cursor: "pointer", marginBottom: 2, fontSize: 13.5,
                              fontWeight: active ? 700 : 500, background: active ? `${theme.primary}1a` : "transparent", color: active ? theme.primary : "var(--st-text)",
                              display: "flex", alignItems: "center", gap: 8, justifyContent: sidebarCollapsed ? "center" : "flex-start",
                            }}
                          >
                            <ModuleIcon entity={m.key} icon={m.icon} style={{ color: active ? theme.primary : "var(--st-muted)", flexShrink: 0 }} />
                            {!sidebarCollapsed && m.label}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {navSearch.trim() && filteredModules.length === 0 && !sidebarCollapsed && (
                  <div style={{ fontSize: 12, color: "var(--st-muted)", padding: "10px 12px" }}>No modules match "{navSearch}".</div>
                )}
              </div>
              <div style={{ borderTop: "1px solid var(--st-border)", paddingTop: 10, fontSize: 11, color: "var(--st-muted)", display: "flex", alignItems: "center", gap: 6, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                {!sidebarCollapsed && "All Systems Normal"}
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            {!activeElement && !needsLoginGate && (
              // Same reason as the Fix modal above: studio-card and the --st-text/--st-muted
              // variables used directly below only resolve inside a .studio-root-classed subtree.
              <div className="studio-root">
                <div
                  style={{
                    background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
                    borderRadius: 14, padding: "26px 28px", marginBottom: 22, color: "#fff",
                    boxShadow: `0 8px 24px ${theme.primary}33`,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
                    {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                  </div>
                  <div style={{ fontSize: "1.5em", fontWeight: 800, marginBottom: 6 }}>
                    {greetingForHour(new Date().getHours())}, {displayNameFor(accountEntityEl && loggedIn ? loggedInIdentity : user?.email)} 👋
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.9, marginBottom: modules.some((m) => m.formScreenEl) ? 18 : 0, maxWidth: 560 }}>
                    Here's what's happening across {detail.name} today.
                  </div>
                  {modules.some((m) => m.formScreenEl) && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {modules.filter((m) => m.formScreenEl).slice(0, 3).map((m) => (
                        <button
                          key={m.key}
                          onClick={() => openElement(m.formScreenEl)}
                          style={{
                            background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)", color: "#fff",
                            borderRadius: 999, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 6,
                          }}
                        >
                          <ModuleIcon entity={m.key} icon={m.icon} size={15} style={{ color: "#fff", flexShrink: 0 }} /> New {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.05em", color: "var(--st-text)", marginBottom: 14 }}>Modules</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
                  {modules.map((m) => {
                    const count = moduleCounts[m.key];
                    return (
                      <div
                        key={m.key}
                        className="studio-card"
                        onClick={() => openElement(m.screenEl)}
                        style={{ padding: 18, cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.12)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", color: "var(--st-muted)", textTransform: "uppercase" }}>{m.label}</div>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${theme.primary}1f`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <ModuleIcon entity={m.key} icon={m.icon} style={{ color: theme.primary }} />
                          </div>
                        </div>
                        <div style={{ fontSize: "1.8em", fontWeight: 800, color: "var(--st-text)", marginTop: 10 }}>
                          {count === "loading" ? "…" : count === null ? "—" : count}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--st-muted)", marginTop: 2 }}>records</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {activeElement && activeElement.tag === "Screen" && screenForRun?.grid && renderGridScreen(true)}
            {activeElement && activeElement.tag === "Screen" && screenForRun && !screenForRun.grid && renderFormScreen(true)}
          </div>
        </div>
        {/* A floating button, not another item crammed into the already-busy top bar (where it
            was easy to miss among Exit/logo/name/account controls) — always in the same
            unmistakable spot regardless of how much else is in the bar. */}
        {!needsLoginGate && (
          <button
            onClick={() => setShowFixModal(true)}
            title="Fix or update this application"
            style={{
              position: "fixed", bottom: 28, right: 28, zIndex: 150,
              background: theme.accent, color: "#fff", border: "none", borderRadius: 999,
              padding: "12px 20px", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            🛠 Fix / Update
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="studio-root" style={{ minHeight: "100vh", background: "var(--st-bg)", padding: "28px 36px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <button className="studio-btn-secondary" onClick={() => navigate("/")}>← Back</button>
        <div style={{ fontWeight: 800, fontSize: 20, flex: 1 }}>Runtime Engine</div>
        <button className="studio-btn-primary" onClick={() => setShowNewModal(true)}>+ New Project</button>
      </div>
      <p style={{ color: "var(--st-muted)", fontSize: 13.5, marginTop: -10, marginBottom: 24, maxWidth: 680 }}>
        A separate space for Applications built from the Entity/Relationship/Validation/DataSource/
        Screen/Action vocabulary — not tied to any project.
      </p>

      {error && <div className="studio-card" style={{ padding: 18, color: "var(--st-danger)", fontSize: 13.5, marginBottom: 20 }}>{error}</div>}

      {showNewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={closeNewModal}>
          <div className="studio-card" style={{ width: 420, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>New Project</div>
            <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 16 }}>
              Give it a name — you'll describe what it does next.
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 4 }}>Project name</label>
            <input
              className="studio-input" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Insurance Claims Management" style={{ width: "100%", marginBottom: 12 }}
              onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleCreate(); }}
            />
            {createError && <div style={{ color: "var(--st-danger)", fontSize: 12.5, marginBottom: 12 }}>{createError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="studio-btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()} style={{ flex: 1 }}>
                {creating ? "Creating…" : "Create"}
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
              style={{
                padding: 14, cursor: "pointer", transition: "box-shadow 0.12s, transform 0.12s",
                border: selectedId === a.id ? "1px solid var(--st-accent)" : "1px solid var(--st-border)",
                boxShadow: selectedId === a.id ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = selectedId === a.id ? "0 2px 8px rgba(0,0,0,0.08)" : "none"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadApplicationXml(a); }}
                    title="Download XML"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--st-muted)", opacity: 0.8, padding: 0, fontSize: 13, display: "flex" }}
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteApplication(a.id); }}
                    title="Delete"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--st-danger)", opacity: 0.7, padding: 0, fontSize: 13 }}
                  >
                    ✕
                  </button>
                </div>
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
              {!needsLoginGate && (
                <div style={{ width: 160, borderRight: "1px solid var(--st-border)", padding: 12 }}>
                  {buildAppModules(detail).length > 0 && (
                    <div
                      onClick={() => enterAppOrDescribe(detail)}
                      style={{
                        padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 10,
                        fontWeight: 700, background: "var(--st-accent)", color: "#fff",
                        borderBottom: "1px solid var(--st-border)", paddingBottom: 12,
                      }}
                    >
                      ▶ Run
                    </div>
                  )}
                  <div
                    onClick={() => { setShowDescribePanel(true); setShowFullXml(false); setShowErMap(false); setActiveElement(null); }}
                    style={{
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 2,
                      fontWeight: 600, background: showDescribePanel ? "var(--st-accent)" : "transparent",
                      color: showDescribePanel ? "#fff" : "inherit",
                    }}
                  >
                    ✍️ Describe
                  </div>
                  <div
                    onClick={() => { setShowErMap(true); setShowFullXml(false); setShowDescribePanel(false); setActiveElement(null); }}
                    style={{
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 2,
                      fontWeight: 600, background: showErMap ? "var(--st-accent)" : "transparent",
                      color: showErMap ? "#fff" : "inherit",
                    }}
                  >
                    🗺️ ER Map
                  </div>
                  <div
                    onClick={() => { setShowFullXml(true); setShowErMap(false); setShowAuditLog(false); setShowDescribePanel(false); setActiveElement(null); }}
                    style={{
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 2,
                      fontWeight: 600, background: showFullXml ? "var(--st-accent)" : "transparent",
                      color: showFullXml ? "#fff" : "inherit",
                    }}
                  >
                    📄 Full XML
                  </div>
                  <div
                    onClick={() => { setShowAuditLog(true); setShowFullXml(false); setShowErMap(false); setShowDescribePanel(false); setActiveElement(null); loadAuditLog(); }}
                    style={{
                      padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 10,
                      fontWeight: 600, background: showAuditLog ? "var(--st-accent)" : "transparent",
                      color: showAuditLog ? "#fff" : "inherit", borderBottom: "1px solid var(--st-border)", paddingBottom: 12,
                    }}
                  >
                    🛡️ Audit Log
                  </div>
                  {ELEMENT_TAGS.map((tag) => (
                    <div
                      key={tag}
                      onClick={() => { setActiveTag(tag); setActiveElement(null); setShowFullXml(false); setShowErMap(false); setShowAuditLog(false); setShowDescribePanel(false); }}
                      style={{
                        padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 2,
                        background: !showFullXml && !showErMap && !showAuditLog && !showDescribePanel && activeTag === tag ? "var(--st-accent)" : "transparent",
                        color: !showFullXml && !showErMap && !showAuditLog && !showDescribePanel && activeTag === tag ? "#fff" : "inherit",
                      }}
                    >
                      {tag} ({detail.elements.filter((e) => e.tag === tag).length})
                    </div>
                  ))}
                </div>
              )}
              <div style={{ flex: 1, padding: 16 }}>
                {accountEntityEl && loggedIn && (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, padding: "8px 12px", background: "rgba(0,0,0,0.04)", borderRadius: 6, fontSize: 12.5 }}>
                    <span>Signed in as <strong>{loggedInIdentity}</strong></span>
                    <button
                      className="studio-btn-secondary" style={{ padding: "3px 10px", fontSize: 12 }}
                      onClick={() => {
                        const cpEl = detail.elements.find((e) => e.tag === "Screen" && e.name === "ChangePassword");
                        if (cpEl) openElement(cpEl); else setError("No ChangePassword screen found.");
                      }}
                    >
                      Change Password
                    </button>
                    <button className="studio-btn-secondary" style={{ padding: "3px 10px", fontSize: 12 }} onClick={handleLogout} disabled={loggingOut}>
                      {loggingOut ? "Logging out…" : "Logout"}
                    </button>
                  </div>
                )}
                {showDescribePanel && !needsLoginGate && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                      {detail.elements.length === 0 ? "Describe your application" : "Add to this application"}
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 12, maxWidth: 560 }}>
                      {detail.elements.length === 0
                        ? "Describe it in plain English — one entity, or the whole thing, screens now or later."
                        : "Describe what to add or change — only that gets touched, everything else and all existing data stay exactly as they are."}
                    </p>
                    <textarea
                      className="studio-textarea"
                      value={genDescription}
                      onChange={(e) => setGenDescription(e.target.value)}
                      placeholder="An insurance claims app with policies, claims, and adjusters. Each policy belongs to a customer and can have many claims; each claim is assigned to one adjuster and has a status and amount."
                      rows={5}
                      style={{ width: "100%", maxWidth: 640, marginBottom: 8, resize: "vertical" }}
                    />
                    <div>
                      <button className="studio-btn-primary" onClick={handleGenerate} disabled={generating || !genDescription.trim()}>
                        {generating ? "Generating…" : "Generate"}
                      </button>
                    </div>
                    {genError && <div style={{ color: "var(--st-danger)", fontSize: 12.5, marginTop: 8 }}>{genError}</div>}
                    {pendingXml && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Review before applying:</div>
                        <pre style={{ background: "#13111c", color: "#e2e8f0", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, maxHeight: "40vh", maxWidth: 640 }}>
                          {pendingXml}
                        </pre>
                        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                          <button className="studio-btn-primary" onClick={handleApplyDescription} disabled={applying}>
                            {applying ? "Applying…" : "Apply"}
                          </button>
                          <button className="studio-btn-secondary" onClick={() => setPendingXml(null)}>Discard</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {showErMap && !needsLoginGate && (() => {
                  const erTables = applicationToErTables(detail);
                  // Every non-Entity node that's connected to an Entity (same FOR_ENTITY edges the
                  // graph already carries — see applicationStore.ts's linkElements) — shown as its
                  // own table so these connections are visible from inside the Studio, not just by
                  // opening Neo4j Browser directly.
                  const validationRows = detail.elements
                    .filter((e) => e.tag === "Validation")
                    .map((e) => { const v = parseValidationForRun(e.xml); return [v.entity, v.id, v.when, v.onViolation, v.test || "—", v.message || "—"]; });
                  const screenRows = detail.elements
                    .filter((e) => e.tag === "Screen")
                    .map((e) => { const s = parseScreenForRun(e.xml); return [s.entity || "—", e.name, s.grid ? "grid" : "form", s.requiresRole ? s.requiresRole.join(", ") : "—"]; });
                  const actionRows = detail.elements
                    .filter((e) => e.tag === "Action")
                    .map((e) => { const a = parseActionForRun(e.xml); return [a.entity, e.name, a.steps.join(" → ") || "—"]; });
                  const dataSourceRows = detail.elements
                    .filter((e) => e.tag === "DataSource")
                    .map((e) => { const d = parseDataSourceForRun(e.xml); return [d.entity || "—", e.name]; });
                  return (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Entity/Relationship Map</div>
                      <ERDiagram entities={erTables} emptyMessage="No entities yet — describe the application first." />
                      {erTables.tables.length > 0 && (
                        <>
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 12.5 }}>
                            <thead>
                              <tr style={{ background: "rgba(0,0,0,0.05)" }}>
                                {["Entity", "Field", "Type", "Key", "Required", "Related To"].map((h) => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {erTables.tables.flatMap((t) =>
                                t.columns.map((c, i) => (
                                  <tr key={`${t.name}.${c.name}`} style={{ borderBottom: "1px solid var(--st-border)" }}>
                                    <td style={{ padding: "6px 10px" }}>{i === 0 ? t.name : ""}</td>
                                    <td style={{ padding: "6px 10px" }}>{c.name}</td>
                                    <td style={{ padding: "6px 10px" }}>{c.type}</td>
                                    <td style={{ padding: "6px 10px" }}>{c.pk ? "✓" : ""}</td>
                                    <td style={{ padding: "6px 10px" }}>{detail.elements.find((e) => e.tag === "Entity" && e.name === t.name) && parseEntityForRun(detail.elements.find((e) => e.tag === "Entity" && e.name === t.name).xml).fields.find((f) => f.name === c.name)?.required ? "✓" : ""}</td>
                                    <td style={{ padding: "6px 10px" }}>{c.fk || ""}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                          <ElementTable
                            title="Validations"
                            columns={["Entity", "Rule", "When", "On Violation", "Condition", "Message"]}
                            rows={validationRows}
                            emptyLabel="No validations yet — every entity can have one or more, each connected to it."
                          />
                          <ElementTable
                            title="Screens"
                            columns={["Entity", "Screen", "Type", "Requires Role"]}
                            rows={screenRows}
                            emptyLabel="No screens yet."
                          />
                          <ElementTable
                            title="Actions"
                            columns={["Entity", "Action", "Steps"]}
                            rows={actionRows}
                            emptyLabel="No custom actions yet — save/delete/cancel/openRecord are built in and don't need one."
                          />
                          <ElementTable
                            title="Data Sources"
                            columns={["Entity", "Data Source"]}
                            rows={dataSourceRows}
                            emptyLabel="No data sources yet — these power dropdown options and FK lookups."
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
                {showFullXml && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Full Application XML</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="studio-btn-secondary"
                          onClick={() => downloadTextFile(xmlFilenameFor(detail.name), buildFullXml(detail))}
                        >
                          Download
                        </button>
                        <button
                          className="studio-btn-secondary"
                          onClick={() => navigator.clipboard?.writeText(buildFullXml(detail))}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <pre style={{ background: "#13111c", color: "#e2e8f0", padding: 16, borderRadius: 8, overflow: "auto", fontSize: 12, maxHeight: "70vh" }}>
                      {buildFullXml(detail)}
                    </pre>
                  </div>
                )}
                {showAuditLog && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Audit Log</div>
                    <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 14 }}>
                      Logins, registrations, deletes, restores, and access denials for this application — most recent first.
                    </p>
                    {auditEvents === null && <div style={{ color: "var(--st-muted)", fontSize: 13 }}>Loading…</div>}
                    {auditEvents?.length === 0 && <div style={{ color: "var(--st-muted)", fontSize: 13 }}>No events yet.</div>}
                    {auditEvents && auditEvents.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--st-border)" }}>
                            <th style={{ textAlign: "left", padding: "6px 10px" }}>When</th>
                            <th style={{ textAlign: "left", padding: "6px 10px" }}>Event</th>
                            <th style={{ textAlign: "left", padding: "6px 10px" }}>Who</th>
                            <th style={{ textAlign: "left", padding: "6px 10px" }}>Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditEvents.map((e, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--st-border)" }}>
                              <td style={{ padding: "6px 10px", whiteSpace: "nowrap", color: "var(--st-muted)" }}>{new Date(e.at).toLocaleString()}</td>
                              <td style={{ padding: "6px 10px" }}>{e.type}</td>
                              <td style={{ padding: "6px 10px" }}>{e.identity || "—"}</td>
                              <td style={{ padding: "6px 10px" }}>{e.detail || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {!showFullXml && !showErMap && !showAuditLog && !showDescribePanel && !activeElement && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {elementsByTag.length === 0 && <div style={{ color: "var(--st-muted)", fontSize: 13 }}>No {activeTag} elements.</div>}
                    {elementsByTag.map((el) => (
                      <div
                        key={el.name}
                        className="studio-card"
                        onClick={() => openElement(el)}
                        style={{ padding: "10px 14px", cursor: "pointer", transition: "background 0.12s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                      >
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
                {activeElement && activeElement.tag === "Screen" && screenForRun?.grid && renderGridScreen()}
                {activeElement && activeElement.tag === "Screen" && screenForRun && !screenForRun.grid && renderFormScreen()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
