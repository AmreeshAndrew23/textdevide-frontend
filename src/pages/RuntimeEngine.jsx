import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import api, { API_ORIGIN } from "../api/client";
import { ERDiagram } from "../components/ERDiagram";
import AskPanel from "../components/AskPanel";
import { BrandMark } from "../components/StudioLayout";
import ThemeToggle from "../components/ThemeToggle";
import DomainMotif from "../components/DomainMotif";
import DesignStudio from "../components/DesignStudio";
import PublishPanel from "../components/PublishPanel";
import { publicClientFor, setAppToken, clearAppToken } from "../api/publicClient";
import { useAuth } from "../context/AuthContext";
import {
  parseScreenForRun, parseEntityForRun, parseRelationshipForRun, parseDataSourceForRun, parseValidationForRun,
  parseActionForRun, humanize, parseThemeForRun, buildFullXml, downloadTextFile, xmlFilenameFor,
  applicationToErTables, summarizeApplication,
} from "../utils/applicationXml";
import {
  Users, UserCog, Building2, Home, Folder, DollarSign, Clock, Palmtree, Warehouse,
  ShoppingCart, Receipt, CreditCard, Shield, Wrench, ClipboardCheck, FileText,
  GraduationCap, BookOpen, HeartPulse, Stethoscope, Lock, NotebookPen, Car, Package, Briefcase,
  Search, ChevronDown, X as XIcon, Download,
  Sparkles, MessageSquareText, Network, FileCode2, ShieldCheck, LayoutDashboard, Play, ArrowLeft, Bell,
  Copy, Boxes, Monitor, GitBranch, ListChecks, Database, Zap, Palette, KeyRound, Hash, ChevronRight, Check,
  RotateCcw, Plus, Pencil, Trash2, CheckCircle2, AlertCircle, AlertTriangle, Info, ChevronLeft, ChevronUp,
  ArrowUpDown, Upload, Image as ImageIcon, LogOut, CalendarDays, ArrowUpRight, BarChart3, PanelLeftOpen, PanelLeftClose,
  Wallet, PieChart, Rocket, Table as TableIcon, Columns3, LayoutGrid, History,
} from "lucide-react";
import { buildInsights, rowLabel } from "../utils/dashboardInsights";
import { viewFields, availableViews, defaultView, monthGrid, groupByDay, dateKey, VIEW_LABELS } from "../utils/entityViews";
import { resolveDesign, designToCss } from "../utils/designProfile";
import { useDesignFonts } from "../utils/designFonts";
import { pluralize, toneForValue, formatDate, formatNumber, displayText, avatarColors, toCsv } from "../utils/runtimeFormat";
import "../runtimeApp.css";

// The second, independent "Runtime Engine" — its own standalone space, NOT nested under any
// project (confirmed with the user: "we need to have a separate space for both"). Lists/creates
// Applications built from the Application/Entity/Relationship/Validation/DataSource/Screen/Action
// vocabulary (see backend-node's src/runtimeEngine/), completely separate from the existing
// Dashboard/project workflow, which this page never touches.

const ELEMENT_TAGS = ["Entity", "Relationship", "Validation", "DataSource", "Screen", "Action", "Theme", "Session", "Auditing", "AutoNumber"];
// How each element tag reads in the workspace nav — a plain plural label and a line icon.
const TAG_META = {
  Entity: { label: "Entities", icon: Boxes }, Relationship: { label: "Relationships", icon: GitBranch },
  Validation: { label: "Validations", icon: ListChecks }, DataSource: { label: "Data sources", icon: Database },
  Screen: { label: "Screens", icon: Monitor }, Action: { label: "Actions", icon: Zap },
  Theme: { label: "Theme", icon: Palette }, Session: { label: "Session", icon: KeyRound },
  Auditing: { label: "Auditing", icon: ShieldCheck }, AutoNumber: { label: "Auto numbers", icon: Hash },
};

// GitHub client ids are not secret (only the server-held CLIENT_SECRET is) — safe to read
// client-side the same way VITE_GOOGLE_CLIENT_ID already is for the Studio's own login page.
const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || "";


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
    <div style={{ marginTop: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
        {title} <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 12.5 }}>· {rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--st-muted)", padding: "14px 16px", border: "1px dashed var(--border-strong)", borderRadius: 10 }}>{emptyLabel}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{columns.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j} style={j === 0 ? { color: "var(--text)", fontWeight: 500 } : undefined}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CopyTextButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="studio-btn-secondary studio-btn-sm"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
    </button>
  );
}

// The Review step's "what will this do" digest of a generated (not yet applied) result — its
// top-level elements grouped by tag, each marked new or updated against what the application
// already has (an updated element is matched by tag + name, the same way mergeApplicationNodes
// replaces it). Purely informational; the XML itself is still one click away.
function summarizeXmlFragment(xml, detail) {
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return { error: true, groups: [], total: 0 };
    const existing = new Set((detail?.elements || []).map((e) => `${e.tag}:${e.name}`));
    const byTag = new Map();
    for (const el of Array.from(doc.documentElement.children)) {
      const name = el.getAttribute("name") || el.getAttribute("id") || el.tagName;
      if (!byTag.has(el.tagName)) byTag.set(el.tagName, []);
      byTag.get(el.tagName).push({ name, isNew: !existing.has(`${el.tagName}:${name}`) });
    }
    const order = ELEMENT_TAGS.filter((t) => byTag.has(t)).concat([...byTag.keys()].filter((t) => !ELEMENT_TAGS.includes(t)));
    const groups = order.map((tag) => ({ tag, items: byTag.get(tag) }));
    return { error: false, groups, total: groups.reduce((n, g) => n + g.items.length, 0) };
  } catch {
    return { error: true, groups: [], total: 0 };
  }
}

// One line of plain-English context under an element's name in the Elements browser.
function describeElement(el) {
  try {
    if (el.tag === "Entity") {
      const e = parseEntityForRun(el.xml);
      return `${e.fields.length} field${e.fields.length === 1 ? "" : "s"}${e.isAccount ? " · user accounts" : ""}`;
    }
    if (el.tag === "Screen") {
      const s = parseScreenForRun(el.xml);
      return `${s.grid ? "Browse list" : "Form"}${s.entity ? ` · ${humanize(s.entity)}` : ""}${s.requiresRole ? ` · ${s.requiresRole.join(", ")} only` : ""}`;
    }
    if (el.tag === "Validation") {
      const v = parseValidationForRun(el.xml);
      return v.message || `${v.entity} · ${v.when}`;
    }
    if (el.tag === "Relationship") {
      const r = parseRelationshipForRun(el.xml);
      return `${r.fromEntity}.${r.fromField} → ${r.toEntity}`;
    }
    if (el.tag === "Action") {
      const a = parseActionForRun(el.xml);
      return a.steps.join(" → ") || a.entity || "Custom action";
    }
    if (el.tag === "DataSource") {
      const d = parseDataSourceForRun(el.xml);
      return d.entity ? `Lists ${humanize(d.entity)} records` : "Data source";
    }
  } catch {
    // Fall through to the generic label for anything that doesn't parse cleanly.
  }
  return el.tag;
}

