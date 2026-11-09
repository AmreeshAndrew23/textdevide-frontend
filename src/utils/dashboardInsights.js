// Builds a generated app's Dashboard from what the app actually IS — its entities' field types,
// relationships, and real saved rows — instead of one identical "card per module" layout for
// every app. Deterministic and domain-agnostic: a hospital app surfaces upcoming appointments and
// appointments-by-doctor, an insurance app pending claims and total claim amount, because those are
// the entities with dates/statuses/amounts/links — no per-domain code, no AI call, no regeneration.
import { parseEntityForRun, parseRelationshipForRunFull, humanize } from "./applicationXml";
import { pluralize, toneForValue } from "./runtimeFormat";

const STATUS_PRIMARY = /(status|stage|state)$/i;
const STATUS_SECONDARY = /(priority|severity|type|category|level|outcome|result)$/i;
const MONEY = /(amount|total|price|cost|salary|fee|fees|balance|premium|budget|revenue|payment|wage|charge|charges|value|paid|due)$/i;
const WHEN_PRIMARY = /(appointment|scheduled|due|deadline|start|visit|event|admission|follow)/i;
const LABEL_FIELD = /(^name$|fullname|full_name|title|^label$|^code$|number$|^subject$|firstname|first_name)/i;
const SECRET = /(password|hash|token|secret)/i;

function pick(fields, preds) {
  for (const p of preds) {
    const f = fields.find(p);
    if (f) return f;
  }
  return null;
}

