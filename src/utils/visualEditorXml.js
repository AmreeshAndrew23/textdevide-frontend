// Pure XML <-> plain-tree adapter for the visual (drag-and-drop) screen editor. Deliberately NOT
// coupled to Craft.js's own internal node/serialization format — Craft-specific glue (building real
// Craft nodes from this plain tree, and reading Craft's live editor state back into one) lives in
// VisualScreenEditor.jsx at runtime. Keeping the actual XML <-> tree logic here, decoupled and pure,
// is what makes it unit-testable without needing to run the Craft.js editor itself.
//
// The plain tree shape mirrors backend-node/src/runtime/screenModel.ts's FieldItem/GridItem/
// ButtonItem/FieldsetItem EXACTLY (same attributes, same names) — this is the single source of
// truth for what a <ui> node can carry; this adapter must round-trip every one of them, not a
// simplified subset, or a visual edit could silently drop something an AI-generated screen relied on.
//
// Node shape: { type: "field"|"grid"|"button"|"fieldset", id, props: {...}, children: Node[] }
// (children is only ever populated for "fieldset"; every other type has no children.)

function attr(el, name, fallback = "") {
  return el?.getAttribute(name) ?? fallback;
}

function textOf(el, selector) {
  return el?.querySelector(selector)?.textContent?.trim() || "";
}

function parseRoleList(value) {
  if (!value) return null;
  const roles = value.split(",").map((r) => r.trim()).filter(Boolean);
  return roles.length ? roles : null;
}

function parseRule(r) {
  const rule = {};
  if (attr(r, "required") === "true") rule.required = true;
  if (attr(r, "unique") === "true") rule.unique = true;
  const pattern = attr(r, "pattern");
  if (pattern) rule.pattern = pattern;
  for (const key of ["maxLength", "minValue", "maxValue", "minAge", "maxAge"]) {
    const v = attr(r, key);
    if (v !== "") rule[key] = Number(v);
  }
  return rule;
}

function parseFieldEl(el) {
  const optionValue = el.getAttribute("optionValue");
  const optionLabel = el.getAttribute("optionLabel");
  return {
    type: "field",
    id: attr(el, "id"),
    props: {
      label: attr(el, "label") || attr(el, "id"),
      fieldType: attr(el, "type") || "text",
      readonly: attr(el, "readonly") === "true",
      persistenceMapping: el.getAttribute("persistenceMapping") || "",
      defaultValue: el.getAttribute("default"),
      hint: textOf(el, ":scope > hint") || "",
      rules: Array.from(el.querySelectorAll(":scope > rule")).map(parseRule),
      options: Array.from(el.querySelectorAll(":scope > option")).map((o) => ({
        value: attr(o, "value"), label: attr(o, "label", attr(o, "value")),
      })),
      optionsBinding: optionValue && optionLabel ? { valueColumn: optionValue, labelColumn: optionLabel } : null,
      visibleRoles: parseRoleList(el.getAttribute("visibleRoles")),
    },
    children: [],
  };
}

function parseGridEl(el) {
  const actionsEl = el.querySelector(":scope > actions");
  const actions = actionsEl
    ? Array.from(actionsEl.querySelectorAll(":scope > action")).map((a) => {
        const type = attr(a, "type");
        if (type === "delete") return { type: "delete", target: attr(a, "target"), confirm: a.getAttribute("confirm") };
        return { type: "edit" };
      })
    : [];
  return {
    type: "grid",
    id: attr(el, "id"),
    props: {
      label: attr(el, "label") || attr(el, "id"),
      emptyMessage: attr(el, "emptyMessage", "No records."),
      columns: Array.from(el.querySelectorAll(":scope > columns > column, :scope > column")).map((c) => ({
        id: attr(c, "id"), header: attr(c, "header") || attr(c, "id"),
        binding: attr(c, "binding") || attr(c, "id"), persistenceMapping: c.getAttribute("persistenceMapping") || "",
      })),
      actions,
    },
    children: [],
  };
}

function parseButtonEl(el) {
  return {
    type: "button",
    id: attr(el, "id"),
    props: { label: attr(el, "label") || attr(el, "id"), style: attr(el, "style") || "primary" },
    children: [],
  };
}

function parseItems(containerEl) {
  return Array.from(containerEl.children)
    .map((child) => {
      const tag = child.tagName.toLowerCase();
      if (tag === "field") return parseFieldEl(child);
      if (tag === "grid") return parseGridEl(child);
      if (tag === "button") return parseButtonEl(child);
      if (tag === "fieldset") return { type: "fieldset", id: "", props: { legend: attr(child, "legend") }, children: parseItems(child) };
      return null;
    })
    .filter(Boolean);
}

// Parses just the <ui> block of a screen's XML into the plain tree. Degrades to an empty tree
// (never throws) on malformed/empty XML or a document with no <ui> — the editor should start from
// a blank canvas rather than crash on a screen that isn't ready for visual editing yet.
export function xmlToCraftTree(xmlString) {
  if (!xmlString || !xmlString.trim()) return { items: [] };
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlString, "application/xml");
    if (doc.querySelector("parsererror")) return { items: [] };
  } catch {
    return { items: [] };
  }
  const uiEl = doc.querySelector("screen > ui");
  if (!uiEl) return { items: [] };
  return { items: parseItems(uiEl) };
}

