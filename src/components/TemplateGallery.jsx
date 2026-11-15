import { useState } from "react";
import { ArrowRight, Check, KeyRound, LayoutGrid, Pencil, Sparkles, X as XIcon } from "lucide-react";
import DomainMotif from "./DomainMotif";
import { TEMPLATE_CATEGORIES, templatesIn } from "../utils/appTemplates";

// Home's "Start from a template" — ready-made app descriptions (see utils/appTemplates.js). Picking
// one shows what it builds; "Use template" creates the project and generates it straight away,
// "Edit description first" drops the text into the composer to change before generating.
export default function TemplateGallery({ onUse, onCustomize, busy }) {
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState(null);
  const list = templatesIn(category);

  return (
    <section style={{ marginTop: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Start from a template</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Complete apps with sign-in, roles, numbering and rules. Change anything afterwards.</div>
        </div>
      </div>
      <div className="tpl-cats" role="tablist" aria-label="Template categories">
        {TEMPLATE_CATEGORIES.filter((c) => c === "All" || templatesIn(c).length > 0).map((c) => (
          <button key={c} role="tab" aria-selected={category === c} className={`chip${category === c ? " chip-active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      <div className="tpl-grid">
        {list.map((t) => (
          <button key={t.id} type="button" className="tpl-card hover-lift" onClick={() => setOpen(t)} style={{ "--tpl": t.accent }}>
            <div className="tpl-art"><DomainMotif domain={t.domain} style={{ width: "100%", height: "100%" }} /></div>
            <div className="tpl-body">
              <div className="tpl-cat">{t.category}</div>
              <div className="tpl-name">{t.name}</div>
              <div className="tpl-blurb">{t.blurb}</div>
              <div className="tpl-meta"><LayoutGrid size={12} /> {t.modules.length} modules <span>·</span> <KeyRound size={12} /> {t.roles.length} role{t.roles.length === 1 ? "" : "s"}</div>
            </div>
          </button>
        ))}
      </div>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !busy && setOpen(null)}>
          <div className="studio-card fade-in" role="dialog" aria-modal="true" aria-label={open.name} style={{ width: 560, maxWidth: "100%", maxHeight: "calc(100vh - 32px)", overflowY: "auto", padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="tpl-hero" style={{ "--tpl": open.accent }}>
              <DomainMotif domain={open.domain} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              <button className="studio-icon-btn" onClick={() => setOpen(null)} title="Close" disabled={busy} style={{ position: "absolute", top: 12, right: 12 }}><XIcon size={16} /></button>
              <div style={{ position: "relative" }}>
                <div className="tpl-cat" style={{ color: "#fff", opacity: 0.85 }}>{open.category}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{open.name}</div>
              </div>
            </div>
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.55 }}>{open.blurb}</div>
              <div>
                <div className="tpl-label">Modules</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{open.modules.map((m) => <span key={m} className="studio-pill studio-pill-muted">{m}</span>)}</div>
              </div>
              <div>
                <div className="tpl-label">Roles</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{open.roles.map((r) => <span key={r} className="studio-pill studio-pill-soft">{r}</span>)}</div>
              </div>
              <div>
                <div className="tpl-label">Built in</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {open.highlights.map((h) => <div key={h} style={{ display: "flex", gap: 8, fontSize: 13.5, color: "var(--text-2)" }}><Check size={15} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} /> {h}</div>)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Takes about a minute to generate, and uses one AI request.</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="studio-btn-secondary" disabled={busy} onClick={() => { onCustomize(open); setOpen(null); }}><Pencil size={14} /> Edit description first</button>
                <button className="studio-btn-ai" disabled={busy} onClick={() => onUse(open)}>
                  {busy ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : <><Sparkles size={15} /> Use template <ArrowRight size={14} /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