// A real searchable lookup picker for any FK/dropdown field, universal across every generated
// app (driven purely by the optionsFrom/DataSource data every app already has — no per-app XML
// change needed). Replaces a plain <select>, which is fine for a handful of rows but unusable
// once the related entity (Employee, Vendor, ...) has hundreds — type to filter, click to pick.
function LookupPicker({ value, options, disabled, placeholder, onChange }) {
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
        className="rt-input"
        disabled={disabled || loading}
        onClick={() => { setOpen((v) => !v); setQuery(""); }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: disabled || loading ? "default" : "pointer", textAlign: "left", color: selected ? undefined : "#94a3b8" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {loading ? "Loading…" : selected ? selected.label : (placeholder || "Select…")}
        </span>
        {!disabled && !loading && <ChevronDown size={15} style={{ flexShrink: 0, color: "#94a3b8" }} />}
      </button>
      {open && !disabled && !loading && (
        <div className="rt-lookup-menu">
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--rt-border)" }}>
            <Search size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to search…"
              style={{ flex: 1, border: "none", outline: "none", font: "inherit", fontSize: 13.5, background: "transparent", boxShadow: "none" }}
            />
            {value !== "" && value != null && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} title="Clear" className="rt-icon-btn sm" style={{ width: 24, height: 24 }}>
                <XIcon size={14} />
              </button>
            )}
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", fontSize: 13, color: "#94a3b8" }}>No matches.</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  className={`rt-lookup-opt${String(o.value) === String(value) ? " selected" : ""}`}
                  style={{ borderRadius: 7 }}
                  onClick={() => { onChange(o.value); setOpen(false); }}
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


// A persistent, theme-colored title band above a running Screen — logo (or a monogram fallback)
// + the Application's own name, so a running app reads as "a real app with a shell" rather than
// a bare panel floating inside the Studio's own chrome. Carries theme.primary, same as every
// other primary-colored surface in the Run panel.
function AppBar({ theme, appName }) {
  return (
    <div className="rt-topbar" style={{ height: 56, padding: "0 20px", gap: 11 }}>
      {theme.logo
        ? <img src={theme.logo} alt="" style={{ height: 26, display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />
        : <div className="rt-logo" style={{ width: 30, height: 30, fontSize: 13 }}>{(appName || "?").charAt(0).toUpperCase()}</div>}
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{appName}</div>
      <span className="rt-badge plain neutral" style={{ marginLeft: 6 }}>Screen preview</span>
    </div>
  );
}

// Status-like values keep their meaning (red/amber/green); anything else gets a distinct palette
// color by position, so a breakdown never shows two different values in the same color.
const TONE_COLORS = { success: "#10b981", warning: "#f59e0b", danger: "#ef4444" };
const BUCKET_PALETTE = ["#6366f1", "#0ea5e9", "#14b8a6", "#a855f7", "#f97316", "#ec4899", "#64748b", "#84cc16"];
function bucketColor(bucket, index) {
  return TONE_COLORS[bucket.tone] || BUCKET_PALETTE[index % BUCKET_PALETTE.length];
}

// A small SVG donut for one status breakdown — circles with dash offsets, no chart library.
function Donut({ buckets, total, size = 132, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offsets = buckets.reduce((acc, b, i) => [...acc, i === 0 ? 0 : acc[i - 1] + (buckets[i - 1].count / total) * c], []);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rt-canvas)" strokeWidth={stroke} />
        {buckets.map((b, i) => {
          const len = (b.count / total) * c;
          return (
            <circle key={b.value} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bucketColor(b, i)} strokeWidth={stroke}
              strokeDasharray={`${Math.max(len - 2, 0.5)} ${c}`} strokeDashoffset={-offsets[i]} />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{total.toLocaleString()}</div>
        <div style={{ fontSize: 11.5, color: "var(--rt-muted)" }}>total</div>
      </div>
    </div>
  );
}

// GitHub's mark (lucide no longer ships brand icons).
function GithubMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

// publicSlug set = this is a published app at /a/:slug, used by its real end users: the same Run
// mode UI, talking to the public API with the app's own session, with all builder chrome removed.
export default function RuntimeEngine({ publicSlug = null }) {
  const isPublic = !!publicSlug;
  const http = isPublic ? publicClientFor(publicSlug) : api;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const appPath = isPublic ? `/public-apps/${publicSlug}` : `/runtime-applications/${selectedId}`;
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Which workspace section is showing — one value instead of the old showDescribePanel/
  // showErMap/showFullXml/showAuditLog flags, which had to be kept mutually exclusive by hand.
  // "elements" browses the raw elements of activeTag.
  const [section, setSection] = useState("overview"); // overview | describe | ask | er | xml | audit | elements
  const [activeTag, setActiveTag] = useState("Entity");
  const [activeElement, setActiveElement] = useState(null); // { tag, name, xml }
  const [auditEvents, setAuditEvents] = useState(null);
  const [showXmlInReview, setShowXmlInReview] = useState(false);
  // A question handed to the Ask panel from elsewhere (an Overview entity card) — see AskPanel.
  const [askSeed, setAskSeed] = useState(null);
  const [showAskDrawer, setShowAskDrawer] = useState(false);

  // The "Describe your application" panel — works identically for a brand-new, empty application
  // and for adding more to an existing one later (one entity now, more later; screens now or
  // later): generate always sends the CURRENT full xml as existingXml, so the AI reworks it in
  // place rather than starting over, then an explicit "Apply" persists it via PUT.
  const [genDescription, setGenDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [pendingXml, setPendingXml] = useState(null); // generated, not yet applied
  const [applying, setApplying] = useState(false);

  const [runFieldValues, setRunFieldValues] = useState({});
  const [runMessages, setRunMessages] = useState([]);
  const [running, setRunning] = useState(false);
  const [gridRows, setGridRows] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [gridSort, setGridSort] = useState({ bind: null, dir: "asc" });
  const [gridPage, setGridPage] = useState(1);
  const [gridPageSize, setGridPageSize] = useState(10);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMoreNav, setShowMoreNav] = useState(false);
  // Per-entity choice of list view (table/board/calendar/gallery/timeline), and the month the
  // calendar view is showing — presentation only, never saved.
  const [viewByEntity, setViewByEntity] = useState({});
  const [publicUnavailable, setPublicUnavailable] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleResult, setSampleResult] = useState(null); // { created, skipped, firstProblem } after filling
  const [inviteInfo, setInviteInfo] = useState(null); // { token, email } when opened from a personal invite link
  const [calMonth, setCalMonth] = useState(null);
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
  const [moduleCounts, setModuleCounts] = useState({}); // entityName -> "loading" | number, for the nav's counts
  const [moduleRows, setModuleRows] = useState({}); // entityName -> "loading" | row[] | null, what the Dashboard's insights read
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

  // Only for the header's project switcher — the project list itself lives on Home now.
  function loadApplications() {
    return api.get("/runtime-applications").then((res) => setApplications(res.data)).catch(() => setApplications([]));
  }

  useEffect(() => { if (!isPublic) loadApplications(); }, []);

  // Home's "Generate app" hands its description over as location.state.autoDescribe — consumed
  // exactly once (the ref also covers StrictMode's double effect run), then cleared from history
  // so a refresh doesn't generate again.
  const autoDescribeHandledRef = useRef(false);

  // The overrides exist for Home's auto-describe handoff, which calls this in the same tick it
  // sets genDescription/detail — before either state update would be visible here.
  function handleGenerate(descriptionOverride, detailOverride) {
    const description = (typeof descriptionOverride === "string" ? descriptionOverride : genDescription).trim();
    const d = detailOverride || detail;
    if (!description) {
      setGenError("Describe what you'd like to build or change first.");
      return;
    }
    setGenerating(true);
    setGenError("");
    setPendingXml(null);
    setShowXmlInReview(false);
    const existingXml = d && d.elements.length > 0 ? buildFullXml(d) : undefined;
    api.post("/runtime-applications/generate", { description, existingXml })
      .then((res) => setPendingXml(res.data.xml))
      .catch((e) => setGenError(e.response?.data?.message || e.response?.data?.detail || "Failed to generate — try rephrasing the description."))
      .finally(() => setGenerating(false));
  }

  function selectApplication(id) {
    setSelectedId(id);
    setDetail(null);
    setActiveElement(null);
    setRunMessages([]);
    setSection("overview");
    setAuditEvents(null);
    setShowAskDrawer(false);
    setAskSeed(null);
    setSampleResult(null);
    setGenDescription(""); setGenError(""); setPendingXml(null); setShowXmlInReview(false);
    setLoggedIn(false); setLoggedInIdentity(null); setLoggedInRole(null); setMustChangePassword(false);
    setRunMode(false);
    setDetailLoading(true);
    const autoDescribe = location.state?.autoDescribe;
    api.get(`/runtime-applications/${id}`)
      .then((res) => {
        setDetail(res.data);
        setActiveTag("Entity");
        if (autoDescribe && res.data.elements.length === 0 && !autoDescribeHandledRef.current) {
          autoDescribeHandledRef.current = true;
          navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
          setSection("describe");
          setGenDescription(autoDescribe);
          handleGenerate(autoDescribe, res.data);
          return;
        }
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
      setSection("describe");
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

  // Leaving Run mode lands on the workspace Overview — never on whatever Screen (often Login)
  // happened to be open inside the running app.
  function exitRunMode() {
    setRunMode(false);
    setActiveElement(null);
    setShowAskDrawer(false);
    setSection("overview");
  }

  function goToSection(next) {
    setSection(next);
    setActiveElement(null);
    if (next === "audit") loadAuditLog();
  }

  function askAbout(question) {
    setSection("ask");
    setActiveElement(null);
    setAskSeed(question);
  }

  // Record counts for the Dashboard's stat cards — one small request per module's entity, fired
  // in parallel; each card updates independently as its own count arrives.
  // The rows themselves are kept too (not just their count) — the Dashboard builds its
  // app-specific widgets (status breakdowns, upcoming items, totals) from them.
  function loadModuleCounts(appId, modules) {
    setModuleCounts(Object.fromEntries(modules.map((m) => [m.key, "loading"])));
    setModuleRows(Object.fromEntries(modules.map((m) => [m.key, "loading"])));
    modules.forEach((m) => {
      http.get(`${isPublic ? `/public-apps/${publicSlug}` : `/runtime-applications/${appId}`}/entities/${m.key}/rows`)
        .then((res) => {
          setModuleCounts((c) => ({ ...c, [m.key]: res.data.rows.length }));
          setModuleRows((r) => ({ ...r, [m.key]: res.data.rows }));
        })
        .catch(() => {
          setModuleCounts((c) => ({ ...c, [m.key]: null }));
          setModuleRows((r) => ({ ...r, [m.key]: null }));
        });
    });
  }

  // Fills an empty app with AI-made example records, from the Run-mode bar or the Overview.
  function addSampleData() {
    setSampleBusy(true);
    setError("");
    return api.post(`/runtime-applications/${selectedId}/sample-data`)
      .then((res) => {
        setSampleResult(res.data);
        if (runMode) openDashboard();
      })
      .catch((e) => setError(typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Couldn't create sample data — try again."))
      .finally(() => setSampleBusy(false));
  }

  function removeSampleData() {
    if (!window.confirm("Remove the sample records? Any edits you made to them are lost.")) return;
    setSampleBusy(true);
    api.delete(`/runtime-applications/${selectedId}/sample-data`)
      .then(() => setSampleResult(null))
      .catch(() => setError("Couldn't remove the sample data — try again."))
      .finally(() => setSampleBusy(false));
  }

  // Back to the Dashboard with fresh data — records may have been added/edited since it loaded.
  function openDashboard() {
    setActiveElement(null);
    if (selectedId && detail) loadModuleCounts(selectedId, buildAppModules(detail, loggedInRole));
  }

  // Owner-only read-back of the security/audit log (see auditLog.ts) — logins, registrations,
  // deletes, restores, and RBAC denials for this application.
  function loadAuditLog() {
    setAuditEvents(null);
    api.get(`/runtime-applications/${selectedId}/audit-log`)
      .then((res) => setAuditEvents(res.data.events))
      .catch(() => setAuditEvents([]));
  }

  // Deep-link from Home's project grid (/runtime-engine?id=123) straight into that application's
  // workspace. With no id there's nothing to show here — the project list lives on Home.
  useEffect(() => {
    if (isPublic) return;
    const idParam = searchParams.get("id");
    // Same deliberate exception as the GitHub callback effect below: this reacts to an external
    // signal (the URL changing — a card click on Home, or the header's project switcher).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (idParam) selectApplication(Number(idParam));
    else navigate("/", { replace: true });
  }, [searchParams]);

  // Finds the one Entity marked isAccount="true" (always "User" by convention) — present only on
  // applications with real end-user accounts.
  function findAccountEntityEl(d) {
    return d?.elements.find((e) => e.tag === "Entity" && parseEntityForRun(e.xml).isAccount) || null;
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
        setGenDescription(""); setPendingXml(null); setShowXmlInReview(false); setSection("overview"); setShowFixModal(false);
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
    if (isPublic) { clearAppToken(publicSlug); setModuleRows({}); setModuleCounts({}); loadPublicApp(); return; }
    if (!selectedId) return;
    setLoggingOut(true);
    api.post(`/runtime-applications/${selectedId}/auth/logout`)
      .finally(() => {
        setLoggingOut(false);
        setLoggedIn(false); setLoggedInIdentity(null); setLoggedInRole(null); setMustChangePassword(false);
        const loginEl = detail?.elements.find((e) => e.tag === "Screen" && e.name === "Login");
        if (runMode && loginEl) openElement(loginEl); else setActiveElement(null);
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
    http.post(`${appPath}/uploads`, formData)
      .then((res) => setRunFieldValues((cur) => ({ ...cur, [bind]: res.data.url })))
      .catch((e) => setError(e.response?.data?.message || e.response?.data?.detail || "Image upload failed."))
      .finally(() => setUploadingFields((u) => ({ ...u, [bind]: false })));
  }

  function deleteApplication(id) {
    if (!window.confirm("Delete this application? This can't be undone.")) return;
    api.delete(`/runtime-applications/${id}`)
      .then(() => navigate("/"))
      .catch(() => setError("Failed to delete this application."));
  }

  function loadGridRows(entityName, includeDeleted) {
    setGridLoading(true);
    http.get(`${appPath}/entities/${entityName}/rows`, { params: includeDeleted ? { includeDeleted: "true" } : {} })
      .then((res) => setGridRows(res.data.rows))
      .catch(() => { setGridRows([]); setError("Failed to load this entity's rows."); })
      .finally(() => setGridLoading(false));
  }

  function restoreGridRow(entityName, row, keyField) {
    const key = row[keyField];
    setRestoringKey(key);
    http.post(`${appPath}/entities/${entityName}/rows/${encodeURIComponent(key)}/restore`)
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
    http.get(`${appPath}/datasources/${dsName}/options`)
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
    setGridPage(1);
    setShowUserMenu(false);
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

  // A published app's definition is filtered per viewer by the server, so it's fetched again
  // whenever the session changes (sign-in, sign-out) rather than kept from the anonymous load.
  function loadPublicApp() {
    return http.get(`/public-apps/${publicSlug}`)
      .then((res) => {
        const d = res.data;
        setDetail(d);
        setSelectedId(d.id);
        setRunMode(true);
        setRunMessages([]);
        const session = d.session;
        setLoggedIn(!!session);
        setLoggedInIdentity(session?.identity ?? null);
        setLoggedInRole(session?.role ?? null);
        setMustChangePassword(session?.mustChangePassword === true);
        const screenNamed = (name) => d.elements.find((e) => e.tag === "Screen" && e.name === name);
        if (!session) {
          clearAppToken(publicSlug);
          const loginEl = screenNamed("Login");
          const signupEl = screenNamed("Signup");
          const token = new URLSearchParams(window.location.search).get("invite");
          if (!loginEl) setPublicUnavailable(true);
          else if (token && signupEl) {
            http.get(`/public-apps/${publicSlug}/invite-check`, { params: { token } })
              .then((r) => { setInviteInfo({ token, email: r.data.email }); openElement(signupEl, { email: r.data.email }); })
              .catch(() => {
                openElement(loginEl);
                setRunMessages([{ type: "message", messageType: "error", value: "This invitation link has expired or was already used. Ask for a new one." }]);
              });
          } else openElement(loginEl);
        } else if (session.mustChangePassword && screenNamed("ChangePassword")) {
          openElement(screenNamed("ChangePassword"));
        } else {
          setActiveElement(null);
          loadModuleCounts(d.id, buildAppModules(d, session.role));
        }
      })
      .catch((e) => { if (e.response?.status !== 401) setPublicUnavailable(true); });
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the app when the page opens
  useEffect(() => { if (isPublic) loadPublicApp(); }, []);

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
    return http.post(`${appPath}/screens/${activeElement.name}/run`, {
      elementId: action, action, fieldValues,
      ...(action === "register" && inviteInfo ? { inviteToken: inviteInfo.token } : {}),
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
        if (session && isPublic) {
          setAppToken(publicSlug, res.data.appToken);
          setInviteInfo(null);
          window.history.replaceState(null, "", window.location.pathname);
          loadPublicApp();
          return resultActions;
        }
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
            loadModuleCounts(selectedId, buildAppModules(detail, session.role ?? null));
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
    http.get(`${appPath}/entities/${screenForRun.entity}/rows/${encodeURIComponent(key)}`)
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

  // ===== Generated-app UI (Run mode) =====
  // Everything below renders the app an END USER of the generated application sees — a light,
  // professional business UI branded by the app's own <Theme> (see runtimeApp.css), not the
  // Studio's dark chrome. The Theme's values become CSS variables on the .rt-app root; every
  // screen reads them through classes, so one Theme change restyles the whole app.
  // The app's whole visual system — layout, nav paint, fonts, shape, cards, tables, header,
  // sign-in layout, light/dark — from its <Theme><Layout> or, for older apps, its domain (see
  // designProfile.js). This is what keeps every generated app from looking like one template.
  const design = resolveDesign(detail, theme);
  const { className: rtClass, style: rtVars } = designToCss(design);
  useDesignFonts(design.bodyFont, design.headingFont);
  const screenEntityIcon = screenEntityDef ? parseEntityForRun(screenEntityDef.xml).icon : null;
  const gridScreenForEntity = (entityName) =>
    detail?.elements.find((e) => e.tag === "Screen" && !AUTH_SCREEN_NAMES.has(e.name) && parseScreenForRun(e.xml).grid?.entity === entityName) || null;

  function renderRunMessages() {
    if (runMessages.length === 0) return null;
    return (
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {runMessages.map((m, i) => {
          const kind = m.messageType === "error" ? "error" : m.messageType === "conflict" ? "warning" : "info";
          const Icon = kind === "error" ? AlertCircle : kind === "warning" ? AlertTriangle : Info;
          return (
            <div key={i} className={`rt-alert ${kind}`} style={{ alignItems: "center" }}>
              <Icon size={16} />
              <span style={{ flex: 1 }}>{m.value}</span>
              {m.messageType === "conflict" && (
                <button className="rt-btn rt-btn-secondary rt-btn-sm" onClick={reloadLatestRow}><RotateCcw size={13} /> Reload latest</button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // A table cell, typed by the Entity's own field definition — status-like enums become colored
  // badges, dates/numbers are formatted, images become avatars, the first column carries an
  // initials avatar so a row is recognizable at a glance.
  function renderGridCell(row, c, isFirst) {
    const isFk = !!fkColumnMap[c.bind];
    const raw = isFk ? (optionLabel(fkColumnMap[c.bind], row[c.bind]) ?? row[c.bind]) : row[c.bind];
    const type = isFk ? "fk" : screenEntityFields.find((fd) => fd.name === c.bind)?.type;
    if (type === "image") {
      return raw
        ? <img className="rt-avatar" src={`${API_ORIGIN}${raw}`} alt="" />
        : <span className="rt-avatar" style={{ background: "#f1f5f9", color: "#94a3b8" }}><ImageIcon size={14} /></span>;
    }
    if (raw == null || raw === "") return <span style={{ color: "#cbd5e1" }}>—</span>;
    if (type === "enum") return <span className={`rt-badge ${toneForValue(raw)}`}>{String(raw)}</span>;
    if (type === "boolean") {
      const yes = raw === true || raw === "true";
      return <span className={`rt-badge plain ${yes ? "success" : "neutral"}`}>{yes ? <Check size={12} strokeWidth={3} /> : null}{yes ? "Yes" : "No"}</span>;
    }
    if (type === "date") return formatDate(raw);
    if (type === "integer" || type === "decimal") return formatNumber(raw, type);
    if (isFirst) {
      const [bg, fg] = avatarColors(raw);
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span className="rt-avatar" style={{ background: bg, color: fg }}>{initialsFor(String(raw))}</span>
          {String(raw)}
        </span>
      );
    }
    return String(raw);
  }

  function renderGridScreen(embedded) {
    const entity = screenForRun.grid.entity || screenForRun.entity;
    const label = humanize(entity);
    const plural = pluralize(label);
    const columns = screenForRun.grid.columns;
    // The ONLY way a brand-new record ever gets created — the grid's own paired form screen,
    // opened blank (no prefill) rather than pre-filled from a clicked row.
    const newRecordScreenName = screenForRun.grid.rowClick?.targetScreen;
    const newRecordEl = newRecordScreenName ? detail.elements.find((e) => e.tag === "Screen" && e.name === newRecordScreenName) : null;
    const openNewRecordForm = () => { if (newRecordEl) openElement(newRecordEl); };
    const fieldTypeOf = (bind) => (fkColumnMap[bind] ? "string" : screenEntityFields.find((fd) => fd.name === bind)?.type);
    const total = visibleGridRows?.length || 0;
    const pageCount = Math.max(1, Math.ceil(total / gridPageSize));
    const page = Math.min(gridPage, pageCount);
    const pageRows = visibleGridRows ? visibleGridRows.slice((page - 1) * gridPageSize, page * gridPageSize) : [];
    const exportCsv = () => {
      const rows = (visibleGridRows || []).map((row) => columns.map((c) => {
        const raw = fkColumnMap[c.bind] ? (optionLabel(fkColumnMap[c.bind], row[c.bind]) ?? row[c.bind]) : row[c.bind];
        return displayText(raw, fieldTypeOf(c.bind));
      }));
      downloadTextFile(`${plural.replace(/\s+/g, "-").toLowerCase()}.csv`, toCsv(columns.map((c) => c.header), rows), "text/csv");
    };
    const numericBind = (bind) => ["integer", "decimal"].includes(fieldTypeOf(bind));

    // Which views this entity's fields support, and which one is showing — the user's pick if
    // they made one, else the one that fits the data (photos → gallery, dated → calendar…).
    const vf = viewFields(screenEntityFields);
    const views = availableViews(vf);
    const suggested = defaultView(vf, entity);
    const view = views.includes(viewByEntity[entity]) ? viewByEntity[entity] : views.includes(suggested) ? suggested : "table";
    const VIEW_ICONS = { table: TableIcon, board: Columns3, calendar: CalendarDays, gallery: LayoutGrid, timeline: History };
    const rowTarget = screenForRun.grid.rowClick?.targetScreen;
    const openRecord = (row) => { if (!row.__deletedAt && rowTarget) openRowForEdit(rowTarget, row); };
    const titleOf = (row) => rowLabel(screenEntityFields, row) || label;
    const detailColumnsFor = (row) => columns
      .filter((c) => c.bind !== vf.status?.name && c.bind !== vf.image?.name && String(row[c.bind] ?? "") !== titleOf(row))
      .slice(0, 3);
    const statusBadge = (row) => (vf.status && row[vf.status.name]
      ? <span className={`rt-badge ${toneForValue(row[vf.status.name])}`}>{row[vf.status.name]}</span> : null);
    const recordCard = (row, i, { showStatus = true } = {}) => (
      <button key={row[screenKeyField] ?? i} type="button" className={`rt-rec${row.__deletedAt ? " deleted" : ""}`} onClick={() => openRecord(row)}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div className="rt-rec-title">{titleOf(row)}</div>
          {showStatus && statusBadge(row)}
        </div>
        <div className="rt-rec-meta">
          {detailColumnsFor(row).map((c) => (
            <div key={c.bind}><span className="k">{c.header}</span><span className="v">{renderGridCell(row, c, false)}</span></div>
          ))}
        </div>
      </button>
    );
    const rows = visibleGridRows || [];

    const content = (
      <div className="rt-fade">
        <div className="rt-page-head">
          <div className="rt-page-icon"><ModuleIcon entity={entity} icon={screenEntityIcon} size={22} /></div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="rt-page-title">{plural}</h1>
            <div className="rt-page-sub">
              {gridRows ? `${gridRows.length} ${gridRows.length === 1 ? "record" : "records"}${showDeleted ? " · including deleted" : ""}` : "Loading records…"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="rt-btn rt-btn-secondary" onClick={exportCsv} disabled={!total}><Download size={15} /> Export</button>
            {newRecordEl && <button className="rt-btn rt-btn-primary" onClick={openNewRecordForm}><Plus size={16} strokeWidth={2.4} /> New {label}</button>}
          </div>
        </div>

        {successMessage && <div className="rt-alert success" style={{ marginBottom: 16 }}><CheckCircle2 size={16} /> {successMessage}</div>}

        <div className="rt-card" style={{ overflow: "hidden" }}>
          <div className="rt-toolbar">
            <div className="rt-search" style={{ width: 340 }}>
              <Search size={15} />
              <input className="rt-input" value={gridSearch} onChange={(e) => { setGridSearch(e.target.value); setGridPage(1); }} placeholder={`Search ${plural.toLowerCase()}…`} />
            </div>
            <div style={{ flex: 1 }} />
            {views.length > 1 && (
              <div className="rt-seg" role="tablist" aria-label="View">
                {views.map((v) => {
                  const Icon = VIEW_ICONS[v];
                  return (
                    <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => setViewByEntity((cur) => ({ ...cur, [entity]: v }))} title={VIEW_LABELS[v]}>
                      <Icon size={15} /> <span>{VIEW_LABELS[v]}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <label className="rt-switch">
              <input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setGridPage(1); loadGridRows(screenForRun.grid.entity, e.target.checked); }} />
              <span className="track" /> Show deleted
            </label>
          </div>

          {gridLoading && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="rt-skel" style={{ height: 18, width: `${92 - i * 9}%` }} />)}
            </div>
          )}

          {!gridLoading && gridRows?.length === 0 && (
            <div className="rt-empty">
              <div className="rt-empty-icon"><ModuleIcon entity={entity} icon={screenEntityIcon} size={28} /></div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>No {plural.toLowerCase()} yet</div>
              <div style={{ color: "var(--rt-muted)", fontSize: 13.5, margin: "6px 0 20px" }}>
                {newRecordEl ? `Create your first ${label.toLowerCase()} to get started.` : "Records will appear here once they're added."}
              </div>
              {newRecordEl && <button className="rt-btn rt-btn-primary" onClick={openNewRecordForm}><Plus size={16} /> New {label}</button>}
            </div>
          )}

          {!gridLoading && gridRows?.length > 0 && total === 0 && (
            <div className="rt-empty" style={{ padding: "44px 24px" }}>
              <div style={{ fontWeight: 600 }}>No results for "{gridSearch}"</div>
              <div style={{ color: "var(--rt-muted)", fontSize: 13, marginTop: 4 }}>Try a different search term.</div>
              <button className="rt-btn rt-btn-ghost" style={{ marginTop: 12 }} onClick={() => setGridSearch("")}>Clear search</button>
            </div>
          )}

          {/* ----- Board: one column per status value ----- */}
          {!gridLoading && total > 0 && view === "board" && (() => {
            const values = [...vf.status.values];
            if (rows.some((r) => !r[vf.status.name])) values.push("");
            return (
              <div className="rt-board">
                {values.map((value) => {
                  const items = rows.filter((r) => (r[vf.status.name] || "") === value);
                  return (
                    <div key={value || "none"} className="rt-board-col">
                      <div className="rt-board-head">
                        <span className={`rt-badge ${value ? toneForValue(value) : "neutral"}`}>{value || `No ${humanize(vf.status.name).toLowerCase()}`}</span>
                        <span className="rt-board-count">{items.length}</span>
                      </div>
                      <div className="rt-board-list">
                        {items.map((row, i) => recordCard(row, i, { showStatus: false }))}
                        {items.length === 0 && <div className="rt-board-empty">Nothing here</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ----- Calendar: a month grid of records by their date ----- */}
          {!gridLoading && total > 0 && view === "calendar" && (() => {
            const today = new Date();
            const cur = calMonth || { y: today.getFullYear(), m: today.getMonth() };
            const cells = monthGrid(cur.y, cur.m);
            const byDay = new Map();
            for (const r of rows) {
              const k = dateKey(r[vf.date.name]);
              if (!k) continue;
              if (!byDay.has(k)) byDay.set(k, []);
              byDay.get(k).push(r);
            }
            const todayKey = dateKey(today);
            const shift = (n) => { const d = new Date(cur.y, cur.m + n, 1); setCalMonth({ y: d.getFullYear(), m: d.getMonth() }); };
            return (
              <div className="rt-cal">
                <div className="rt-cal-bar">
                  <div className="rt-heading" style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>
                    {new Date(cur.y, cur.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--rt-muted)" }}>By {humanize(vf.date.name).toLowerCase()}</span>
                  <button className="rt-btn rt-btn-secondary rt-btn-sm" onClick={() => setCalMonth(null)}>Today</button>
                  <button className="rt-icon-btn sm" onClick={() => shift(-1)} title="Previous month"><ChevronLeft size={16} /></button>
                  <button className="rt-icon-btn sm" onClick={() => shift(1)} title="Next month"><ChevronRight size={16} /></button>
                </div>
                <div className="rt-cal-grid">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="rt-cal-dow">{d}</div>)}
                  {cells.map((c) => {
                    const items = byDay.get(c.key) || [];
                    return (
                      <div key={c.key} className={`rt-cal-cell${c.inMonth ? "" : " out"}${c.key === todayKey ? " today" : ""}`}>
                        <div className="rt-cal-num">{c.date.getDate()}</div>
                        {items.slice(0, 3).map((r, i) => (
                          <button key={r[screenKeyField] ?? i} type="button" className={`rt-cal-chip ${vf.status ? toneForValue(r[vf.status.name]) : "info"}`} onClick={() => openRecord(r)} title={titleOf(r)}>
                            {titleOf(r)}
                          </button>
                        ))}
                        {items.length > 3 && (
                          <button type="button" className="rt-cal-more" onClick={() => setViewByEntity((cur2) => ({ ...cur2, [entity]: "timeline" }))}>+{items.length - 3} more</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ----- Gallery: photo cards ----- */}
          {!gridLoading && total > 0 && view === "gallery" && (
            <div className="rt-gallery">
              {rows.map((row, i) => {
                const img = row[vf.image.name];
                const [bg, fg] = avatarColors(titleOf(row));
                return (
                  <button key={row[screenKeyField] ?? i} type="button" className={`rt-gal-card${row.__deletedAt ? " deleted" : ""}`} onClick={() => openRecord(row)}>
                    <div className="rt-gal-img" style={img ? undefined : { background: bg, color: fg }}>
                      {img ? <img src={`${API_ORIGIN}${img}`} alt="" /> : <span>{initialsFor(titleOf(row))}</span>}
                      {statusBadge(row) && <div className="rt-gal-badge">{statusBadge(row)}</div>}
                    </div>
                    <div style={{ padding: "12px 14px 14px" }}>
                      <div className="rt-rec-title">{titleOf(row)}</div>
                      <div className="rt-rec-meta">
                        {detailColumnsFor(row).slice(0, 2).map((c) => (
                          <div key={c.bind}><span className="k">{c.header}</span><span className="v">{renderGridCell(row, c, false)}</span></div>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ----- Timeline: records grouped by day, newest first ----- */}
          {!gridLoading && total > 0 && view === "timeline" && (() => {
            const groups = groupByDay(rows, vf.date.name);
            const todayKey = dateKey(new Date());
            return (
              <div className="rt-timeline">
                {groups.length === 0 && <div className="rt-board-empty" style={{ padding: 30 }}>No dated records to show.</div>}
                {groups.map((g) => {
                  const d = new Date(`${g.key}T00:00:00`);
                  const diff = Math.round((d - new Date(`${todayKey}T00:00:00`)) / 86400000);
                  const rel = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : null;
                  return (
                    <div key={g.key} className="rt-tl-group">
                      <div className="rt-tl-date">
                        <span className="rt-heading">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                        {rel && <span className="rt-badge plain info" style={{ marginLeft: 8 }}>{rel}</span>}
                      </div>
                      <div className="rt-tl-items">{g.items.map((row, i) => recordCard(row, i))}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {!gridLoading && total > 0 && view === "table" && (
            <>
              <div className="rt-table-wrap">
                <table className="rt-table">
                  <thead>
                    <tr>
                      {columns.map((c) => {
                        const sorted = gridSort.bind === c.bind;
                        return (
                          <th key={c.bind} className={`sortable${sorted ? " sorted" : ""}${numericBind(c.bind) ? " num" : ""}`} onClick={() => toggleSort(c.bind)}>
                            {c.header}
                            <span className="sort-ind">{sorted ? (gridSort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ArrowUpDown size={12} />}</span>
                          </th>
                        );
                      })}
                      <th style={{ width: 1 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => {
                      const editable = !row.__deletedAt && screenForRun.grid.rowClick?.targetScreen;
                      return (
                        <tr key={row[screenKeyField] ?? i} className={`${editable ? "clickable" : ""}${row.__deletedAt ? " deleted" : ""}`}
                          onClick={() => editable && openRowForEdit(screenForRun.grid.rowClick.targetScreen, row)}>
                          {columns.map((c, ci) => (
                            <td key={c.bind} className={`${ci === 0 ? "primary-cell" : ""}${numericBind(c.bind) ? " num" : ""}`}>{renderGridCell(row, c, ci === 0)}</td>
                          ))}
                          <td className="actions" onClick={(e) => e.stopPropagation()}>
                            {row.__deletedAt ? (
                              <button className="rt-btn rt-btn-secondary rt-btn-sm" onClick={() => restoreGridRow(screenForRun.grid.entity, row, screenKeyField)} disabled={restoringKey === row[screenKeyField]}>
                                <RotateCcw size={13} /> {restoringKey === row[screenKeyField] ? "Restoring…" : "Restore"}
                              </button>
                            ) : (
                              <span className="rt-row-actions">
                                {editable && <button className="rt-icon-btn sm" title="Edit" onClick={() => openRowForEdit(screenForRun.grid.rowClick.targetScreen, row)}><Pencil size={14} /></button>}
                                <button className="rt-icon-btn sm danger" title="Delete" onClick={() => deleteGridRow(row, screenKeyField)}><Trash2 size={14} /></button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rt-pager">
                <span>Showing <strong style={{ color: "var(--rt-text)" }}>{(page - 1) * gridPageSize + 1}–{Math.min(page * gridPageSize, total)}</strong> of <strong style={{ color: "var(--rt-text)" }}>{total}</strong></span>
                <div style={{ flex: 1 }} />
                <span>Rows</span>
                <select className="rt-input" value={gridPageSize} onChange={(e) => { setGridPageSize(Number(e.target.value)); setGridPage(1); }} style={{ width: 76, padding: "5px 28px 5px 10px", fontSize: 12.5 }}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button className="rt-icon-btn sm" onClick={() => setGridPage(page - 1)} disabled={page <= 1} title="Previous page" style={{ opacity: page <= 1 ? 0.4 : 1 }}><ChevronLeft size={16} /></button>
                <span>Page {page} of {pageCount}</span>
                <button className="rt-icon-btn sm" onClick={() => setGridPage(page + 1)} disabled={page >= pageCount} title="Next page" style={{ opacity: page >= pageCount ? 0.4 : 1 }}><ChevronRight size={16} /></button>
              </div>
            </>
          )}
        </div>
        {renderRunMessages()}
      </div>
    );
    if (embedded) return content;
    return (
      <div className={`${rtClass} rt-frame`} style={rtVars}>
        <AppBar theme={theme} appName={detail.name} />
        <div style={{ padding: 24 }}>
          <button className="rt-btn rt-btn-ghost rt-btn-sm" onClick={() => setActiveElement(null)} style={{ marginBottom: 14 }}><ArrowLeft size={14} /> Back to {activeElement.tag === "Screen" ? "screens" : "Studio"}</button>
          {content}
        </div>
      </div>
    );
  }

  // One input for one UIField, typed by the Entity's field definition. Shared by the normal form
  // page and the sign-in screens, so both get identical, real controls.
  function renderFieldControl(f) {
    const fieldDef = screenEntityFields.find((fd) => fd.name === f.bind);
    const value = runFieldValues[f.bind] ?? "";
    const setValue = (v) => setRunFieldValues((cur) => ({ ...cur, [f.bind]: v }));
    // password/currentPassword/newPassword are submitted-only (never real Fields on User — see
    // aiService.ts's prompt) so fieldDef is always undefined for them; mask them regardless.
    const isPasswordField = /password/i.test(f.bind || "");
    const isLongText = !fieldDef?.type || fieldDef.type === "string"
      ? /(description|notes?|comments?|address|remarks|details|message|reason|summary|diagnosis|prescription|instructions|bio|feedback)$/i.test(f.bind || "")
      : false;
    const id = `rtf-${f.bind}`;
    let control;
    let span2 = isLongText;
    if (isPasswordField) {
      control = <input id={id} className="rt-input" type="password" autoComplete={f.bind === "password" ? "current-password" : "new-password"} value={value} onChange={(e) => setValue(e.target.value)} placeholder="••••••••" />;
    } else if (fieldDef?.type === "image") {
      span2 = true;
      const uploading = uploadingFields[f.bind];
      control = (
        <div className="rt-upload">
          {value ? <img src={`${API_ORIGIN}${value}`} alt="" /> : <div className="ph"><ImageIcon size={22} /></div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{value ? "Change photo" : "Upload a photo"}</div>
            <div style={{ fontSize: 12, color: "var(--rt-muted)", marginTop: 2 }}>PNG, JPG, GIF or WebP</div>
          </div>
          <label className="rt-btn rt-btn-secondary rt-btn-sm" style={{ cursor: f.readonly || uploading ? "default" : "pointer", opacity: f.readonly ? 0.5 : 1 }}>
            {uploading ? <span className="spinner" style={{ width: 13, height: 13, color: "var(--rt-primary)" }} /> : <Upload size={14} />} {uploading ? "Uploading…" : "Choose file"}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" disabled={f.readonly || uploading} hidden
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(f.bind, file); }} />
          </label>
        </div>
      );
    } else if (f.control === "dropdown" && f.optionsFrom) {
      control = <LookupPicker value={value} options={optionsCache[f.optionsFrom]} disabled={f.readonly} placeholder={`Select ${humanize(f.label || f.bind).toLowerCase()}…`} onChange={setValue} />;
    } else if (fieldDef?.type === "enum" && fieldDef.values.length > 0) {
      control = (
        <select id={id} className="rt-input" disabled={f.readonly} value={value} onChange={(e) => setValue(e.target.value)} style={{ color: value ? undefined : "#94a3b8" }}>
          <option value="">Select…</option>
          {fieldDef.values.map((v) => <option key={v} value={v} style={{ color: "#0f172a" }}>{v}</option>)}
        </select>
      );
    } else if (fieldDef?.type === "boolean") {
      const checked = value === true || value === "true";
      control = (
        <label className="rt-switch" style={{ height: 40 }}>
          <input type="checkbox" disabled={f.readonly} checked={checked} onChange={(e) => setValue(e.target.checked)} />
          <span className="track" /> {checked ? "Yes" : "No"}
        </label>
      );
    } else if (fieldDef?.type === "date") {
      control = <input id={id} className="rt-input" type="date" disabled={f.readonly} value={value} onChange={(e) => setValue(e.target.value)} />;
    } else if (fieldDef?.type === "integer" || fieldDef?.type === "decimal") {
      control = <input id={id} className="rt-input" type="number" step={fieldDef.type === "decimal" ? "any" : "1"} disabled={f.readonly} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />;
    } else if (isLongText) {
      control = <textarea id={id} className="rt-input" rows={3} disabled={f.readonly} value={value} onChange={(e) => setValue(e.target.value)} style={{ resize: "vertical" }} />;
    } else {
      const isEmail = /email/i.test(f.bind || "");
      control = <input id={id} className="rt-input" type={isEmail ? "email" : "text"} disabled={f.readonly || (isEmail && !!inviteInfo)} value={value} onChange={(e) => setValue(e.target.value)} placeholder={isEmail ? "name@example.com" : ""} />;
    }
    return (
      <div key={f.bind} className={span2 ? "span-2" : undefined}>
        <label className="rt-label" htmlFor={id}>{f.label}{fieldDef?.required && <span className="req">*</span>}</label>
        {control}
      </div>
    );
  }

  // Button styling by what the action does — the screen's own XML decides WHICH buttons exist.
  const PRIMARY_ACTIONS = new Set(["save", "login", "register", "changePassword", "verifyEmail", "requestPasswordReset", "resetPassword"]);
  function buttonClassFor(action) {
    if (PRIMARY_ACTIONS.has(action)) return "rt-btn rt-btn-primary";
    if (action === "delete") return "rt-btn rt-btn-danger";
    return "rt-btn rt-btn-secondary";
  }
  // "cancel" is pure navigation (a built-in with no database work) — handled client-side as
  // "back to this entity's list", which is what a user expects it to do.
  function handleFormButton(b) {
    if (b.action === "cancel") {
      const gridEl = screenForRun?.entity && gridScreenForEntity(screenForRun.entity);
      if (gridEl && gridEl.name !== activeElement.name) openElement(gridEl); else setActiveElement(null);
      return;
    }
    runAction(b.action);
  }

  // Sign-in / sign-up / verify / reset — a split screen with the app's own brand panel, the way a
  // real product's login looks, instead of a bare form floating in the corner.
  function renderAuthScreen() {
    const name = activeElement.name;
    const onTabs = needsLoginGate && (name === "Login" || name === "Signup");
    const onPreLoginAux = needsLoginGate && PRE_LOGIN_AUX_SCREENS.has(name);
    const headings = {
      Login: ["Welcome back", `Sign in to your ${detail.name} account.`],
      Signup: ["Create your account", `Get started with ${detail.name} in a minute.`],
      VerifyEmail: ["Verify your email", "Enter the code we just emailed you."],
      ForgotPassword: ["Reset your password", "We'll email you a code to reset it."],
      ResetPassword: ["Choose a new password", "Enter the code from your email and a new password."],
      ChangePassword: ["Update your password", "Choose a new password to continue."],
    };
    const [title, sub] = headings[name] || [humanize(name), ""];
    const brandModules = buildAppModules(detail).slice(0, 4);
    return (
      <div className={`rt-auth ${design.auth}`}>
        <div className="rt-auth-brand">
          <div className="rt-auth-motif"><DomainMotif domain={design.domain} style={{ width: "100%", height: "auto", display: "block" }} /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
            {theme.logo
              ? <img src={theme.logo} alt="" style={{ height: 34 }} onError={(e) => { e.target.style.display = "none"; }} />
              : <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17 }}>{detail.name.charAt(0).toUpperCase()}</div>}
            <div style={{ fontWeight: 700, fontSize: 17 }}>{detail.name}</div>
          </div>
          <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
            <div className="rt-heading" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15 }}>Everything your team needs, in one place.</div>
            {brandModules.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
                {brandModules.map((m) => (
                  <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14.5, opacity: 0.95 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ModuleIcon entity={m.key} icon={m.icon} size={16} />
                    </span>
                    Manage {pluralize(m.label).toLowerCase()}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: "relative", zIndex: 1, fontSize: 12.5, opacity: 0.75, display: "flex", alignItems: "center", gap: 8 }}>
            <Lock size={13} /> Secure sign-in · Your data stays private
          </div>
        </div>
        <div className="rt-auth-form">
          <div className="rt-auth-card rt-fade">
            <div className="rt-auth-mini-brand">
              {theme.logo
                ? <img src={theme.logo} alt="" style={{ height: 30 }} onError={(e) => { e.target.style.display = "none"; }} />
                : <div className="rt-logo">{detail.name.charAt(0).toUpperCase()}</div>}
              {detail.name}
            </div>
            {onTabs && (
              <div className="rt-tabs">
                {["Login", "Signup"].map((n) => {
                  const screenEl = detail.elements.find((e) => e.tag === "Screen" && e.name === n);
                  return (
                    <button key={n} className={name === n ? "active" : ""} disabled={!screenEl}
                      onClick={() => { if (screenEl && name !== n) openElement(screenEl); else if (!screenEl) setError(`No ${n} screen found.`); }}>
                      {n === "Signup" ? "Create account" : "Sign in"}
                    </button>
                  );
                })}
              </div>
            )}
            <h1 className="rt-heading" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>{title}</h1>
            {sub && <div style={{ color: "var(--rt-muted)", fontSize: 14, marginTop: 6, marginBottom: 24 }}>{sub}</div>}
            {inviteInfo && name === "Signup" && (
              <div className="rt-alert info" style={{ marginBottom: 16 }}><Info size={16} /> You've been invited to {detail.name}. Create your account to join.</div>
            )}
            {name === "ChangePassword" && mustChangePassword && (
              <div className="rt-alert warning" style={{ marginBottom: 16 }}><AlertTriangle size={16} /> You must change your password before continuing.</div>
            )}
            {successMessage && <div className="rt-alert success" style={{ marginBottom: 16 }}><CheckCircle2 size={16} /> {successMessage}</div>}
            <form onSubmit={(e) => { e.preventDefault(); const primary = screenForRun.buttons.find((b) => PRIMARY_ACTIONS.has(b.action)); if (primary && !running) runAction(primary.action); }}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {screenForRun.fields.map((f) => renderFieldControl(f))}
              {name === "Login" && accountHasEmailIdentity && (
                <div style={{ marginTop: -6, textAlign: "right" }}>
                  <button type="button" className="rt-btn rt-btn-ghost rt-btn-sm" style={{ color: "var(--rt-primary)", padding: "2px 4px" }}
                    onClick={() => { const fpEl = detail.elements.find((e) => e.tag === "Screen" && e.name === "ForgotPassword"); if (fpEl) openElement(fpEl); else setError("No ForgotPassword screen found."); }}>
                    Forgot password?
                  </button>
                </div>
              )}
              {screenForRun.buttons.map((b) => (
                <button key={b.action} type={PRIMARY_ACTIONS.has(b.action) ? "submit" : "button"} className={buttonClassFor(b.action)} disabled={running}
                  onClick={PRIMARY_ACTIONS.has(b.action) ? undefined : () => handleFormButton(b)} style={{ width: "100%", padding: "11px 14px", fontSize: 14 }}>
                  {running && PRIMARY_ACTIONS.has(b.action) ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Please wait…</> : b.label}
                </button>
              ))}
            </form>
            {(name === "Login" || name === "Signup") && accountHasEmailIdentity && (
              <div style={{ marginTop: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, color: "var(--rt-muted)", fontSize: 12.5 }}>
                  <span style={{ flex: 1, height: 1, background: "var(--rt-border)" }} /> or continue with <span style={{ flex: 1, height: 1, background: "var(--rt-border)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <GoogleLogin
                    onSuccess={(credentialResponse) => runAction("googleLogin", { credential: credentialResponse.credential })}
                    onError={() => setRunMessages([{ type: "message", messageType: "error", value: "Google sign-in failed." }])}
                    theme="outline" size="large" width="400" text={name === "Signup" ? "signup_with" : "signin_with"}
                  />
                  {GITHUB_CLIENT_ID && (
                    <button type="button" className="rt-btn rt-btn-secondary" onClick={handleGithubOAuthClick} style={{ width: "100%", padding: "10px 14px" }}>
                      <GithubMark /> {name === "Signup" ? "Sign up with GitHub" : "Sign in with GitHub"}
                    </button>
                  )}
                </div>
              </div>
            )}
            {onPreLoginAux && (
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <button className="rt-btn rt-btn-ghost rt-btn-sm" onClick={() => { const loginEl = detail.elements.find((e) => e.tag === "Screen" && e.name === "Login"); if (loginEl) openElement(loginEl); }}>
                  <ArrowLeft size={14} /> Back to sign in
                </button>
              </div>
            )}
            {renderRunMessages()}
          </div>
        </div>
      </div>
    );
  }

  function renderFormScreen(embedded) {
    const name = activeElement.name;
    const isAuthScreen = AUTH_SCREEN_NAMES.has(name) && (needsLoginGate || (name === "ChangePassword" && mustChangePassword));
    if (isAuthScreen) {
      const auth = renderAuthScreen();
      return embedded ? auth : <div className={`${rtClass} rt-frame`} style={{ ...rtVars, display: "flex", minHeight: 560 }}>{auth}</div>;
    }
    const entity = screenForRun.entity;
    const label = entity ? humanize(entity) : humanize(name);
    const editing = !!runFieldValues[screenKeyField];
    const isChangePassword = name === "ChangePassword";
    const title = isChangePassword ? "Change password" : `${editing ? "Edit" : "New"} ${label}`;
    const sub = isChangePassword
      ? "Choose a new password for your account."
      : editing ? `Update this ${label.toLowerCase()}'s details and save your changes.` : `Fill in the details below to create a new ${label.toLowerCase()}.`;
    const backGrid = entity ? gridScreenForEntity(entity) : null;
    const deleteButton = editing ? screenForRun.buttons.find((b) => b.action === "delete") : null;
    const otherButtons = screenForRun.buttons.filter((b) => b !== deleteButton && (b.action !== "delete" || editing));
    const hasCancel = otherButtons.some((b) => b.action === "cancel");

    const content = (
      <div className="rt-fade" style={{ maxWidth: 900 }}>
        <div className="rt-page-head">
          <div className="rt-page-icon">
            {isChangePassword ? <KeyRound size={22} /> : <ModuleIcon entity={entity} icon={screenEntityIcon} size={22} />}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 className="rt-page-title">{title}</h1>
            <div className="rt-page-sub">{sub}</div>
          </div>
        </div>
        {successMessage && <div className="rt-alert success" style={{ marginBottom: 16 }}><CheckCircle2 size={16} /> {successMessage}</div>}
        <form className="rt-card" onSubmit={(e) => { e.preventDefault(); const primary = otherButtons.find((b) => PRIMARY_ACTIONS.has(b.action)); if (primary && !running) runAction(primary.action); }}>
          <div className="rt-card-head">
            <div style={{ flex: 1 }}>
              <div className="rt-card-title">{isChangePassword ? "Password" : `${label} details`}</div>
              <div className="rt-card-sub">Fields marked <span style={{ color: "#dc2626" }}>*</span> are required.</div>
            </div>
          </div>
          <div className="rt-form-grid">{screenForRun.fields.map((f) => renderFieldControl(f))}</div>
          <div className="rt-form-foot">
            {deleteButton && (
              <button type="button" className={buttonClassFor("delete")} disabled={running} onClick={() => handleFormButton(deleteButton)}>
                <Trash2 size={14} /> {deleteButton.label}
              </button>
            )}
            <div style={{ flex: 1 }} />
            {!hasCancel && backGrid && backGrid.name !== name && (
              <button type="button" className="rt-btn rt-btn-secondary" onClick={() => openElement(backGrid)}>Cancel</button>
            )}
            {otherButtons.map((b) => (
              <button key={b.action} type={PRIMARY_ACTIONS.has(b.action) ? "submit" : "button"} className={buttonClassFor(b.action)} disabled={running}
                onClick={PRIMARY_ACTIONS.has(b.action) ? undefined : () => handleFormButton(b)}>
                {running && PRIMARY_ACTIONS.has(b.action) ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : (
                  <>{b.action === "save" && <Check size={15} strokeWidth={2.5} />}{b.label}</>
                )}
              </button>
            ))}
          </div>
        </form>
        {renderRunMessages()}
      </div>
    );
    if (embedded) return content;
    return (
      <div className={`${rtClass} rt-frame`} style={rtVars}>
        <AppBar theme={theme} appName={detail.name} />
        <div style={{ padding: 24 }}>
          <button className="rt-btn rt-btn-ghost rt-btn-sm" onClick={() => setActiveElement(null)} style={{ marginBottom: 14 }}><ArrowLeft size={14} /> Back to screens</button>
          {content}
        </div>
      </div>
    );
  }

  // The Dashboard is built from THIS app's own structure and data (see dashboardInsights.js) —
  // its main record type, what needs attention, money totals, what's coming up, and how records
  // spread across linked entities — so a hospital app and an HR app get genuinely different
  // dashboards instead of the same grid of module cards.
  function renderAppDashboard(modules) {
    const who = displayNameFor(accountEntityEl && loggedIn ? loggedInIdentity : user?.email);
    if (modules.length === 0) {
      return (
        <div className="rt-card rt-fade rt-empty" style={{ marginTop: 8 }}>
          <div className="rt-empty-icon"><Lock size={28} /></div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>No modules available{loggedIn ? " for your account" : ""}</div>
          <div style={{ color: "var(--rt-muted)", fontSize: 13.5, margin: "8px auto 0", maxWidth: 460, lineHeight: 1.6 }}>
            {accountEntityEl && loggedIn
              ? `Every screen in ${detail.name} is limited to specific roles${loggedInRole ? `, and "${loggedInRole}" isn't one of them` : ", and your account hasn't been given a role yet"}. Ask an administrator to assign you a role.`
              : `${detail.name} doesn't have any list screens yet. Use Fix / Update to add some.`}
          </div>
        </div>
      );
    }
    const ins = buildInsights({ modules, detail, rowsByEntity: moduleRows });
    const focus = ins.focus || modules[0];
    const formModules = [focus, ...modules.filter((m) => m !== focus)].filter((m) => m.formScreenEl);
    const KPI_ICONS = { attention: AlertTriangle, money: Wallet };
    const TONE_STYLE = {
      warning: ["#fffbeb", "#b45309"], success: ["#ecfdf5", "#047857"],
    };
    const fmtKpi = (k) => {
      if (k.value == null) return "—";
      if (k.kind === "money") return k.value.toLocaleString(undefined, { minimumFractionDigits: k.decimals ? 2 : 0, maximumFractionDigits: k.decimals ? 2 : 0 });
      return k.value.toLocaleString();
    };
    const relDay = (d) => {
      const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
      if (days === 0) return "Today";
      if (days === 1) return "Tomorrow";
      if (days === -1) return "Yesterday";
      return days > 0 && days < 7 ? d.toLocaleDateString(undefined, { weekday: "long" }) : null;
    };
    const openModuleGrid = (m) => openElement(m.screenEl);
    const openRow = (m, row) => {
      const target = parseScreenForRun(m.screenEl.xml).grid?.rowClick?.targetScreen;
      if (target) openRowForEdit(target, row); else openModuleGrid(m);
    };

    return (
      <div className={`rt-fade rt-dash rt-comp-${design.style}`}>
        <div className="rt-dash-hero">
        {/* Dashboard header — one of four styles from the design profile, so the very first thing
            a user sees differs from app to app. */}
        {(() => {
          const dateLine = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
          const title = `${greetingForHour(new Date().getHours())}, ${who}`;
          const fallbackLine = ins.totalRecords === 0 ? `Welcome to ${detail.name} — let's add your first records.` : `${ins.totalRecords.toLocaleString()} records across ${modules.length} modules.`;
          const focusKpi = ins.kpis[0];
          if (design.header === "split" || design.header === "minimal") {
            const chips = (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {ins.loading && <span className="rt-hero-chip">Loading your data…</span>}
                {!ins.loading && ins.highlights.length === 0 && <span style={{ fontSize: 14, color: "var(--rt-muted)" }}>{fallbackLine}</span>}
                {!ins.loading && ins.highlights.map((h) => <span key={h} className="rt-hero-chip">{h}</span>)}
              </div>
            );
            const actions = formModules.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: design.header === "split" ? 20 : 0 }}>
                {formModules.slice(0, design.header === "split" ? 2 : 3).map((m, i) => (
                  <button key={m.key} className={`rt-btn ${i === 0 ? "rt-btn-primary" : "rt-btn-secondary"}`} onClick={() => openElement(m.formScreenEl)}><Plus size={15} /> New {m.label.toLowerCase()}</button>
                ))}
              </div>
            );
            if (design.header === "minimal") {
              return (
                <div className="rt-minimal-head">
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ fontSize: 13, color: "var(--rt-muted)", display: "flex", alignItems: "center", gap: 7 }}><CalendarDays size={14} /> {dateLine}</div>
                    <div className="rt-heading" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", marginTop: 6 }}>{title}</div>
                    {chips}
                  </div>
                  {actions}
                </div>
              );
            }
            return (
              <div className="rt-card rt-hero-split">
                <div className="lead">
                  <div style={{ fontSize: 13, color: "var(--rt-muted)", display: "flex", alignItems: "center", gap: 7 }}><CalendarDays size={14} /> {dateLine}</div>
                  <div className="rt-heading" style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.025em", marginTop: 8 }}>{title}</div>
                  {chips}
                  {actions}
                </div>
                <div className="focus">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>{focusKpi?.label || pluralize(focus.label)}</span>
                    <ModuleIcon entity={focus.key} icon={focus.icon} size={22} style={{ opacity: 0.85 }} />
                  </div>
                  <div className="rt-heading" style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>
                    {focusKpi?.value == null ? "—" : focusKpi.value.toLocaleString()}
                  </div>
                  <button className="rt-hero-btn" style={{ alignSelf: "flex-start" }} onClick={() => openModuleGrid(focus)}>View {pluralize(focus.label).toLowerCase()} <ChevronRight size={14} /></button>
                </div>
              </div>
            );
          }
          return (
            <div className={`rt-hero${design.header === "pattern" ? " pattern" : ""}`}>
              <div className="rt-hero-motif"><DomainMotif domain={design.domain} style={{ width: "100%", height: "auto", display: "block" }} /></div>
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontSize: 13, opacity: 0.85, display: "flex", alignItems: "center", gap: 7 }}><CalendarDays size={14} /> {dateLine}</div>
                <div className="rt-heading" style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", marginTop: 8 }}>{title}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  {ins.loading && <span className="rt-hero-btn" style={{ cursor: "default" }}>Loading your data…</span>}
                  {!ins.loading && ins.highlights.length === 0 && <span style={{ fontSize: 14, opacity: 0.9 }}>{fallbackLine}</span>}
                  {!ins.loading && ins.highlights.map((h) => (
                    <span key={h} style={{ background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: 600 }}>{h}</span>
                  ))}
                </div>
                {formModules.length > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                    {formModules.slice(0, 3).map((m) => (
                      <button key={m.key} className="rt-hero-btn" onClick={() => openElement(m.formScreenEl)}><Plus size={15} /> New {m.label.toLowerCase()}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
        </div>

        {/* KPIs — chosen per app: main records, what needs attention, money, next busiest. */}
        <div className="rt-dash-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16, marginTop: 22 }}>
          {ins.kpis.map((k) => {
            const Icon = KPI_ICONS[k.kind];
            const [bg, fg] = TONE_STYLE[k.tone] || avatarColors(k.module.key);
            return (
              <button key={k.key} className="rt-card rt-kpi" onClick={() => openModuleGrid(k.module)} style={{ "--kpi-bg": bg, "--kpi-fg": fg }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div className="rt-kpi-icon" style={{ background: bg, color: fg }}>{Icon ? <Icon size={19} /> : <ModuleIcon entity={k.module.key} icon={k.module.icon} size={19} />}</div>
                  <ArrowUpRight size={16} style={{ color: "#94a3b8" }} />
                </div>
                <div className="rt-kpi-value">{k.value == null && ins.loading ? <span className="rt-skel" style={{ display: "inline-block", width: 56, height: 26 }} /> : fmtKpi(k)}</div>
                <div className="rt-kpi-label">{k.label}</div>
                {k.sub && <div style={{ fontSize: 12, color: k.tone === "warning" ? "#b45309" : "var(--rt-muted)", marginTop: 4 }}>{k.sub}</div>}
              </button>
            );
          })}
        </div>

        {/* Status breakdown + timeline — the two widgets that most change from app to app. */}
        {(ins.breakdowns.length > 0 || ins.timeline) && (
          <div className="rt-dash-main" style={{ display: "grid", gridTemplateColumns: ins.breakdowns.length > 0 && ins.timeline ? "minmax(0, 1fr) minmax(0, 1.2fr)" : "1fr", gap: 16, marginTop: 22, alignItems: "start" }}>
            {ins.breakdowns[0] && (() => {
              const b = ins.breakdowns[0];
              return (
                <div className="rt-card">
                  <div className="rt-card-head">
                    <div style={{ flex: 1 }}>
                      <div className="rt-card-title">{b.title}</div>
                      <div className="rt-card-sub">{b.total.toLocaleString()} {pluralize(b.module.label).toLowerCase()} in total</div>
                    </div>
                    <PieChart size={18} style={{ color: "#94a3b8" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "20px 22px", flexWrap: "wrap" }}>
                    <Donut buckets={b.buckets} total={b.total} />
                    <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
                      {b.buckets.map((bk, i) => (
                        <div key={bk.value} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: bucketColor(bk, i), flexShrink: 0 }} />
                          <span style={{ flex: 1, color: "var(--rt-text-2)" }}>{bk.value}</span>
                          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{bk.count}</span>
                          <span style={{ width: 42, textAlign: "right", color: "var(--rt-muted)", fontSize: 12.5 }}>{Math.round((bk.count / b.total) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
            {ins.timeline && (
              <div className="rt-card">
                <div className="rt-card-head">
                  <div style={{ flex: 1 }}>
                    <div className="rt-card-title">{ins.timeline.title}</div>
                    <div className="rt-card-sub">By {humanize(ins.timeline.dateField).toLowerCase()}</div>
                  </div>
                  <button className="rt-btn rt-btn-ghost rt-btn-sm" onClick={() => openModuleGrid(ins.timeline.module)}>View all <ChevronRight size={14} /></button>
                </div>
                <div style={{ padding: "6px 10px 10px" }}>
                  {ins.timeline.items.map((it, i) => {
                    const rel = relDay(it.date);
                    return (
                      <button key={i} onClick={() => openRow(ins.timeline.module, it.row)}
                        style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "10px 10px", border: "none", borderRadius: 10, background: "none", cursor: "pointer", textAlign: "left", color: "inherit" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--rt-primary-softer)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                        <span style={{ width: 46, flexShrink: 0, textAlign: "center", borderRadius: 10, border: "1px solid var(--rt-border)", overflow: "hidden" }}>
                          <span style={{ display: "block", background: "var(--rt-primary)", color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 0" }}>
                            {it.date.toLocaleDateString(undefined, { month: "short" })}
                          </span>
                          <span style={{ display: "block", fontSize: 17, fontWeight: 800, padding: "3px 0" }}>{it.date.getDate()}</span>
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                          <span style={{ display: "block", fontSize: 12.5, color: "var(--rt-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[rel, ...it.context].filter(Boolean).join(" · ") || formatDate(it.date.toISOString().slice(0, 10))}
                          </span>
                        </span>
                        {it.status && <span className={`rt-badge ${toneForValue(it.status)}`}>{it.status}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Distribution across a linked entity + any further status breakdowns. */}
        {(ins.distribution || ins.breakdowns.length > 1) && (
          <div className="rt-dash-secondary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
            {ins.distribution && (
              <div className="rt-card">
                <div className="rt-card-head">
                  <div style={{ flex: 1 }}>
                    <div className="rt-card-title">{ins.distribution.title}</div>
                    <div className="rt-card-sub">Top {ins.distribution.items.length}</div>
                  </div>
                  <BarChart3 size={18} style={{ color: "#94a3b8" }} />
                </div>
                <div style={{ padding: "14px 20px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                  {ins.distribution.items.map((it) => {
                    const [bg, fg] = avatarColors(it.label);
                    return (
                      <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="rt-avatar" style={{ background: bg, color: fg, width: 28, height: 28, fontSize: 11 }}>{initialsFor(it.label)}</span>
                        <span style={{ width: 140, fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                        <span className="rt-bar" style={{ flex: 1 }}><span style={{ width: `${(it.count / ins.distribution.max) * 100}%` }} /></span>
                        <span style={{ width: 32, textAlign: "right", fontWeight: 700, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{it.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {ins.breakdowns.slice(1).map((b) => (
              <div key={b.key} className="rt-card">
                <div className="rt-card-head">
                  <div style={{ flex: 1 }}>
                    <div className="rt-card-title">{b.title}</div>
                    <div className="rt-card-sub">{b.total.toLocaleString()} total</div>
                  </div>
                </div>
                <div style={{ padding: "16px 20px 18px" }}>
                  <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--rt-canvas)" }}>
                    {b.buckets.map((bk, i) => <span key={bk.value} title={`${bk.value}: ${bk.count}`} style={{ width: `${(bk.count / b.total) * 100}%`, background: bucketColor(bk, i) }} />)}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 14 }}>
                    {b.buckets.map((bk, i) => (
                      <span key={bk.value} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--rt-text-2)" }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: bucketColor(bk, i) }} /> {bk.value} <strong style={{ color: "var(--rt-text)" }}>{bk.count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Getting started — only the modules that are still empty. */}
        {!ins.loading && ins.emptyModules.length > 0 && (
          <div className="rt-card rt-dash-setup" style={{ marginTop: 16 }}>
            <div className="rt-card-head">
              <div style={{ flex: 1 }}>
                <div className="rt-card-title">{ins.totalRecords === 0 ? "Get started" : "Finish setting up"}</div>
                <div className="rt-card-sub">{ins.emptyModules.length} module{ins.emptyModules.length === 1 ? " has" : "s have"} no records yet</div>
              </div>
              <span className="rt-badge plain neutral">{modules.length - ins.emptyModules.length}/{modules.length} done</span>
            </div>
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
              {ins.emptyModules.map((m) => (
                <button key={m.key} className="rt-quick" onClick={() => (m.formScreenEl ? openElement(m.formScreenEl) : openModuleGrid(m))}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--rt-primary-soft)", color: "var(--rt-primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ModuleIcon entity={m.key} icon={m.icon} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>Add your first {m.label.toLowerCase()}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--rt-muted)", marginTop: 1 }}>{pluralize(m.label)} is empty</span>
                  </span>
                  <Plus size={16} style={{ color: "var(--rt-muted)" }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full-screen "use the real app" mode. A thin dark builder bar on top (Studio chrome: back to
  // the Studio, Ask, Fix/Update) is kept visually separate from the app itself, which fills the
  // rest of the viewport with its own sidebar, top bar and pages.
  if (runMode && detail) {
    const modules = buildAppModules(detail, loggedInRole);
    const groupOrder = [...new Set(modules.map((m) => m.group))];
    const filteredModules = navSearch.trim()
      ? modules.filter((m) => m.label.toLowerCase().includes(navSearch.trim().toLowerCase()))
      : modules;
    const identity = accountEntityEl && loggedIn ? loggedInIdentity : (user?.email || detail.name);
    const identitySubtitle = accountEntityEl && loggedIn ? (loggedInRole || "Signed in") : "Workspace owner";
    const showAuthLayout = activeElement && screenForRun && !screenForRun.grid && AUTH_SCREEN_NAMES.has(activeElement.name)
      && (needsLoginGate || (activeElement.name === "ChangePassword" && mustChangePassword));
    const activeModule = screenForRun?.entity ? modules.find((m) => m.key === screenForRun.entity) : null;
    const [idBg, idFg] = avatarColors(identity);
    return (
      <div className={rtClass} style={{ ...rtVars, position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column" }}>
        {!isPublic && <div className="rt-builder-bar">
          <button onClick={exitRunMode} title="Back to the Studio workspace"><ArrowLeft size={14} /> Studio</button>
          <span style={{ width: 1, height: 18, background: "#2a3042" }} />
          <span className="rt-live-dot" />
          <span>Live preview</span>
          <span style={{ color: "#5d657b" }}>·</span>
          <span style={{ color: "#e8eaf2", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail.name}</span>
          <div style={{ flex: 1 }} />
          {modules.length > 0 && modules.every((m) => moduleCounts[m.key] === 0) && (
            <button onClick={addSampleData} disabled={sampleBusy} title="Fill this empty app with made-up example records">
              <Sparkles size={14} /> {sampleBusy ? "Creating sample data…" : "Add sample data"}
            </button>
          )}
          <button onClick={() => setShowAskDrawer(true)} title="Ask anything about this application's setup"><MessageSquareText size={14} /> Ask</button>
          <button className="bb-ai" onClick={() => setShowFixModal(true)} title="Fix or update this application"><Wrench size={14} /> Fix / Update</button>
        </div>}

        {showFixModal && (
          // className="studio-root" here is load-bearing, not decorative: every --st-* color
          // variable the studio-card/studio-btn-*/studio-textarea classes below depend on is only
          // ever DEFINED on an element with this class (see styles.css) — Run mode's own root never
          // carries it (its content renders the APP's own theme, not the Studio's).
          <div className="studio-root" style={{ position: "fixed", inset: 0, background: "rgba(5,6,10,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 220 }} onClick={() => setShowFixModal(false)}>
            <div className="studio-card" style={{ width: 560, padding: 24, maxHeight: "85vh", overflowY: "auto", colorScheme: "dark" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: "var(--st-text)" }}>Fix or update this application</div>
              <p style={{ fontSize: 12.5, color: "var(--st-muted)", marginTop: 0, marginBottom: 16, lineHeight: 1.55 }}>
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
              <button className="studio-btn-ai" onClick={() => handleGenerate()} disabled={generating}>
                {generating ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : <><Sparkles size={15} /> Generate fix</>}
              </button>
              {genError && <div style={{ color: "var(--st-danger)", fontSize: 12.5, marginTop: 8 }}>{genError}</div>}
              {pendingXml && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "var(--st-text)" }}>Review before applying:</div>
                  <pre className="code-block" style={{ maxHeight: "35vh" }}>{pendingXml}</pre>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="studio-btn-ai" onClick={handleApplyDescription} disabled={applying}>
                      {applying ? "Applying…" : <><Check size={15} strokeWidth={2.5} /> Apply fix</>}
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

        {showAuthLayout ? renderFormScreen(true) : (() => {
          const brandMark = theme.logo
            ? <img src={theme.logo} alt="" style={{ height: 30, maxWidth: 140, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
            : <div className="rt-logo">{detail.name.charAt(0).toUpperCase()}</div>;
          const isModuleActive = (m) => screenForRun?.entity === m.key && !!activeElement;
          const crumbs = (
            <div className="rt-crumbs">
              <button onClick={openDashboard}>{detail.name}</button>
              {activeModule && (
                <>
                  <ChevronRight size={14} />
                  {screenForRun?.grid
                    ? <span className="current">{pluralize(activeModule.label)}</span>
                    : <button onClick={() => openElement(activeModule.screenEl)}>{pluralize(activeModule.label)}</button>}
                </>
              )}
              {activeElement && screenForRun && !screenForRun.grid && (
                <>
                  <ChevronRight size={14} />
                  <span className="current">{activeElement.name === "ChangePassword" ? "Change password" : runFieldValues[screenKeyField] ? "Edit" : "New"}</span>
                </>
              )}
              {!activeElement && (<><ChevronRight size={14} /><span className="current">Dashboard</span></>)}
            </div>
          );
          const topActions = (
            <>
              <div className="rt-search" style={design.shell === "topnav" ? { width: 220 } : undefined}>
                <Search size={15} />
                <input className="rt-input" value={navSearch} onChange={(e) => setNavSearch(e.target.value)} placeholder="Search modules…" />
              </div>
              <div style={{ position: "relative" }}>
                <button className="rt-icon-btn" onClick={() => { setShowNotifications((v) => !v); setShowUserMenu(false); }} title="Notifications"><Bell size={18} /></button>
                {showNotifications && (
                  <div className="rt-menu" style={{ right: 0, top: 44, width: 280, padding: 18, textAlign: "center" }} onMouseLeave={() => setShowNotifications(false)}>
                    <div className="rt-empty-icon" style={{ width: 44, height: 44, borderRadius: 12, marginBottom: 10 }}><Bell size={20} /></div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>You're all caught up</div>
                    <div style={{ fontSize: 12.5, color: "var(--rt-muted)", marginTop: 3 }}>No new notifications right now.</div>
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <button onClick={() => { setShowUserMenu((v) => !v); setShowNotifications(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 4px 4px", border: "1px solid var(--rt-border)", borderRadius: 999, background: "var(--rt-surface)", cursor: "pointer" }}>
                  <span className="rt-avatar" style={{ width: 32, height: 32, background: idBg, color: idFg }}>{initialsFor(identity)}</span>
                  <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--rt-text)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayNameFor(identity)}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--rt-muted)" }}>{identitySubtitle}</span>
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--rt-muted)" }} />
                </button>
                {showUserMenu && (
                  <div className="rt-menu" style={{ right: 0, top: 48 }} onMouseLeave={() => setShowUserMenu(false)}>
                    <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid var(--rt-border)", marginBottom: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{displayNameFor(identity)}</div>
                      <div style={{ fontSize: 12, color: "var(--rt-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{identity}</div>
                    </div>
                    {accountEntityEl && loggedIn ? (
                      <>
                        <button onClick={() => {
                          setShowUserMenu(false);
                          const cp = detail.elements.find((e) => e.tag === "Screen" && e.name === "ChangePassword");
                          if (cp) openElement(cp); else setError("No ChangePassword screen found.");
                        }}><KeyRound size={15} /> Change password</button>
                        <button className="danger" onClick={() => { setShowUserMenu(false); handleLogout(); }} disabled={loggingOut}><LogOut size={15} /> {loggingOut ? "Signing out…" : "Sign out"}</button>
                      </>
                    ) : (
                      <div style={{ padding: "6px 10px 8px", fontSize: 12, color: "var(--rt-muted)" }}>This app has no user accounts — you're previewing it as the owner.</div>
                    )}
                  </div>
                )}
              </div>
            </>
          );
          const pageContent = (
            <>
              {error && (
                <div className="rt-alert error" style={{ marginBottom: 16, alignItems: "center" }}>
                  <AlertCircle size={16} /><span style={{ flex: 1 }}>{error}</span>
                  <button className="rt-icon-btn sm" onClick={() => setError("")}><XIcon size={14} /></button>
                </div>
              )}
              {!activeElement && renderAppDashboard(modules)}
              {activeElement && activeElement.tag === "Screen" && screenForRun?.grid && renderGridScreen(true)}
              {activeElement && activeElement.tag === "Screen" && screenForRun && !screenForRun.grid && renderFormScreen(true)}
            </>
          );

          // ----- Top navigation: brand + horizontal module links, overflow in a "More" menu -----
          if (design.shell === "topnav") {
            const VISIBLE = 5;
            const shown = filteredModules.slice(0, VISIBLE);
            const overflow = filteredModules.slice(VISIBLE);
            return (
              <div className="rt-shell topnav">
                <header className="rt-topnav">
                  <div className="rt-brand">{brandMark}<div className="rt-brand-name">{detail.name}</div></div>
                  <nav className="rt-topnav-links">
                    <button className={`rt-nav-item${!activeElement ? " active" : ""}`} onClick={openDashboard}><LayoutDashboard size={16} /> Dashboard</button>
                    {shown.map((m) => (
                      <button key={m.key} className={`rt-nav-item${isModuleActive(m) ? " active" : ""}`} onClick={() => openElement(m.screenEl)}>
                        <ModuleIcon entity={m.key} icon={m.icon} size={16} /> {pluralize(m.label)}
                      </button>
                    ))}
                    {overflow.length > 0 && (
                      <div style={{ position: "relative" }}>
                        <button className={`rt-nav-item${overflow.some(isModuleActive) ? " active" : ""}`} onClick={() => setShowMoreNav((v) => !v)}>More <ChevronDown size={14} /></button>
                        {showMoreNav && (
                          <div className="rt-menu" style={{ left: 0, top: 46 }} onMouseLeave={() => setShowMoreNav(false)}>
                            {overflow.map((m) => (
                              <button key={m.key} onClick={() => { setShowMoreNav(false); openElement(m.screenEl); }}>
                                <ModuleIcon entity={m.key} icon={m.icon} size={15} /> {pluralize(m.label)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </nav>
                  {topActions}
                </header>
                <div className="rt-main">
                  <div className="rt-content">
                    <div className="rt-page">
                      {activeElement && <div style={{ marginBottom: 14 }}>{crumbs}</div>}
                      {pageContent}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // ----- Sidebar or icon rail -----
          const rail = design.shell === "rail";
          const collapsed = !rail && sidebarCollapsed;
          return (
            <div className="rt-shell">
              <aside className={`rt-sidebar${rail ? " rail" : ""}${collapsed ? " collapsed" : ""}`}>
                <div className="rt-brand" title={detail.name}>
                  {brandMark}
                  {!rail && !collapsed && (
                    <div style={{ minWidth: 0 }}>
                      <div className="rt-brand-name">{detail.name}</div>
                      <div className="rt-brand-sub">Workspace</div>
                    </div>
                  )}
                </div>
                <nav className="rt-nav">
                  <button className={`rt-nav-item${!activeElement ? " active" : ""}`} onClick={openDashboard} title="Dashboard">
                    <LayoutDashboard size={rail ? 20 : 18} strokeWidth={1.8} /> {rail ? <span>Home</span> : !collapsed && "Dashboard"}
                  </button>
                  {groupOrder.map((group) => {
                    const items = filteredModules.filter((m) => m.group === group);
                    if (items.length === 0) return null;
                    return (
                      <div key={group}>
                        {rail || collapsed ? <div className="rt-nav-sep" style={{ height: 1, background: "var(--nav-border)", margin: "10px 12px" }} /> : <div className="rt-nav-label">{group}</div>}
                        {items.map((m) => {
                          const count = moduleCounts[m.key];
                          return (
                            <button key={m.key} className={`rt-nav-item${isModuleActive(m) ? " active" : ""}`} onClick={() => openElement(m.screenEl)} title={pluralize(m.label)}>
                              <ModuleIcon entity={m.key} icon={m.icon} size={rail ? 20 : 18} />
                              {rail && <span>{pluralize(m.label)}</span>}
                              {!rail && !collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pluralize(m.label)}</span>}
                              {!rail && !collapsed && typeof count === "number" && <span className="rt-nav-count">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {navSearch.trim() && filteredModules.length === 0 && !rail && !collapsed && (
                    <div style={{ fontSize: 12.5, color: "var(--nav-muted)", padding: "10px 12px" }}>No modules match "{navSearch}".</div>
                  )}
                </nav>
                {!rail && (
                  <div className="rt-sidebar-foot">
                    <button className="rt-nav-item" onClick={() => setSidebarCollapsed((c) => !c)} title={collapsed ? "Expand menu" : "Collapse menu"} style={{ marginBottom: 0 }}>
                      {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />} {!collapsed && "Collapse"}
                    </button>
                  </div>
                )}
              </aside>
              <div className="rt-main">
                <header className="rt-topbar">
                  {crumbs}
                  <div style={{ flex: 1 }} />
                  {topActions}
                </header>
                <div className="rt-content">
                  <div className="rt-page">{pageContent}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* The Ask slide-over — same panel as the Studio's Ask section, so a question that comes
            up while actually using the app ("why won't this save?") can be answered in place. */}
        {showAskDrawer && (
          <div className="studio-root" style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", justifyContent: "flex-end", background: "rgba(5,6,10,0.45)", colorScheme: "dark" }} onClick={() => setShowAskDrawer(false)}>
            <div className="fade-in" style={{ width: 460, maxWidth: "100%", height: "100%", background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", boxShadow: "-20px 0 50px -20px rgba(0,0,0,0.6)" }} onClick={(e) => e.stopPropagation()}>
              <AskPanel applicationId={selectedId} detail={detail} variant="drawer" onClose={() => setShowAskDrawer(false)} />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isPublic) {
    return (
      <div className="studio-root" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--muted)", fontSize: 14, padding: 24, textAlign: "center" }}>
        {publicUnavailable ? "This app isn't available. Check the link, or ask its owner." : <span className="spinner" />}
      </div>
    );
  }

  // ===== The Studio workspace for one application =====
  // One header (back to Projects, project switcher, the Describe → Review → Run flow, primary
  // actions) over a left rail of sections. The flow stepper is the spine: an empty app starts at
  // Describe, a generated-but-unapplied result sits at Review, and anything applied can Run.
  const summary = detail ? summarizeApplication(detail) : null;
  const isEmptyApp = !!detail && detail.elements.length === 0;
  const canRun = !!detail && !isEmptyApp && (buildAppModules(detail).length > 0 || !!accountEntityEl);
  const stage = pendingXml ? "review" : isEmptyApp || !detail ? "describe" : "run";
  const pendingSummary = pendingXml ? summarizeXmlFragment(pendingXml, detail) : null;

  const stepIndex = { describe: 0, review: 1, run: 2 }[stage];
  const steps = [
    { key: "describe", label: "Describe", onClick: () => goToSection("describe") },
    { key: "review", label: "Review", onClick: () => pendingXml && goToSection("describe") },
    { key: "run", label: "Run", onClick: () => canRun && enterAppOrDescribe(detail) },
  ];

  const navItem = (key, label, Icon, opts = {}) => {
    const active = opts.active ?? (section === key && !activeElement);
    return (
      <button key={key} className={`nav-item${active ? " active" : ""}`} onClick={opts.onClick || (() => goToSection(key))} disabled={opts.disabled} style={opts.disabled ? { opacity: 0.45 } : undefined}>
        <Icon size={16} strokeWidth={1.8} /> {label}
        {opts.count != null && <span className="nav-count">{opts.count}</span>}
      </button>
    );
  };

  const sectionHeader = (title, sub, actions) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="section-title">{title}</h1>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );

  const examples = [
    "Customers, orders and products. An order belongs to a customer and has line items with quantity and price.",
    "Employees, departments and leave requests with an approval status. End date can't be before start date.",
    "Users sign up and log in. Admins can manage everything; regular users only see their own records.",
  ];

  return (
    <div className="studio-root" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
      {/* ===== Header ===== */}
      <header style={{ height: 60, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "0 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elev)" }}>
        <button className="studio-btn-ghost studio-btn-sm" onClick={() => navigate("/")} title="All projects"><ArrowLeft size={15} /> Projects</button>
        <div style={{ width: 1, height: 22, background: "var(--border)" }} />
        <BrandMark size={28} />
        <div style={{ position: "relative", minWidth: 0 }}>
          <select
            className="studio-select"
            value={selectedId || ""}
            onChange={(e) => navigate(`/runtime-engine?id=${e.target.value}`)}
            title="Switch project"
            style={{ width: "auto", maxWidth: 260, background: "transparent", border: "1px solid transparent", fontWeight: 700, fontSize: 14.5, padding: "6px 28px 6px 8px", appearance: "none", cursor: "pointer" }}
          >
            {!applications?.some((a) => a.id === selectedId) && <option value={selectedId || ""}>{detail?.name || "Loading…"}</option>}
            {(applications || []).map((a) => <option key={a.id} value={a.id} style={{ background: "var(--surface)", color: "var(--text)" }}>{a.name}</option>)}
          </select>
          <ChevronDown size={14} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
        </div>

        {/* Flow stepper */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: 4 }}>
            {steps.map((s, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              return (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <ChevronRight size={14} style={{ color: "var(--border-strong)" }} />}
                  <button
                    onClick={s.onClick}
                    style={{
                      display: "flex", alignItems: "center", gap: 7, padding: "5px 12px 5px 6px", borderRadius: 999, border: "none", cursor: "pointer",
                      background: current ? "var(--accent-soft)" : "transparent", color: current ? "var(--text)" : done ? "var(--text-2)" : "var(--muted)",
                      fontSize: 12.5, fontWeight: current ? 700 : 500,
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                      background: current ? "var(--ai-gradient)" : done ? "var(--success-soft)" : "var(--surface-3)", color: current ? "#fff" : done ? "var(--success)" : "var(--muted)",
                    }}>
                      {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </span>
                    {s.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <ThemeToggle />
        <button className="studio-btn-ghost studio-btn-sm" onClick={() => detail && downloadTextFile(xmlFilenameFor(detail.name), buildFullXml(detail))} disabled={!detail || isEmptyApp} title="Download the application XML">
          <Download size={14} /> XML
        </button>
        <button className="studio-btn-secondary studio-btn-sm" onClick={() => goToSection("ask")} disabled={!detail || isEmptyApp}>
          <MessageSquareText size={14} /> Ask
        </button>
        <button className="studio-btn-primary" onClick={() => enterAppOrDescribe(detail)} disabled={!canRun} title={canRun ? "Open the running application" : "Describe and apply the app first"}>
          <Play size={14} fill="currentColor" /> Run app
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ===== Left rail ===== */}
        <nav style={{ width: 228, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--bg-elev)", padding: "8px 10px 12px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <div className="nav-group-label" style={{ marginTop: 10 }}>Workspace</div>
            {navItem("overview", "Overview", LayoutDashboard)}
            {navItem("describe", isEmptyApp ? "Describe app" : "AI builder", Sparkles)}
            {navItem("ask", "Ask about app", MessageSquareText, { disabled: isEmptyApp })}
            {navItem("design", "Design", Palette, { disabled: isEmptyApp })}
            {navItem("publish", "Publish", Rocket, { disabled: isEmptyApp })}
            {navItem("run", "Run app", Play, { onClick: () => enterAppOrDescribe(detail), disabled: !canRun, active: false })}

            <div className="nav-group-label">Explore</div>
            {navItem("er", "Data model", Network, { disabled: isEmptyApp })}
            {navItem("xml", "Full XML", FileCode2, { disabled: isEmptyApp })}
            {navItem("audit", "Audit log", ShieldCheck)}

            {detail && !isEmptyApp && (
              <>
                <div className="nav-group-label">Elements</div>
                {ELEMENT_TAGS.map((tag) => {
                  const count = summary.counts[tag] || 0;
                  // The optional, at-most-one-of tags only earn a nav entry once they exist.
                  if (count === 0 && ["Theme", "Session", "Auditing", "AutoNumber"].includes(tag)) return null;
                  const meta = TAG_META[tag];
                  return navItem(`el-${tag}`, meta.label, meta.icon, {
                    count,
                    active: section === "elements" && activeTag === tag,
                    onClick: () => { setSection("elements"); setActiveTag(tag); setActiveElement(null); },
                  });
                })}
              </>
            )}
          </div>
          {selectedId && (
            <button className="nav-item" onClick={() => deleteApplication(selectedId)} style={{ color: "var(--danger)", marginTop: 12 }}>
              <XIcon size={16} /> Delete project
            </button>
          )}
        </nav>

        {/* ===== Content ===== */}
        <main style={{ flex: 1, minWidth: 0, overflowY: section === "ask" ? "hidden" : "auto" }}>
          <div style={{ maxWidth: section === "ask" ? 920 : 1120, margin: "0 auto", padding: "28px 32px 64px", height: section === "ask" ? "100%" : "auto", paddingBottom: section === "ask" ? 24 : 64, display: section === "ask" ? "flex" : "block", flexDirection: "column" }}>
            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--danger-soft)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--danger)", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 18 }}>
                <span style={{ flex: 1 }}>{error}</span>
                <button className="studio-btn-ghost studio-btn-sm" onClick={() => setError("")}><XIcon size={13} /></button>
              </div>
            )}

            {(detailLoading || !detail) && !error && (
              <div>
                <div className="skeleton" style={{ height: 28, width: 260, marginBottom: 14 }} />
                <div className="skeleton" style={{ height: 14, width: 420, marginBottom: 28 }} />
                <div className="skeleton" style={{ height: 160, borderRadius: 14 }} />
              </div>
            )}

            {/* ----- Overview ----- */}
            {detail && !detailLoading && section === "overview" && !activeElement && (
              isEmptyApp ? (
                <div className="studio-card fade-in" style={{ padding: "48px 32px", textAlign: "center" }}>
                  <div className="ai-mark" style={{ width: 46, height: 46, borderRadius: 13, margin: "0 auto 16px" }}><Sparkles size={22} /></div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{detail.name} is empty</div>
                  <div style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 6, marginBottom: 20 }}>Describe what it should do and the AI will design its data model, screens and rules.</div>
                  <button className="studio-btn-ai" onClick={() => goToSection("describe")}><Sparkles size={15} /> Describe your app</button>
                </div>
              ) : (
                <div className="fade-in">
                  {/* Hero */}
                  <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1px solid var(--border)", background: "radial-gradient(120% 140% at 0% 0%, rgba(139,124,248,0.18) 0%, rgba(139,124,248,0) 55%), radial-gradient(90% 120% at 100% 100%, rgba(56,214,240,0.10) 0%, rgba(56,214,240,0) 60%), var(--surface)", padding: "26px 28px", display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: theme.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0, boxShadow: `0 10px 26px -10px ${theme.primary}` }}>
                      {detail.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{detail.name}</div>
                      <div style={{ color: "var(--text-2)", fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
                        {summary.entities.length} entit{summary.entities.length === 1 ? "y" : "ies"}, {summary.screens.length} screen{summary.screens.length === 1 ? "" : "s"} and {summary.validations.length} validation rule{summary.validations.length === 1 ? "" : "s"}
                        {summary.hasAccounts ? " · user accounts with sign-in" : ""}
                        {summary.roles.length > 0 ? ` · ${summary.roles.length} role${summary.roles.length === 1 ? "" : "s"}` : ""}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                        <span style={{ fontSize: 11.5, color: "var(--muted)", marginRight: 2 }}>Theme</span>
                        {[theme.primary, theme.accent, theme.background].map((c, i) => (
                          <span key={i} title={c} style={{ width: 16, height: 16, borderRadius: 5, background: c, border: "1px solid rgba(255,255,255,0.15)" }} />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="studio-btn-secondary" onClick={() => goToSection("describe")}><Sparkles size={15} /> Describe a change</button>
                      <button className="studio-btn-secondary" onClick={() => goToSection("ask")}><MessageSquareText size={15} /> Ask</button>
                      <button className="studio-btn-secondary" onClick={() => goToSection("design")}><Palette size={15} /> Design</button>
                      <button className="studio-btn-primary" onClick={() => enterAppOrDescribe(detail)} disabled={!canRun}><Play size={14} fill="currentColor" /> Run app</button>
                    </div>
                  </div>

                  <div className="studio-card" style={{ padding: "14px 18px", marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", boxShadow: "none" }}>
                    <Sparkles size={17} style={{ color: "var(--accent)" }} />
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>Sample data</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                        {sampleResult
                          ? `Added ${sampleResult.created} example records${sampleResult.skipped ? `; skipped ${sampleResult.skipped} that broke a rule (${sampleResult.firstProblem})` : ""}.`
                          : "Fill empty modules with made-up records to see this app working."}
                      </div>
                    </div>
                    <button className="studio-btn-secondary studio-btn-sm" onClick={addSampleData} disabled={sampleBusy}>
                      {sampleBusy ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Working…</> : "Add sample data"}
                    </button>
                    <button className="studio-btn-ghost studio-btn-sm" onClick={removeSampleData} disabled={sampleBusy}>Remove</button>
                  </div>

                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginTop: 16 }}>
                    {["Entity", "Relationship", "Screen", "Validation", "Action", "DataSource"].map((tag) => {
                      const Icon = TAG_META[tag].icon;
                      return (
                        <button key={tag} className="stat-tile hover-lift" onClick={() => { setSection("elements"); setActiveTag(tag); setActiveElement(null); }} style={{ textAlign: "left", cursor: "pointer", color: "inherit" }}>
                          <div className="stat-label"><Icon size={14} /> {TAG_META[tag].label}</div>
                          <div className="stat-value">{summary.counts[tag] || 0}</div>
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)", gap: 16, marginTop: 24, alignItems: "start" }}>
                    {/* Entities */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Data model</div>
                        <button className="studio-btn-ghost studio-btn-sm" onClick={() => goToSection("er")}><Network size={13} /> View diagram</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {summary.entities.map((e) => (
                          <button
                            key={e.name}
                            className="studio-card hover-lift"
                            onClick={() => askAbout(`Explain the ${humanize(e.name)} entity — its fields, which are required, its relationships, rules and screens.`)}
                            title={`Ask about ${humanize(e.name)}`}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left", color: "inherit", boxShadow: "none" }}
                          >
                            <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <ModuleIcon entity={e.name} icon={e.icon} size={16} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                                {humanize(e.name)}
                                {e.isAccount && <span className="studio-pill studio-pill-soft" style={{ fontSize: 10.5, padding: "1px 7px" }}>Accounts</span>}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                                {e.fieldCount} field{e.fieldCount === 1 ? "" : "s"} · {e.requiredCount} required · {e.screenCount} screen{e.screenCount === 1 ? "" : "s"} · {e.validationCount} rule{e.validationCount === 1 ? "" : "s"}
                              </div>
                            </div>
                            <MessageSquareText size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ask teaser */}
                    <div className="studio-card" style={{ padding: 18, boxShadow: "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div className="ai-mark" style={{ width: 28, height: 28, borderRadius: 8 }}><MessageSquareText size={14} /></div>
                        <div style={{ fontWeight: 700, fontSize: 14.5 }}>Ask about this app</div>
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, marginBottom: 14 }}>
                        Plain-English answers about entities, fields, rules, screens and access — straight from the app's definition.
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {["Give me a plain-English overview of this app", "What validation rules are enforced, and when?", "List the screens and what each one is for"].map((q) => (
                          <button key={q} className="chip" onClick={() => askAbout(q)} style={{ borderRadius: 9, justifyContent: "flex-start" }}>
                            <Sparkles size={12} style={{ color: "var(--accent)", flexShrink: 0 }} /> {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* ----- Describe / AI builder ----- */}
            {detail && !detailLoading && section === "describe" && !activeElement && (
              <div className="fade-in" style={{ maxWidth: 820 }}>
                {sectionHeader(
                  isEmptyApp ? "Describe your app" : "Describe a change",
                  isEmptyApp
                    ? "Explain it in plain English — the data you track, how things relate, and any rules. One entity or the whole thing; you can keep adding later."
                    : "Say what to add or fix. Only what you describe is touched — every other screen, entity and all existing data stay exactly as they are."
                )}

                <div className="composer">
                  <textarea
                    rows={6}
                    value={genDescription}
                    onChange={(e) => setGenDescription(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                    placeholder={isEmptyApp
                      ? "An insurance claims app with policies, claims and adjusters. Each policy belongs to a customer and can have many claims; each claim is assigned to one adjuster and has a status and amount."
                      : "Add a 'notes' field to Attendance, and stop the Timesheet form accepting negative hours."}
                    disabled={generating}
                  />
                  <div className="composer-bar">
                    <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1 }}>Ctrl+Enter to generate</span>
                    <button className="studio-btn-ai" onClick={() => handleGenerate()} disabled={generating}>
                      {generating ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : <><Sparkles size={15} /> {isEmptyApp ? "Generate app" : "Generate changes"}</>}
                    </button>
                  </div>
                </div>
                {isEmptyApp && !pendingXml && !generating && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {examples.map((ex) => (
                      <button key={ex} className="chip" onClick={() => setGenDescription(ex)} style={{ maxWidth: 360 }}>{ex.length > 70 ? `${ex.slice(0, 68)}…` : ex}</button>
                    ))}
                  </div>
                )}

                {generating && (
                  <div className="studio-card fade-in" style={{ marginTop: 18, padding: 20, display: "flex", gap: 14, alignItems: "flex-start", boxShadow: "none" }}>
                    <div className="ai-mark" style={{ width: 34, height: 34 }}><Sparkles size={17} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Designing {isEmptyApp ? "your app" : "the change"}…</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, marginBottom: 14 }}>Working out entities, relationships, screens and validation rules. This usually takes under a minute.</div>
                      <div className="skeleton" style={{ height: 10, width: "92%", marginBottom: 8 }} />
                      <div className="skeleton" style={{ height: 10, width: "74%", marginBottom: 8 }} />
                      <div className="skeleton" style={{ height: 10, width: "58%" }} />
                    </div>
                  </div>
                )}

                {genError && !generating && (
                  <div className="fade-in" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, background: "var(--danger-soft)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "12px 14px" }}>
                    <span style={{ flex: 1, color: "var(--danger)", fontSize: 13 }}>{genError}</span>
                    <button className="studio-btn-secondary studio-btn-sm" onClick={() => handleGenerate()} disabled={!genDescription.trim()}><RotateCcw size={13} /> Try again</button>
                  </div>
                )}

                {pendingXml && !generating && (
                  <div className="studio-card fade-in" style={{ marginTop: 18, overflow: "hidden", boxShadow: "none", borderColor: "rgba(139,124,248,0.35)" }}>
                    <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "linear-gradient(90deg, rgba(139,124,248,0.10), transparent)" }}>
                      <span className="studio-pill studio-pill-soft">Step 2 · Review</span>
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 14.5 }}>
                        {isEmptyApp ? "Here's what will be created" : "Here's what will change"}
                      </div>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{pendingSummary.total} element{pendingSummary.total === 1 ? "" : "s"}</span>
                    </div>
                    <div style={{ padding: 18 }}>
                      {pendingSummary.error ? (
                        <div style={{ fontSize: 13, color: "var(--warning)" }}>Couldn't summarize this result — check the XML below before applying.</div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                          {pendingSummary.groups.map((g) => {
                            const meta = TAG_META[g.tag] || { label: g.tag, icon: FileText };
                            const Icon = meta.icon;
                            return (
                              <div key={g.tag} style={{ background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>
                                  <Icon size={14} style={{ color: "var(--accent)" }} /> {meta.label} <span style={{ color: "var(--muted)", fontWeight: 500 }}>· {g.items.length}</span>
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                  {g.items.map((it) => (
                                    <span key={it.name} className="studio-pill" style={{ fontSize: 11.5, fontWeight: 500, padding: "2px 8px", background: it.isNew ? "var(--success-soft)" : "var(--warning-soft)", color: it.isNew ? "var(--success)" : "var(--warning)" }} title={it.isNew ? "New" : "Updated"}>
                                      {it.isNew ? "+" : "~"} {humanize(it.name)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!isEmptyApp && !pendingSummary.error && (
                        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--muted)", marginTop: 12 }}>
                          <span><span style={{ color: "var(--success)" }}>+</span> new</span>
                          <span><span style={{ color: "var(--warning)" }}>~</span> updated (replaced in full)</span>
                          <span>Everything not listed stays exactly as it is.</span>
                        </div>
                      )}
                      {showXmlInReview && <pre className="code-block" style={{ marginTop: 14, maxHeight: "42vh" }}>{pendingXml}</pre>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
                        <button className="studio-btn-ai" onClick={handleApplyDescription} disabled={applying}>
                          {applying ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Applying…</> : <><Check size={15} strokeWidth={2.5} /> {isEmptyApp ? "Apply & run app" : "Apply changes"}</>}
                        </button>
                        <button className="studio-btn-secondary" onClick={() => { setPendingXml(null); setShowXmlInReview(false); }} disabled={applying}>Discard</button>
                        <div style={{ flex: 1 }} />
                        <button className="studio-btn-ghost studio-btn-sm" onClick={() => setShowXmlInReview((v) => !v)}>
                          <FileCode2 size={13} /> {showXmlInReview ? "Hide XML" : "View XML"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ----- Publish ----- */}
            {detail && !detailLoading && section === "publish" && !activeElement && (
              <PublishPanel
                applicationId={selectedId}
                appName={detail.name}
                onAddSignIn={() => { setGenDescription("Add user accounts: users sign up and log in with email and password."); goToSection("describe"); }}
              />
            )}

            {/* ----- Design ----- */}
            {detail && !detailLoading && section === "design" && !activeElement && (
              <DesignStudio applicationId={selectedId} detail={detail} onDetailChange={setDetail} />
            )}

            {/* ----- Ask ----- */}
            {detail && !detailLoading && section === "ask" && !activeElement && (
              <AskPanel applicationId={selectedId} detail={detail} seedQuestion={askSeed} onSeedConsumed={() => setAskSeed(null)} />
            )}

            {/* ----- Data model (ER map) ----- */}
            {detail && !detailLoading && section === "er" && !activeElement && (() => {
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
                .map((e) => { const s = parseScreenForRun(e.xml); return [s.entity || "—", e.name, s.grid ? "Browse (grid)" : "Form", s.requiresRole ? s.requiresRole.join(", ") : "Everyone"]; });
              const actionRows = detail.elements
                .filter((e) => e.tag === "Action")
                .map((e) => { const a = parseActionForRun(e.xml); return [a.entity, e.name, a.steps.join(" → ") || "—"]; });
              const dataSourceRows = detail.elements
                .filter((e) => e.tag === "DataSource")
                .map((e) => { const d = parseDataSourceForRun(e.xml); return [d.entity || "—", e.name]; });
              const entityFieldsByName = new Map(detail.elements.filter((e) => e.tag === "Entity").map((e) => [e.name, parseEntityForRun(e.xml).fields]));
              return (
                <div className="fade-in">
                  {sectionHeader("Data model", "Every entity, how they connect, and the screens, rules and lookups attached to each.",
                    <button className="studio-btn-secondary studio-btn-sm" onClick={() => askAbout("How are the entities related to each other?")}><MessageSquareText size={13} /> Explain relationships</button>)}
                  <div className="studio-card" style={{ padding: 8, boxShadow: "none" }}>
                    <ERDiagram entities={erTables} emptyMessage="No entities yet — describe the application first." />
                  </div>
                  {erTables.tables.length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 14, margin: "28px 0 10px" }}>Fields</div>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr>{["Entity", "Field", "Type", "Key", "Required", "Related to"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                          <tbody>
                            {erTables.tables.flatMap((t) =>
                              t.columns.map((c, i) => (
                                <tr key={`${t.name}.${c.name}`}>
                                  <td style={{ color: "var(--text)", fontWeight: i === 0 ? 600 : 400 }}>{i === 0 ? t.name : ""}</td>
                                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{c.name}</td>
                                  <td><span className="studio-pill studio-pill-muted" style={{ fontSize: 11, padding: "1px 8px" }}>{c.type}</span></td>
                                  <td>{c.pk ? <KeyRound size={13} style={{ color: "var(--warning)" }} /> : ""}</td>
                                  <td>{entityFieldsByName.get(t.name)?.find((f) => f.name === c.name)?.required ? <Check size={14} style={{ color: "var(--success)" }} /> : ""}</td>
                                  <td>{c.fk || ""}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <ElementTable
                        title="Validations"
                        columns={["Entity", "Rule", "When", "On violation", "Condition", "Message"]}
                        rows={validationRows}
                        emptyLabel="No validations yet — every entity can have one or more, each connected to it."
                      />
                      <ElementTable
                        title="Screens"
                        columns={["Entity", "Screen", "Type", "Access"]}
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
                        title="Data sources"
                        columns={["Entity", "Data source"]}
                        rows={dataSourceRows}
                        emptyLabel="No data sources yet — these power dropdown options and FK lookups."
                      />
                    </>
                  )}
                </div>
              );
            })()}

            {/* ----- Full XML ----- */}
            {detail && !detailLoading && section === "xml" && !activeElement && (
              <div className="fade-in">
                {sectionHeader("Full XML", "The whole application definition in one document — what the runtime engine actually runs.", (
                  <>
                    <CopyTextButton text={buildFullXml(detail)} />
                    <button className="studio-btn-secondary studio-btn-sm" onClick={() => downloadTextFile(xmlFilenameFor(detail.name), buildFullXml(detail))}><Download size={13} /> Download</button>
                  </>
                ))}
                <pre className="code-block" style={{ maxHeight: "calc(100vh - 230px)" }}>{buildFullXml(detail)}</pre>
              </div>
            )}

            {/* ----- Audit log ----- */}
            {detail && !detailLoading && section === "audit" && !activeElement && (
              <div className="fade-in">
                {sectionHeader("Audit log", "Logins, registrations, deletes, restores and access denials for this application — most recent first.",
                  <button className="studio-btn-secondary studio-btn-sm" onClick={loadAuditLog}><RotateCcw size={13} /> Refresh</button>)}
                {auditEvents === null && <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />}
                {auditEvents?.length === 0 && (
                  <div className="studio-card" style={{ padding: "36px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13, boxShadow: "none" }}>
                    <ShieldCheck size={26} style={{ marginBottom: 8 }} /><div>No events yet.</div>
                  </div>
                )}
                {auditEvents && auditEvents.length > 0 && (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>When</th><th>Event</th><th>Who</th><th>Detail</th></tr></thead>
                      <tbody>
                        {auditEvents.map((e, i) => (
                          <tr key={i}>
                            <td style={{ whiteSpace: "nowrap", color: "var(--muted)" }}>{new Date(e.at).toLocaleString()}</td>
                            <td><span className="studio-pill studio-pill-muted" style={{ fontSize: 11.5 }}>{e.type}</span></td>
                            <td>{e.identity || "—"}</td>
                            <td>{e.detail || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ----- Elements of one tag ----- */}
            {detail && !detailLoading && section === "elements" && !activeElement && (
              <div className="fade-in">
                {sectionHeader(TAG_META[activeTag]?.label || activeTag, `${elementsByTag.length} ${activeTag} element${elementsByTag.length === 1 ? "" : "s"} in this application.${activeTag === "Screen" ? " Open one to preview it." : " Open one to see its definition."}`)}
                {elementsByTag.length === 0 ? (
                  <div className="studio-card" style={{ padding: "36px 24px", textAlign: "center", color: "var(--muted)", fontSize: 13, boxShadow: "none" }}>No {TAG_META[activeTag]?.label.toLowerCase() || activeTag} yet.</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {elementsByTag.map((el) => {
                      const Icon = TAG_META[el.tag]?.icon || FileText;
                      return (
                        <button key={el.name} className="studio-card hover-lift" onClick={() => openElement(el)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left", color: "inherit", boxShadow: "none" }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-2)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{el.name}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{describeElement(el)}</div>
                          </div>
                          <ChevronRight size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ----- One open element ----- */}
            {detail && activeElement && (
              <div className="fade-in">
                {accountEntityEl && loggedIn && activeElement.tag === "Screen" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>Signed in to the app as <strong>{loggedInIdentity}</strong></span>
                    <button
                      className="studio-btn-secondary studio-btn-sm"
                      onClick={() => {
                        const cpEl = detail.elements.find((e) => e.tag === "Screen" && e.name === "ChangePassword");
                        if (cpEl) openElement(cpEl); else setError("No ChangePassword screen found.");
                      }}
                    >
                      Change password
                    </button>
                    <button className="studio-btn-secondary studio-btn-sm" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</button>
                  </div>
                )}
                {activeElement.tag !== "Screen" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                      <button className="studio-btn-secondary studio-btn-sm" onClick={() => setActiveElement(null)}><ArrowLeft size={13} /> Back</button>
                      <span className="studio-pill studio-pill-soft">{activeElement.tag}</span>
                      <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{activeElement.name}</div>
                      <CopyTextButton text={activeElement.xml} />
                      <button className="studio-btn-secondary studio-btn-sm" onClick={() => askAbout(`Explain the ${activeElement.tag} "${activeElement.name}" in plain English — what it does and how it affects the app.`)}>
                        <MessageSquareText size={13} /> Explain this
                      </button>
                    </div>
                    <pre className="code-block">{activeElement.xml}</pre>
                  </div>
                )}
                {activeElement.tag === "Screen" && screenForRun?.grid && renderGridScreen()}
                {activeElement.tag === "Screen" && screenForRun && !screenForRun.grid && renderFormScreen()}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
