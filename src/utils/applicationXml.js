// Pure, client-side readers for a Runtime Engine Application — native DOMParser over each stored
// element's own XML, no library. Shared by the Runtime Engine page (Run panel, ER Map), its
// Overview, and the Ask panel, so every view reads an element the same way. Moved out of
// RuntimeEngine.jsx unchanged; see that file's history for the reasoning behind each one.

// Minimal client-side extraction (native DOMParser, no library) of just enough from a Screen's
// raw XML to render a bare, unstyled Run panel — UIField label/bind, Button label/action, and (for
// a browse screen) the Grid's own columns/entity/rowClick target. This mirrors backend-node's
// applicationModel.ts's parseScreenElement in spirit, not by sharing code (that parser is
// server-only); good enough for the MVP "fastest, bare form/table" tier, not a full themed renderer.
export function parseScreenForRun(xml) {
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
export const LEGACY_ACCOUNT_FIELD_NAMES = new Set(["id", "username", "passwordHash", "mustChangePassword"]);
export const CURRENT_ACCOUNT_FIELD_NAMES = new Set([
  "id", "email", "passwordHash", "mustChangePassword", "firstName", "lastName", "dob", "emailVerified", "authProvider",
]);

export function parseEntityForRun(xml) {
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

export function parseRelationshipForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  return { fromEntity: el.getAttribute("fromEntity"), fromField: el.getAttribute("fromField"), toEntity: el.getAttribute("toEntity") };
}

export function parseDataSourceForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  const selectEl = el.querySelector("Select");
  return { entity: selectEl?.getAttribute("entity") || null };
}

// Minimal client-side extraction of a Validation/Action element's own entity binding + a short
// human-readable summary — same spirit as parseScreenForRun above, just enough for the ER Map's
// "every node, and what it's connected to" tables, not a full typed model (that's applicationModel.ts's
// job, server-only).
export function parseValidationForRun(xml) {
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

export function parseActionForRun(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  const steps = Array.from(el.querySelectorAll("Steps > *")).map((s) => {
    if (s.tagName === "Set") return `Set ${s.getAttribute("field")} = ${s.getAttribute("value")}`;
    if (s.tagName === "Save") return "Save";
    if (s.tagName === "Notify") return `Notify ${s.getAttribute("to")}`;
    return s.tagName;
  });
  return { entity: el.getAttribute("entity"), steps };
}

export function humanize(name) {
  return (name || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export const DEFAULT_THEME = { layout: null, tokens: null, fontName: null, headingFontName: null, hasColors: false, logo: null, primary: "#4f46e5", accent: "#f59e0b", background: "#ffffff", fontFamily: "system-ui, sans-serif", fontSize: "14", cornerRadius: "6", density: "comfortable" };

// Extracts the generated <Theme> element's Colors/Font/Style/Logo into something directly usable
// as inline CSS — the only part of the vocabulary that's purely cosmetic (per the plan's Phase 2
// scope note), so applying it needed no backend/engine changes at all, just reading what's already
// stored and stopping ignoring it in the Run panel.
export function parseThemeForRun(xml) {
  if (!xml) return DEFAULT_THEME;
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  const logo = root.querySelector("Logo");
  const colors = root.querySelector("Colors");
  const font = root.querySelector("Font");
  const style = root.querySelector("Style");
  // <Layout> is the newer, optional part of the vocabulary — the app's whole visual system (shell,
  // nav, header, cards, tables, appearance…). null for apps generated before it existed; the Run
  // panel then derives one from the app's domain instead (see designProfile.js).
  const layoutEl = root.querySelector("Layout");
  const layout = layoutEl ? Object.fromEntries(Array.from(layoutEl.attributes).map((a) => [a.name, a.value])) : null;
  // <Tokens> — optional fine-grained values (exact surface/text colors, shadow, spacing…); they're
  // validated before use in designTokens.js.
  const tokensEl = root.querySelector("Tokens");
  const tokens = tokensEl ? Object.fromEntries(Array.from(tokensEl.attributes).map((a) => [a.name, a.value])) : null;
  return {
    layout,
    tokens,
    fontName: font?.getAttribute("family") || null,
    headingFontName: font?.getAttribute("headingFamily") || null,
    hasColors: !!colors,
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
export function buildFullXml(detail) {
  const attrs = [`name="${detail.name}"`];
  if (detail.theme) attrs.push(`theme="${detail.theme}"`);
  if (detail.database) attrs.push(`database="${detail.database}"`);
  const body = detail.elements.map((el) => el.xml.replace(/^/gm, "  ")).join("\n");
  return `<Application ${attrs.join(" ")}>\n${body}\n</Application>`;
}

// Client-side file save — a Blob + temporary <a download>, the same pattern this engine's own
// generated apps use for CSV export (see aiService.ts's prompt) — no server round-trip needed
// since buildFullXml already has everything.
export function downloadTextFile(filename, contents, mimeType = "application/xml") {
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
export function xmlFilenameFor(name) {
  const safe = (name || "application").trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-") || "application";
  return `${safe}.xml`;
}

// Converts this Application's Entity/Relationship elements into the SAME {tables:[{name,
// columns:[{name,type,pk,fk}]}]} shape ERDiagram.jsx/erDiagram.js already render for the (now
// retired) old engine's schema view — zero changes needed to either, just a new source shape.
export function applicationToErTables(detail) {
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
export function parseRelationshipForRunFull(xml) {
  const el = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  return {
    fromEntity: el.getAttribute("fromEntity"), fromField: el.getAttribute("fromField"),
    toEntity: el.getAttribute("toEntity"), toField: el.getAttribute("toField"),
  };
}

// A plain, at-a-glance digest of an Application for the workspace Overview and the Ask panel's
// suggested questions — counts per element type, plus each Entity's field stats and which
// screens/validations point at it. Deterministic (no AI); the Ask panel is where the AI explains.
export function summarizeApplication(detail) {
  const elements = detail?.elements || [];
  const counts = {};
  for (const el of elements) counts[el.tag] = (counts[el.tag] || 0) + 1;
  const screens = elements.filter((e) => e.tag === "Screen").map((e) => ({ name: e.name, ...parseScreenForRun(e.xml) }));
  const validations = elements.filter((e) => e.tag === "Validation").map((e) => parseValidationForRun(e.xml));
  const entities = elements.filter((e) => e.tag === "Entity").map((e) => {
    const parsed = parseEntityForRun(e.xml);
    return {
      name: e.name,
      icon: parsed.icon,
      isAccount: parsed.isAccount,
      fieldCount: parsed.fields.length,
      requiredCount: parsed.fields.filter((f) => f.required).length,
      screenCount: screens.filter((s) => s.entity === e.name).length,
      validationCount: validations.filter((v) => v.entity === e.name).length,
    };
  });
  const roles = [...new Set(screens.flatMap((s) => s.requiresRole || []))];
  return { counts, entities, screens, validations, roles, hasAccounts: entities.some((e) => e.isAccount) };
}
