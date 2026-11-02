import { LayoutDashboard, Search, Bell, Plus } from "lucide-react";
import { designToCss } from "../utils/designProfile";
import { useDesignFonts } from "../utils/designFonts";
import { avatarColors, pluralize, toneForValue } from "../utils/runtimeFormat";
import DomainMotif from "./DomainMotif";

// A miniature of a generated app rendered with a given design — the Studio's Design tab uses it
// for the current look, every variation, and the fine-tune live preview. It goes through the
// same designToCss() + .rt-* classes as the real Run panel, so what you see is what you get.
// Drawn at full size (900×560) and scaled down, so typography and spacing stay true.

const SAMPLE_ROWS = [
  ["Asha Nair", "Active", "Mar 12, 2026", "1,240"],
  ["Ben Cole", "Pending", "Mar 14, 2026", "860"],
  ["Chen Wei", "Completed", "Mar 18, 2026", "2,115"],
  ["Dana Ruiz", "Cancelled", "Mar 21, 2026", "430"],
];
const W = 900;
const H = 560;

export default function DesignPreview({ design, appName, modules = [], width = 540 }) {
  useDesignFonts(design.bodyFont, design.headingFont);
  const { className, style } = designToCss(design);
  const scale = width / W;
  const mods = (modules.length ? modules : ["Records", "People", "Reports"]).slice(0, 4);
  const first = mods[0];
  const navItems = (
    <>
      <div className="rt-nav-item active"><LayoutDashboard size={16} /> {design.shell === "rail" ? <span>Home</span> : "Dashboard"}</div>
      {mods.map((m) => (
        <div key={m} className="rt-nav-item">
          <span className="rt-avatar" style={{ width: 16, height: 16, fontSize: 8, background: "currentColor", opacity: 0.35 }} />
          {design.shell === "rail" ? <span>{pluralize(m)}</span> : pluralize(m)}
        </div>
      ))}
    </>
  );
  const brand = (
    <div className="rt-brand" style={design.shell === "topnav" ? undefined : { height: 56 }}>
      <div className="rt-logo" style={{ width: 28, height: 28, fontSize: 12 }}>{(appName || "A").charAt(0).toUpperCase()}</div>
      {design.shell !== "rail" && <div className="rt-brand-name" style={{ fontSize: 13 }}>{appName}</div>}
    </div>
  );
  const hero = design.header === "minimal" ? (
    <div className="rt-minimal-head" style={{ paddingBottom: 14 }}>
      <div style={{ flex: 1 }}>
        <div className="rt-heading" style={{ fontSize: 24, fontWeight: 800 }}>Good morning, Asha</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}><span className="rt-hero-chip">3 due today</span><span className="rt-hero-chip">2 need attention</span></div>
      </div>
      <button className="rt-btn rt-btn-primary"><Plus size={14} /> New {first.toLowerCase()}</button>
    </div>
  ) : design.header === "split" ? (
    <div className="rt-card rt-hero-split">
      <div className="lead" style={{ padding: 20 }}>
        <div className="rt-heading" style={{ fontSize: 22, fontWeight: 800 }}>Good morning, Asha</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}><span className="rt-hero-chip">3 due today</span></div>
        <button className="rt-btn rt-btn-primary" style={{ marginTop: 14 }}><Plus size={14} /> New {first.toLowerCase()}</button>
      </div>
      <div className="focus" style={{ padding: 20 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Total {pluralize(first).toLowerCase()}</span>
        <div className="rt-heading" style={{ fontSize: 38, fontWeight: 800 }}>1,284</div>
      </div>
    </div>
  ) : (
    <div className={`rt-hero${design.header === "pattern" ? " pattern" : ""}`} style={{ padding: "22px 24px" }}>
      <div className="rt-hero-motif"><DomainMotif domain={design.domain} style={{ width: "100%", height: "auto", display: "block" }} /></div>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div className="rt-heading" style={{ fontSize: 24, fontWeight: 800 }}>Good morning, Asha</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>3 due today · 2 need attention</div>
        <div style={{ marginTop: 14 }}><span className="rt-hero-btn"><Plus size={14} /> New {first.toLowerCase()}</span></div>
      </div>
    </div>
  );
  const kpis = (
    <div className="rt-dash-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
      {[[first, "1,284"], [mods[1] || "Open item", "37"], [mods[2] || "Total amount", "92,410"]].map(([label, value]) => {
        const [bg, fg] = avatarColors(label);
        return (
          <div key={label} className="rt-card rt-kpi" style={{ "--kpi-bg": bg, "--kpi-fg": fg, padding: 14 }}>
            <div className="rt-kpi-icon" style={{ width: 30, height: 30, background: bg, color: fg }}><LayoutDashboard size={15} /></div>
            <div className="rt-kpi-value" style={{ fontSize: 26, marginTop: 10 }}>{value}</div>
            <div className="rt-kpi-label">{pluralize(label)}</div>
          </div>
        );
      })}
    </div>
  );
  const table = (
    <div className="rt-card" style={{ overflow: "hidden" }}>
      <table className="rt-table">
        <thead><tr><th>Name</th><th>Status</th><th>Date</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {SAMPLE_ROWS.map(([n, st, d, amt]) => {
            const [bg, fg] = avatarColors(n);
            return (
              <tr key={n}>
                <td className="primary-cell"><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="rt-avatar" style={{ width: 24, height: 24, fontSize: 10, background: bg, color: fg }}>{n[0]}</span>{n}</span></td>
                <td><span className={`rt-badge ${toneForValue(st)}`}>{st}</span></td>
                <td>{d}</td>
                <td className="num">{amt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const body = (
    <div className={`rt-dash rt-comp-${design.style}`} style={{ padding: 20, gap: 14 }}>
      <div className="rt-dash-hero">{hero}</div>
      {kpis}
      <div className="rt-dash-main">{table}</div>
    </div>
  );
  const topActions = (
    <>
      <div className="rt-search" style={{ width: 160 }}><Search size={13} /><input className="rt-input" readOnly placeholder="Search…" style={{ padding: "5px 8px" }} /></div>
      <span className="rt-icon-btn"><Bell size={15} /></span>
    </>
  );

  return (
    <div style={{ width, height: H * scale, overflow: "hidden", borderRadius: 12, position: "relative", pointerEvents: "none", userSelect: "none" }} aria-hidden="true">
      <div className={className} style={{ ...style, width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {design.shell === "topnav" ? (
          <div className="rt-shell topnav" style={{ flex: 1, minHeight: 0 }}>
            <div className="rt-topnav" style={{ height: 54 }}>{brand}<div className="rt-topnav-links">{navItems}</div>{topActions}</div>
            <div className="rt-main" style={{ overflow: "hidden" }}>{body}</div>
          </div>
        ) : (
          <div className="rt-shell" style={{ flex: 1, minHeight: 0 }}>
            <div className={`rt-sidebar${design.shell === "rail" ? " rail" : ""}`} style={design.shell === "rail" ? undefined : { width: 190 }}>
              {brand}
              <div className="rt-nav">{navItems}</div>
            </div>
            <div className="rt-main" style={{ overflow: "hidden" }}>
              <div className="rt-topbar" style={{ height: 50 }}><div className="rt-crumbs"><span className="current">Dashboard</span></div><div style={{ flex: 1 }} />{topActions}</div>
              {body}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
