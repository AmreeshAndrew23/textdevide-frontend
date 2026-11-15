// "Import CSV" for a module, browser side: read the file, guess which column fills which field,
// and turn the rows into { fieldName: cellText } objects for the server, which converts and checks
// every value (see the backend's runtimeEngine/csvImport.ts). Pure functions, no React.

export const MAX_IMPORT_ROWS = 1000;

// RFC 4180, plus what spreadsheets really produce: a byte-order mark, CRLF or LF line ends, and
// semicolons or tabs in place of commas (whichever the header line uses most).
export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => firstLine.split(ch).length - 1;
  const delimiter = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];

  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const [headers = [], ...data] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: data };
}

const AUDIT_NAMES = /^(createdBy|createdOn|createdAt|updatedBy|updatedOn|updatedAt|modifiedBy|modifiedOn|modifiedAt)$/i;
const SECRET_NAMES = /^(passwordHash|password|emailVerified|mustChangePassword|authProvider)$/;

// The fields a file may fill (the server enforces the same list; this is what the mapping offers).
export function importableFields(fields) {
  return (fields || []).filter((f) => !f.key && !f.autoNumber && !f.name.startsWith("__") && !AUDIT_NAMES.test(f.name) && !SECRET_NAMES.test(f.name));
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// dateOfBirth -> "Date of birth", doctorId -> "Doctor".
export const humanizeField = (name) => String(name).replace(/Id$/, "").replace(/([a-z])([A-Z])/g, (_, a, b) => `${a} ${b.toLowerCase()}`).replace(/^./, (c) => c.toUpperCase());

// For each column, the field it most likely fills, or "" to skip it. Matches the field's name, its
// readable label, or the header the module's own list (and so its Export) uses for it.
export function autoMap(headers, fields, columnHeaders = {}) {
  const used = new Set();
  return headers.map((h) => {
    const n = norm(h);
    if (!n) return "";
    const match = fields.find((f) => !used.has(f.name) && [f.name, humanizeField(f.name), columnHeaders[f.name], f.name.replace(/Id$/, "")].some((c) => c && norm(c) === n));
    if (!match) return "";
    used.add(match.name);
    return match.name;
  });
}

export function buildRows(rows, mapping) {
  return rows.map((cells) => {
    const out = {};
    mapping.forEach((field, i) => { if (field) out[field] = (cells[i] ?? "").trim(); });
    return out;
  });
}

// Required fields no column fills — every row would be rejected, so say so before importing.
export function missingRequired(fields, mapping) {
  const mapped = new Set(mapping.filter(Boolean));
  return fields.filter((f) => f.required && !mapped.has(f.name));
}

// A blank file to fill in, with the headers Import expects.
export function templateCsv(fields, columnHeaders = {}) {
  return fields.map((f) => {
    const h = columnHeaders[f.name] || humanizeField(f.name);
    return /[",\n]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h;
  }).join(",") + "\r\n";
}