function asDate(value) {
  if (!value) return null;
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// The human label of one row — a name/title-like field if the entity has one, else the first
// plain text field that isn't the key, an email, or a secret.
export function rowLabel(fields, row) {
  const key = fields.find((f) => f.key)?.name;
  const text = fields.filter((f) => f.name !== key && (f.type === "string" || f.type === "enum") && !SECRET.test(f.name));
  const first = text.find((f) => /first_?name/i.test(f.name));
  const last = text.find((f) => /last_?name/i.test(f.name));
  if (first && last && row[first.name]) return `${row[first.name]} ${row[last.name] || ""}`.trim();
  const named = text.find((f) => LABEL_FIELD.test(f.name) && row[f.name]);
  if (named) return String(row[named.name]);
  const any = text.find((f) => f.type === "string" && !/email/i.test(f.name) && row[f.name]);
  if (any) return String(any && row[any.name]);
  return key && row[key] != null ? String(row[key]) : "";
}

function analyzeModule(m, entityFields, relsFrom, rows) {
  const fields = entityFields.get(m.key) || [];
  const enums = fields.filter((f) => f.type === "enum" && f.values.length > 0);
  const statusField = pick(enums, [(f) => STATUS_PRIMARY.test(f.name), (f) => STATUS_SECONDARY.test(f.name), () => true]);
  const dates = fields.filter((f) => f.type === "date" && !/(dob|birth)/i.test(f.name));
  const dateField = pick(dates, [(f) => WHEN_PRIMARY.test(f.name), (f) => /date$/i.test(f.name), () => true]);
  const numbers = fields.filter((f) => (f.type === "decimal" || f.type === "integer") && MONEY.test(f.name));
  const moneyField = pick(numbers, [(f) => f.type === "decimal", () => true]);
  const fks = relsFrom.get(m.key) || [];
  const loaded = Array.isArray(rows);
  const score = fks.length * 2 + (statusField ? 2 : 0) + (dateField ? 1.5 : 0) + (moneyField ? 1 : 0) + (loaded && rows.length > 0 ? 0.5 : 0);
  return { module: m, fields, statusField, dateField, moneyField, fks, rows: loaded ? rows : null, score };
}

function breakdown(a) {
  if (!a.statusField || !a.rows || a.rows.length === 0) return null;
  const counts = new Map(a.statusField.values.map((v) => [v, 0]));
  for (const r of a.rows) {
    const v = r[a.statusField.name];
    if (v == null || v === "") continue;
    counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  }
  const buckets = [...counts.entries()].map(([value, count]) => ({ value, count, tone: toneForValue(value) })).filter((b) => b.count > 0);
  if (buckets.length === 0) return null;
  buckets.sort((x, y) => y.count - x.count);
  return {
    key: `${a.module.key}.${a.statusField.name}`,
    title: `${pluralize(a.module.label)} by ${humanize(a.statusField.name).toLowerCase()}`,
    module: a.module,
    total: buckets.reduce((n, b) => n + b.count, 0),
    buckets,
  };
}

/**
 * modules: buildAppModules output ({key, label, icon, screenEl, formScreenEl})
 * detail: the Application ({elements})
 * rowsByEntity: { [entityName]: row[] | "loading" | null }
 */
export function buildInsights({ modules, detail, rowsByEntity, now = new Date() }) {
  const entityFields = new Map(
    (detail?.elements || []).filter((e) => e.tag === "Entity").map((e) => [e.name, parseEntityForRun(e.xml).fields])
  );
  const rels = (detail?.elements || []).filter((e) => e.tag === "Relationship").map((e) => parseRelationshipForRunFull(e.xml));
  const relsFrom = new Map();
  for (const r of rels) {
    if (!relsFrom.has(r.fromEntity)) relsFrom.set(r.fromEntity, []);
    relsFrom.get(r.fromEntity).push(r);
  }

  // id → label for every entity whose rows we have, so foreign keys read as names, not UUIDs.
  const labelIndex = new Map();
  for (const [entity, rows] of Object.entries(rowsByEntity || {})) {
    if (!Array.isArray(rows)) continue;
    const fields = entityFields.get(entity) || [];
    const key = fields.find((f) => f.key)?.name || "id";
    labelIndex.set(entity, new Map(rows.map((r) => [String(r[key]), rowLabel(fields, r)])));
  }
  const fkLabel = (rel, value) => labelIndex.get(rel.toEntity)?.get(String(value)) || null;

  const analyses = modules.map((m) => analyzeModule(m, entityFields, relsFrom, rowsByEntity?.[m.key]));
  const allLoaded = analyses.every((a) => a.rows !== null || rowsByEntity?.[a.module.key] === null);
  const ranked = [...analyses].sort((x, y) => y.score - x.score || (y.rows?.length || 0) - (x.rows?.length || 0));
  const focus = ranked[0] || null;

  const today = startOfDay(now);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // ----- KPIs: the focus entity, what needs attention, money, then the next busiest modules -----
  const kpis = [];
  if (focus) {
    const thisMonth = focus.dateField && focus.rows
      ? focus.rows.filter((r) => { const d = asDate(r[focus.dateField.name]); return d && d >= monthStart; }).length
      : null;
    kpis.push({
      key: `count.${focus.module.key}`, module: focus.module, kind: "count",
      label: `Total ${pluralize(focus.module.label).toLowerCase()}`,
      value: focus.rows ? focus.rows.length : null,
      sub: thisMonth != null ? `${thisMonth} this month` : null,
    });
  }
  const attention = ranked.find((a) => a.statusField && a.rows && a.rows.some((r) => toneForValue(r[a.statusField.name]) === "warning"));
  if (attention) {
    const byValue = new Map();
    for (const r of attention.rows) {
      const v = r[attention.statusField.name];
      if (toneForValue(v) === "warning") byValue.set(v, (byValue.get(v) || 0) + 1);
    }
    const [topValue] = [...byValue.entries()].sort((x, y) => y[1] - x[1])[0];
    const n = [...byValue.values()].reduce((a, b) => a + b, 0);
    kpis.push({
      key: `attention.${attention.module.key}`, module: attention.module, kind: "attention", tone: "warning",
      label: `${pluralize(attention.module.label)} needing attention`, value: n,
      sub: byValue.size === 1 ? `All ${String(topValue).toLowerCase()}` : `Mostly ${String(topValue).toLowerCase()}`,
    });
  }
  const moneyA = ranked.find((a) => a.moneyField && a.rows && a.rows.length > 0);
  if (moneyA) {
    const sum = moneyA.rows.reduce((s, r) => s + (Number(r[moneyA.moneyField.name]) || 0), 0);
    kpis.push({
      key: `money.${moneyA.module.key}`, module: moneyA.module, kind: "money", tone: "success",
      label: `Total ${humanize(moneyA.moneyField.name).toLowerCase()}`,
      value: sum, decimals: moneyA.moneyField.type === "decimal",
      sub: `Across ${moneyA.rows.length} ${pluralize(moneyA.module.label).toLowerCase()}`,
    });
  }
  for (const a of [...analyses].sort((x, y) => (y.rows?.length || 0) - (x.rows?.length || 0))) {
    if (kpis.length >= 4) break;
    if (kpis.some((k) => k.kind === "count" && k.module.key === a.module.key)) continue;
    kpis.push({ key: `count.${a.module.key}`, module: a.module, kind: "count", label: pluralize(a.module.label), value: a.rows ? a.rows.length : null, sub: null });
  }

  // ----- Status breakdowns, focus first -----
  const breakdowns = ranked.map(breakdown).filter(Boolean).slice(0, 3);

  // ----- Timeline: the next dated records (or the latest, if nothing is upcoming) -----
  let timeline = null;
  let upcomingTotal = 0;
  const dated = ranked.find((a) => a.dateField && a.rows && a.rows.length > 0);
  if (dated) {
    const withDates = dated.rows.map((r) => ({ r, d: asDate(r[dated.dateField.name]) })).filter((x) => x.d);
    // Something finished or cancelled isn't coming up, even if its date is in the future.
    const stillOpen = (r) => !dated.statusField || !["danger", "success"].includes(toneForValue(r[dated.statusField.name]));
    const upcoming = withDates.filter((x) => x.d >= today && stillOpen(x.r)).sort((x, y) => x.d - y.d);
    upcomingTotal = upcoming.length;
    const mode = upcoming.length > 0 ? "upcoming" : "recent";
    const list = (mode === "upcoming" ? upcoming : withDates.sort((x, y) => y.d - x.d)).slice(0, 6);
    if (list.length > 0) {
      timeline = {
        mode, module: dated.module, dateField: dated.dateField.name,
        title: `${mode === "upcoming" ? "Upcoming" : "Latest"} ${pluralize(dated.module.label).toLowerCase()}`,
        items: list.map(({ r, d }) => ({
          row: r, date: d,
          title: rowLabel(dated.fields, r) || humanize(dated.module.label),
          // The linked records ("with Dr. Smith · for Jane Doe") — only ones that resolve to a name.
          context: dated.fks.map((rel) => fkLabel(rel, r[rel.fromField])).filter(Boolean).slice(0, 2),
          status: dated.statusField ? r[dated.statusField.name] : null,
        })),
      };
    }
  }

  // ----- Distribution across a linked entity: "Appointments by doctor" -----
  let distribution = null;
  for (const a of ranked) {
    if (!a.rows || a.rows.length === 0) continue;
    let best = null;
    for (const rel of a.fks) {
      if (!labelIndex.has(rel.toEntity)) continue;
      const counts = new Map();
      for (const r of a.rows) {
        const label = fkLabel(rel, r[rel.fromField]);
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      }
      if (counts.size >= 1 && (!best || counts.size > best.counts.size)) best = { rel, counts };
    }
    if (best) {
      const items = [...best.counts.entries()].map(([label, count]) => ({ label, count })).sort((x, y) => y.count - x.count).slice(0, 6);
      distribution = { module: a.module, title: `${pluralize(a.module.label)} by ${humanize(best.rel.toEntity).toLowerCase()}`, items, max: items[0].count };
      break;
    }
  }

  // ----- Hero highlights: up to three domain-specific one-liners -----
  const highlights = [];
  if (timeline?.mode === "upcoming") {
    const todayCount = timeline.items.filter((i) => startOfDay(i.date).getTime() === today.getTime()).length;
    const total = upcomingTotal;
    highlights.push(todayCount > 0
      ? `${todayCount} ${(todayCount === 1 ? dated.module.label : pluralize(dated.module.label)).toLowerCase()} today`
      : `${total} upcoming ${(total === 1 ? dated.module.label : pluralize(dated.module.label)).toLowerCase()}`);
  }
  const attentionKpi = kpis.find((k) => k.kind === "attention");
  if (attentionKpi) highlights.push(`${attentionKpi.value} ${(attentionKpi.value === 1 ? attentionKpi.module.label : pluralize(attentionKpi.module.label)).toLowerCase()} need attention`);
  const moneyKpi = kpis.find((k) => k.kind === "money");
  if (moneyKpi) highlights.push(`${moneyKpi.label}: ${moneyKpi.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

  const emptyModules = analyses.filter((a) => a.rows && a.rows.length === 0).map((a) => a.module);
  const totalRecords = analyses.reduce((n, a) => n + (a.rows?.length || 0), 0);

  return { focus: focus?.module || null, kpis, breakdowns, timeline, distribution, highlights, emptyModules, totalRecords, loading: !allLoaded };
}
