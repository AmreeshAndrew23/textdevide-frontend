import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileUp, X as XIcon } from "lucide-react";
import { autoMap, buildRows, humanizeField, importableFields, MAX_IMPORT_ROWS, missingRequired, parseCsv, templateCsv } from "../utils/csvImport";
import { downloadTextFile } from "../utils/applicationXml";

// "Import CSV" into one module of a generated app — rendered inside the app itself (Studio preview
// and published link alike), so it uses the app's own rt-* styles. Three steps: pick a file, check
// which column fills which field, then see what went in and which rows didn't (by row number, as a
// spreadsheet numbers them).
export default function CsvImportDialog({ http, appPath, entity, label, plural, fields, columnHeaders, onClose, onImported }) {
  const fileRef = useRef(null);
  const targets = importableFields(fields);
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [mapping, setMapping] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError("");
    if (f.size > 5 * 1024 * 1024) { setError("That file is over 5 MB. Split it into smaller files."); return; }
    f.text().then((text) => {
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) { setError("That file has no rows under its header line."); return; }
      if (parsed.rows.length > MAX_IMPORT_ROWS) { setError(`That file has ${parsed.rows.length.toLocaleString()} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString()} at a time.`); return; }
      setFile({ name: f.name, ...parsed });
      setMapping(autoMap(parsed.headers, targets, columnHeaders));
    }).catch(() => setError("Couldn't read that file. Save it as CSV (comma-separated) and try again."));
  }

  function run() {
    setBusy(true);
    setError("");
    http.post(`${appPath}/entities/${entity}/import`, { rows: buildRows(file.rows, mapping) })
      .then((res) => { setResult(res.data); if (res.data.created > 0) onImported(); })
      .catch((e) => setError(e.response?.data?.detail || e.response?.data?.message || "The import failed. Nothing was added."))
      .finally(() => setBusy(false));
  }

  // The page content animates in with a transform, which would trap a fixed overlay inside it:
  // render into the app's root instead (still inside .rt-app, so the app's theme applies).
  const [host, setHost] = useState(null);
  const anchor = useCallback((el) => { if (el) setHost(el.closest(".rt-app") || document.body); }, []);
  if (!host) return <span ref={anchor} hidden />;

  const mappedCount = mapping.filter(Boolean).length;
  const missing = file ? missingRequired(targets, mapping) : [];
  const preview = file ? file.rows.slice(0, 3) : [];
  const word = (n) => (n === 1 ? label.toLowerCase() : plural.toLowerCase());

  return createPortal(
    <div className="rt-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="rt-modal" role="dialog" aria-modal="true" aria-label={`Import ${plural}`} onClick={(e) => e.stopPropagation()}>
        <div className="rt-modal-head">
          <div style={{ flex: 1 }}>
            <div className="rt-modal-title">Import {plural.toLowerCase()}</div>
            <div className="rt-modal-sub">Add many records at once from a CSV file — Excel and Google Sheets can both save one.</div>
          </div>
          <button className="rt-icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><XIcon size={17} /></button>
        </div>

        <div className="rt-modal-body">
          {result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className={`rt-alert ${result.created > 0 ? "success" : "warning"}`}>
                {result.created > 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>
                  {result.created > 0 ? `Added ${result.created.toLocaleString()} ${word(result.created)}.` : "Nothing was added."}
                  {result.errors.length > 0 && ` ${result.errors.length} row${result.errors.length === 1 ? " was" : "s were"} skipped.`}
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="rt-import-errors">
                  {result.errors.slice(0, 50).map((e) => (
                    <div key={e.row}><span className="row">Row {e.row}</span><span>{e.message}</span></div>
                  ))}
                  {result.errors.length > 50 && <div style={{ color: "var(--rt-muted)" }}>…and {result.errors.length - 50} more.</div>}
                </div>
              )}
            </div>
          ) : !file ? (
            <>
              <button type="button" className="rt-dropzone" onClick={() => fileRef.current?.click()}>
                <FileUp size={26} />
                <span style={{ fontWeight: 600 }}>Choose a CSV file</span>
                <span style={{ fontSize: 12.5, color: "var(--rt-muted)" }}>Up to {MAX_IMPORT_ROWS.toLocaleString()} rows. The first line should be column names.</span>
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" onChange={pick} hidden />
              <button type="button" className="rt-btn rt-btn-ghost rt-btn-sm" style={{ marginTop: 12 }}
                onClick={() => downloadTextFile(`${plural.replace(/\s+/g, "-").toLowerCase()}-template.csv`, templateCsv(targets, columnHeaders), "text/csv")}>
                <Download size={14} /> Download a blank template
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "var(--rt-text-2)", marginBottom: 12 }}>
                <strong>{file.name}</strong> · {file.rows.length.toLocaleString()} row{file.rows.length === 1 ? "" : "s"} · match each column to a field
              </div>
              <div className="rt-map">
                {file.headers.map((h, i) => (
                  <div key={i} className="rt-map-row">
                    <div className="rt-map-col">
                      <div style={{ fontWeight: 600 }}>{h || `Column ${i + 1}`}</div>
                      <div className="rt-map-sample">{preview.map((r) => r[i]).filter(Boolean).slice(0, 2).join(" · ") || "—"}</div>
                    </div>
                    <select className="rt-input" value={mapping[i] || ""} onChange={(e) => setMapping((m) => m.map((v, j) => (j === i ? e.target.value : v === e.target.value && e.target.value ? "" : v)))}>
                      <option value="">Don't import</option>
                      {targets.map((f) => <option key={f.name} value={f.name}>{columnHeaders[f.name] || humanizeField(f.name)}{f.required ? " *" : ""}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {missing.length > 0 && (
                <div className="rt-alert warning" style={{ marginTop: 12 }}>
                  <AlertTriangle size={16} />
                  <span>No column fills {missing.map((f) => columnHeaders[f.name] || humanizeField(f.name)).join(", ")}, which {missing.length === 1 ? "is" : "are"} required — rows without {missing.length === 1 ? "it" : "them"} will be skipped.</span>
                </div>
              )}
            </>
          )}
          {error && <div className="rt-alert error" style={{ marginTop: 12 }}><AlertCircle size={16} /> <span>{error}</span></div>}
        </div>

        <div className="rt-modal-foot">
          {result ? (
            <button className="rt-btn rt-btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              {file && <button className="rt-btn rt-btn-ghost" onClick={() => { setFile(null); setMapping([]); }} disabled={busy}>Choose another file</button>}
              <div style={{ flex: 1 }} />
              <button className="rt-btn rt-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              {file && (
                <button className="rt-btn rt-btn-primary" onClick={run} disabled={busy || mappedCount === 0}>
                  {busy ? "Importing…" : `Import ${file.rows.length.toLocaleString()} ${word(file.rows.length)}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    host
  );
}