function setRoleList(el, name, roles) {
  if (roles && roles.length) el.setAttribute(name, roles.join(","));
}

function buildFieldEl(doc, node) {
  const el = doc.createElement("field");
  el.setAttribute("id", node.id);
  el.setAttribute("label", node.props.label ?? "");
  el.setAttribute("type", node.props.fieldType ?? "text");
  if (node.props.readonly) el.setAttribute("readonly", "true");
  if (node.props.persistenceMapping) el.setAttribute("persistenceMapping", node.props.persistenceMapping);
  if (node.props.defaultValue !== null && node.props.defaultValue !== undefined) el.setAttribute("default", node.props.defaultValue);
  if (node.props.optionsBinding) {
    el.setAttribute("optionValue", node.props.optionsBinding.valueColumn);
    el.setAttribute("optionLabel", node.props.optionsBinding.labelColumn);
  }
  setRoleList(el, "visibleRoles", node.props.visibleRoles);
  if (node.props.hint) {
    const hintEl = doc.createElement("hint");
    hintEl.textContent = node.props.hint;
    el.appendChild(hintEl);
  }
  for (const rule of node.props.rules || []) {
    const r = doc.createElement("rule");
    if (rule.required) r.setAttribute("required", "true");
    if (rule.unique) r.setAttribute("unique", "true");
    if (rule.pattern) r.setAttribute("pattern", rule.pattern);
    for (const key of ["maxLength", "minValue", "maxValue", "minAge", "maxAge"]) {
      if (rule[key] !== undefined && rule[key] !== null && rule[key] !== "") r.setAttribute(key, String(rule[key]));
    }
    el.appendChild(r);
  }
  for (const opt of node.props.options || []) {
    const o = doc.createElement("option");
    o.setAttribute("value", opt.value);
    o.setAttribute("label", opt.label ?? opt.value);
    el.appendChild(o);
  }
  return el;
}

function buildGridEl(doc, node) {
  const el = doc.createElement("grid");
  el.setAttribute("id", node.id);
  el.setAttribute("label", node.props.label ?? "");
  el.setAttribute("emptyMessage", node.props.emptyMessage ?? "No records.");
  for (const col of node.props.columns || []) {
    const c = doc.createElement("column");
    c.setAttribute("id", col.id);
    c.setAttribute("header", col.header ?? col.id);
    c.setAttribute("binding", col.binding ?? col.id);
    if (col.persistenceMapping) c.setAttribute("persistenceMapping", col.persistenceMapping);
    el.appendChild(c);
  }
  if ((node.props.actions || []).length) {
    const actionsEl = doc.createElement("actions");
    for (const a of node.props.actions) {
      const ael = doc.createElement("action");
      ael.setAttribute("type", a.type);
      if (a.type === "delete") {
        if (a.target) ael.setAttribute("target", a.target);
        if (a.confirm) ael.setAttribute("confirm", a.confirm);
      }
      actionsEl.appendChild(ael);
    }
    el.appendChild(actionsEl);
  }
  return el;
}

function buildButtonEl(doc, node) {
  const el = doc.createElement("button");
  el.setAttribute("id", node.id);
  el.setAttribute("label", node.props.label ?? "");
  el.setAttribute("style", node.props.style ?? "primary");
  return el;
}

function buildItemEls(doc, items) {
  return items.map((node) => {
    if (node.type === "field") return buildFieldEl(doc, node);
    if (node.type === "grid") return buildGridEl(doc, node);
    if (node.type === "button") return buildButtonEl(doc, node);
    if (node.type === "fieldset") {
      const el = doc.createElement("fieldset");
      el.setAttribute("legend", node.props.legend ?? "");
      for (const child of buildItemEls(doc, node.children || [])) el.appendChild(child);
      return el;
    }
    return null;
  }).filter(Boolean);
}

// Replaces ONLY the <ui>...</ui> block inside existingXml with one built from `items` — every other
// top-level element (<header>, <dataSources>, <queries>, <events>, <dataBindings>,
// <accessibility>) is carried through completely untouched, since those are never edited visually
// in v1. This is the critical correctness property: a visual structure edit must never silently
// drop or corrupt the event/query wiring an AI generation (or hand-edit) already built.
export function craftTreeToXml(items, existingXml) {
  const doc = new DOMParser().parseFromString(existingXml || "<screen/>", "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Existing screen XML is not well-formed — cannot save visual changes.");
  const screenEl = doc.querySelector("screen");
  if (!screenEl) throw new Error("Existing screen XML has no <screen> root — cannot save visual changes.");

  let uiEl = screenEl.querySelector(":scope > ui");
  if (uiEl) {
    while (uiEl.firstChild) uiEl.removeChild(uiEl.firstChild);
  } else {
    uiEl = doc.createElement("ui");
    const eventsEl = screenEl.querySelector(":scope > events");
    if (eventsEl) screenEl.insertBefore(uiEl, eventsEl);
    else screenEl.appendChild(uiEl);
  }
  for (const child of buildItemEls(doc, items)) uiEl.appendChild(child);

  return new XMLSerializer().serializeToString(doc);
}
