import { useState } from "react";
import { Sparkles, Shuffle, Palette, SlidersHorizontal, Upload, Globe, RotateCcw, Check, X as XIcon, Wand2 } from "lucide-react";
import api, { API_ORIGIN } from "../api/client";
import DesignPreview from "./DesignPreview";
import { parseThemeForRun, humanize } from "../utils/applicationXml";
import { resolveDesign, STYLES, STYLE_DEFAULTS, FONT_WHITELIST } from "../utils/designProfile";
import { generateVariation, designToThemeXml, specFromDesign, extractPalette, hexToHsl } from "../utils/designStudio";

// The Studio's Design tab for one app: see its current look, describe a new one in words (AI),
// pick from generated variations (blended design languages + color-theory palettes), bring a
// brand (logo colors, a website's colors/fonts), fine-tune every axis with a live preview, or go
// back to the automatic domain-based design. Saving is an ordinary PATCH of the app's <Theme>
// (reusing its existing name, which is how the merge matches and replaces it).

const STYLE_INFO = {
  corporate: "Dense, sharp, ruled — finance & operations",
  soft: "Pastel, round, floating cards — care & people",
  playful: "Saturated tiles, chunky type — learning & retail",
  editorial: "Serif headlines, ivory paper — hospitality & luxury",
  glass: "Dark, frosted, glowing — fintech & media",
  brutal: "Ink borders, hard shadows — bold startups",
  minimal: "Monochrome, quiet, precise — tools & property",
};
const LOOK_EXAMPLES = [
  "Warm and luxurious, like a boutique hotel",
  "Calm, clinical and trustworthy",
  "Dark, sleek fintech with neon accents",
  "Bold and youthful, lots of color",
  "Serious and minimal, like a Swiss bank",
];
const OPTIONS = {
  shell: ["sidebar", "topnav", "rail"],
  appearance: ["light", "dark"],
  nav: ["light", "tinted", "solid", "dark"],
  header: ["banner", "pattern", "split", "minimal"],
  cards: ["bordered", "elevated", "soft"],
  tables: ["lines", "striped", "cards"],
  canvas: ["cool", "warm", "tinted"],
  auth: ["split", "split-right", "centered"],
  density: ["comfortable", "compact"],
};
const FIELD_LABELS = { shell: "Layout", appearance: "Appearance", nav: "Navigation", header: "Dashboard header", cards: "Cards", tables: "Tables", canvas: "Background tone", auth: "Sign-in page", density: "Density" };
const FONTS = [...FONT_WHITELIST];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>
      {label}
      {children}
    </label>
  );
}

export default function DesignStudio({ applicationId, detail, onDetailChange }) {
  const themeEl = detail.elements.find((e) => e.tag === "Theme");
  const themeName = themeEl?.name || "default";
  const theme = parseThemeForRun(themeEl?.xml);
  const current = resolveDesign(detail, theme);
  const modules = detail.elements.filter((e) => e.tag === "Entity" && e.name !== "User").map((e) => humanize(e.name));
  const toDesign = (spec) => resolveDesign(detail, parseThemeForRun(designToThemeXml(spec, { name: themeName })));

  const [seed, setSeed] = useState(0);
  const [keepColors, setKeepColors] = useState(false);
  const [working, setWorking] = useState(null); // spec being fine-tuned, or null
  const [pendingLogo, setPendingLogo] = useState(undefined); // undefined = keep current logo
  const [look, setLook] = useState("");
  const [lookBusy, setLookBusy] = useState(false);
  const [lookXml, setLookXml] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [brandUrl, setBrandUrl] = useState("");
  const [brandBusy, setBrandBusy] = useState(false);
  const [brand, setBrand] = useState(null); // { colors, fonts, title } from a site or a logo
  const [logoBusy, setLogoBusy] = useState(false);

  const baseHue = hexToHsl(current.primary)?.h;
  // Three deterministic variations per shuffle (seeded), so they're stable across re-renders.
  const variations = [0, 1, 2].map((i) => generateVariation(detail, seed * 3 + i, keepColors && Number.isFinite(baseHue) ? { hue: baseHue } : {}));

  const errText = (e, fallback) => (typeof e?.response?.data?.detail === "string" ? e.response.data.detail : fallback);

  function saveThemeXml(themeXml, message) {
    setSaving(true);
    setError("");
    return api.patch(`/runtime-applications/${applicationId}`, { xml: `<Application>\n${themeXml}\n</Application>` })
      .then(() => api.get(`/runtime-applications/${applicationId}`))
      .then((res) => {
        onDetailChange(res.data);
        setWorking(null); setLookXml(null); setPendingLogo(undefined);
        setNotice(message);
        setTimeout(() => setNotice(""), 3000);
      })
      .catch((e) => setError(errText(e, "Couldn't save the design — try again.")))
      .finally(() => setSaving(false));
  }

  const logoFor = () => (pendingLogo !== undefined ? pendingLogo : theme.logo);
  const applySpec = (spec) => saveThemeXml(designToThemeXml(spec, { name: themeName, logo: logoFor() }), "Design applied.");
  const resetToAutomatic = () => saveThemeXml(
    `<Theme name="${themeName.replace(/"/g, "&quot;")}">${theme.logo ? `<Logo src="${theme.logo.replace(/"/g, "&quot;")}" placement="top-left"/>` : ""}</Theme>`,
    "Back to the automatic design for this app's domain."
  );

  // The AI's Theme, forced onto this app's Theme name so the merge replaces (never duplicates) it.
  function normalizeThemeXml(xml) {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    doc.documentElement.setAttribute("name", themeName);
    if (theme.logo && !doc.documentElement.querySelector("Logo")) {
      const logo = doc.createElement("Logo");
      logo.setAttribute("src", theme.logo);
      logo.setAttribute("placement", "top-left");
      doc.documentElement.insertBefore(logo, doc.documentElement.firstChild);
    }
    return new XMLSerializer().serializeToString(doc.documentElement);
  }

  function describeLook() {
    if (!look.trim()) { setError("Describe the look you want first."); return; }
    setLookBusy(true);
    setError("");
    setLookXml(null);
    api.post(`/runtime-applications/${applicationId}/design`, { description: look })
      .then((res) => setLookXml(normalizeThemeXml(res.data.xml)))
      .catch((e) => setError(errText(e, "Couldn't design that look — try rephrasing it.")))
      .finally(() => setLookBusy(false));
  }

  // A design built around brand colors/fonts — a variation for structure, then the brand on top.
  function designFromBrand(colors, fonts) {
    const hue = hexToHsl(colors[0])?.h;
    const spec = generateVariation(detail, seed + 101, Number.isFinite(hue) ? { hue } : {});
    spec.label = "From your brand";
    if (colors[0]) spec.primary = colors[0];
    if (colors[1]) spec.accent = colors[1];
    if (fonts?.[0]) spec.bodyFont = fonts[0];
    if (fonts?.[1]) spec.headingFont = fonts[1];
    setWorking(spec);
  }

  function readBrandFromUrl() {
    if (!brandUrl.trim()) return;
    setBrandBusy(true);
    setError("");
    api.post("/runtime-applications/brand-from-url", { url: brandUrl })
      .then((res) => setBrand({ ...res.data, source: "site" }))
      .catch((e) => setError(errText(e, "Couldn't read that website.")))
      .finally(() => setBrandBusy(false));
  }

  function uploadLogo(file) {
    if (!file) return;
    setLogoBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    const read = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const size = 120;
        c.width = size; c.height = size;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, size, size);
        resolve(extractPalette(ctx.getImageData(0, 0, size, size)));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve([]);
      img.src = URL.createObjectURL(file);
    });
    Promise.all([api.post(`/runtime-applications/${applicationId}/uploads`, form), read])
      .then(([res, colors]) => {
        setPendingLogo(`${API_ORIGIN}${res.data.url}`);
        setBrand({ colors, fonts: [], title: file.name, source: "logo" });
      })
      .catch((e) => setError(errText(e, "Logo upload failed.")))
      .finally(() => setLogoBusy(false));
  }

  const setW = (patch) => setWorking((w) => ({ ...w, ...patch }));
  const setTok = (patch) => setWorking((w) => ({ ...w, tokens: { ...(w.tokens || {}), ...patch } }));
  const chooseStyle = (style) => {
    const sd = STYLE_DEFAULTS[style];
    setWorking((w) => ({
      ...w, style, nav: sd.nav, header: sd.header, cards: sd.cards, tables: sd.tables, canvas: sd.canvas, auth: sd.auth,
      radius: sd.radius, density: sd.density, appearance: sd.appearance,
      headingFont: style === "editorial" ? "Playfair Display" : w.headingFont,
      // Light tokens can't survive a switch to a dark-only language (and vice versa) — drop them.
      tokens: sd.appearance !== w.appearance ? {} : w.tokens,
    }));
  };

  const summaryChips = (d) => [cap(d.style), `${cap(d.shell)} layout`, d.appearance === "dark" ? "Dark" : "Light", d.bodyFont + (d.headingFont !== d.bodyFont ? ` + ${d.headingFont}` : "")];

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 className="section-title">Design</h1>
          <p className="section-sub">How {detail.name} looks to its users — its own layout, type, colors and style, not a shared template. Pick a variation, describe a look, bring your brand, or fine-tune every detail.</p>
        </div>
        <button className="studio-btn-secondary studio-btn-sm" onClick={resetToAutomatic} disabled={saving} title="Use the automatic design for this app's domain">
          <RotateCcw size={13} /> Reset to automatic
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--danger-soft)", border: "1px solid rgba(248,113,113,0.3)", color: "var(--danger)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
          <span style={{ flex: 1 }}>{error}</span><button className="studio-btn-ghost studio-btn-sm" onClick={() => setError("")}><XIcon size={13} /></button>
        </div>
      )}
      {notice && <div style={{ background: "var(--success-soft)", color: "var(--success)", borderRadius: 10, padding: "10px 14px", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}><Check size={15} /> {notice}</div>}

      {/* ----- Current design, or the fine-tune editor ----- */}
      {!working ? (
        <div className="studio-card" style={{ padding: 18, display: "flex", gap: 20, flexWrap: "wrap", boxShadow: "none" }}>
          <DesignPreview design={current} appName={detail.name} modules={modules} width={560} />
          <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current design</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{cap(current.style)}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{STYLE_INFO[current.style]}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{summaryChips(current).map((c) => <span key={c} className="studio-pill studio-pill-muted">{c}</span>)}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {[current.primary, current.accent, current.tokens?.accepted?.surface, current.tokens?.accepted?.canvas].filter(Boolean).map((c, i) => (
                <span key={i} title={c} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: "1px solid var(--border-strong)" }} />
              ))}
              <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>{current.source === "preset" ? "Automatic for this domain" : "Custom design"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
              <button className="studio-btn-primary" onClick={() => setWorking(specFromDesign(current))}><SlidersHorizontal size={14} /> Customize</button>
              <button className="studio-btn-secondary" onClick={() => setSeed((s) => s + 1)}><Shuffle size={14} /> New variations</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="studio-card" style={{ padding: 18, boxShadow: "none", borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <SlidersHorizontal size={16} style={{ color: "var(--accent)" }} />
            <div style={{ fontWeight: 700, flex: 1 }}>Fine-tune {working.label && working.label !== "Current design" ? <span style={{ color: "var(--muted)", fontWeight: 500 }}>· starting from {working.label}</span> : null}</div>
            <button className="studio-btn-secondary studio-btn-sm" onClick={() => { setWorking(null); setPendingLogo(undefined); }} disabled={saving}>Cancel</button>
            <button className="studio-btn-ai studio-btn-sm" onClick={() => applySpec(working)} disabled={saving}>{saving ? "Saving…" : <><Check size={14} /> Save design</>}</button>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ position: "sticky", top: 0 }}>
              <DesignPreview design={toDesign(working)} appName={detail.name} modules={modules} width={540} />
              {pendingLogo && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}><img src={pendingLogo} alt="" style={{ height: 22 }} /> New logo will be saved with this design</div>}
            </div>
            <div style={{ flex: 1, minWidth: 280, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Design language">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6 }}>
                    {STYLES.map((s) => (
                      <button key={s} type="button" onClick={() => chooseStyle(s)} title={STYLE_INFO[s]}
                        className={working.style === s ? "studio-btn-primary studio-btn-sm" : "studio-btn-secondary studio-btn-sm"}>{cap(s)}</button>
                    ))}
                  </div>
                </Field>
              </div>
              {Object.keys(OPTIONS).map((key) => (
                <Field key={key} label={FIELD_LABELS[key]}>
                  <select className="studio-select" value={working[key]} onChange={(e) => setW({ [key]: e.target.value })}>
                    {OPTIONS[key].map((o) => <option key={o} value={o}>{cap(o.replace("-", " "))}</option>)}
                  </select>
                </Field>
              ))}
              <Field label="Primary color"><input type="color" value={working.primary} onChange={(e) => setW({ primary: e.target.value })} style={{ width: "100%", height: 36, border: "none", background: "none", padding: 0 }} /></Field>
              <Field label="Accent color"><input type="color" value={working.accent} onChange={(e) => setW({ accent: e.target.value })} style={{ width: "100%", height: 36, border: "none", background: "none", padding: 0 }} /></Field>
              <Field label="Surface (cards)"><input type="color" value={working.tokens?.surface || (working.appearance === "dark" ? "#171a21" : "#f7f8fa")} onChange={(e) => setTok({ surface: e.target.value })} style={{ width: "100%", height: 36, border: "none", background: "none", padding: 0 }} /></Field>
              <Field label="Page background"><input type="color" value={working.tokens?.canvas || (working.appearance === "dark" ? "#101218" : "#eceef2")} onChange={(e) => setTok({ canvas: e.target.value })} style={{ width: "100%", height: 36, border: "none", background: "none", padding: 0 }} /></Field>
              <Field label="Body font">
                <select className="studio-select" value={working.bodyFont} onChange={(e) => setW({ bodyFont: e.target.value })}>{FONTS.filter((f) => !["Fraunces", "Playfair Display", "Lora"].includes(f)).map((f) => <option key={f}>{f}</option>)}</select>
              </Field>
              <Field label="Heading font">
                <select className="studio-select" value={working.headingFont} onChange={(e) => setW({ headingFont: e.target.value })}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
              </Field>
              <Field label={`Corner radius · ${working.radius}px`}><input type="range" min="0" max="20" value={working.radius} onChange={(e) => setW({ radius: Number(e.target.value) })} /></Field>
              <Field label="Shadow">
                <select className="studio-select" value={working.tokens?.shadow || ""} onChange={(e) => setTok({ shadow: e.target.value || undefined })}>
                  <option value="">Style default</option>{["none", "soft", "deep", "hard", "glow"].map((o) => <option key={o} value={o}>{cap(o)}</option>)}
                </select>
              </Field>
              <Field label="Border weight">
                <select className="studio-select" value={working.tokens?.borderWidth ?? ""} onChange={(e) => setTok({ borderWidth: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">Style default</option>{[0, 1, 2, 3].map((o) => <option key={o} value={o}>{o}px</option>)}
                </select>
              </Field>
              <Field label="Spacing">
                <select className="studio-select" value={working.tokens?.spacing || ""} onChange={(e) => setTok({ spacing: e.target.value || undefined })}>
                  <option value="">Style default</option>{["tight", "normal", "airy"].map((o) => <option key={o} value={o}>{cap(o)}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ----- Describe the look (AI) ----- */}
      <div className="studio-card" style={{ padding: 18, boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div className="ai-mark" style={{ width: 28, height: 28, borderRadius: 8 }}><Wand2 size={14} /></div>
          <div style={{ fontWeight: 700, flex: 1 }}>Describe the look</div>
        </div>
        <div className="composer">
          <textarea rows={2} value={look} onChange={(e) => setLook(e.target.value)} placeholder="e.g. Warm and luxurious like a boutique hotel — cream paper, deep green, elegant serif headlines"
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) describeLook(); }} />
          <div className="composer-bar">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {LOOK_EXAMPLES.map((ex) => <button key={ex} className="chip" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setLook(ex)}>{ex}</button>)}
            </div>
            <button className="studio-btn-ai studio-btn-sm" onClick={describeLook} disabled={lookBusy}>{lookBusy ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Designing…</> : <><Sparkles size={14} /> Design it</>}</button>
          </div>
        </div>
        {lookXml && (() => {
          const d = resolveDesign(detail, parseThemeForRun(lookXml));
          return (
            <div className="fade-in" style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 16, alignItems: "flex-start" }}>
              <DesignPreview design={d} appName={detail.name} modules={modules} width={460} />
              <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{cap(d.style)} design</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{summaryChips(d).map((c) => <span key={c} className="studio-pill studio-pill-muted">{c}</span>)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="studio-btn-ai studio-btn-sm" onClick={() => saveThemeXml(lookXml, "Design applied.")} disabled={saving}><Check size={14} /> Apply this look</button>
                  <button className="studio-btn-secondary studio-btn-sm" onClick={() => { setWorking({ ...specFromDesign(d), label: "your description" }); setLookXml(null); }}><SlidersHorizontal size={13} /> Fine-tune it</button>
                  <button className="studio-btn-ghost studio-btn-sm" onClick={() => setLookXml(null)}>Discard</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ----- Variations ----- */}
      <div className="studio-card" style={{ padding: 18, boxShadow: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <Palette size={16} style={{ color: "var(--accent)" }} />
          <div style={{ fontWeight: 700, flex: 1 }}>Variations <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>· blended design languages and color-theory palettes</span></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={keepColors} onChange={(e) => setKeepColors(e.target.checked)} /> Keep my colors
          </label>
          <button className="studio-btn-secondary studio-btn-sm" onClick={() => setSeed((s) => s + 1)}><Shuffle size={13} /> Shuffle</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {variations.map((v) => {
            const d = toDesign(v);
            return (
              <div key={`${seed}-${v.label}-${v.primary}`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <DesignPreview design={d} appName={detail.name} modules={modules} width={320} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.label}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{cap(v.scheme)} palette · {v.bodyFont}</div>
                  </div>
                  <button className="studio-btn-ghost studio-btn-sm" onClick={() => setWorking(v)} title="Fine-tune this one"><SlidersHorizontal size={13} /></button>
                  <button className="studio-btn-primary studio-btn-sm" onClick={() => applySpec(v)} disabled={saving}>Use</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ----- Bring your own brand ----- */}
      <div className="studio-card" style={{ padding: 18, boxShadow: "none" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Bring your own brand</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>Upload a logo to use its colors, or point at your website to match its colors and fonts.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <label className="studio-card" style={{ padding: 16, boxShadow: "none", display: "flex", alignItems: "center", gap: 12, cursor: logoBusy ? "default" : "pointer", borderStyle: "dashed" }}>
            <Upload size={18} style={{ color: "var(--accent)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{logoBusy ? "Uploading…" : "Upload a logo"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>PNG, JPG, GIF or WebP</div>
            </div>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden disabled={logoBusy} onChange={(e) => uploadLogo(e.target.files?.[0])} />
          </label>
          <div className="studio-card" style={{ padding: 12, boxShadow: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={18} style={{ color: "var(--accent)", marginLeft: 4 }} />
            <input className="studio-input" value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} placeholder="yourcompany.com" onKeyDown={(e) => { if (e.key === "Enter") readBrandFromUrl(); }} />
            <button className="studio-btn-secondary studio-btn-sm" onClick={readBrandFromUrl} disabled={brandBusy || !brandUrl.trim()}>{brandBusy ? "Reading…" : "Read"}</button>
          </div>
        </div>
        {brand && (
          <div className="fade-in" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{brand.source === "logo" ? "Logo colors" : `From ${brand.title || "the site"}`}:</span>
            {brand.colors.map((c) => <span key={c} title={c} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: "1px solid var(--border-strong)" }} />)}
            {brand.fonts.map((f) => <span key={f} className="studio-pill studio-pill-muted">{f}</span>)}
            {brand.colors.length === 0 && brand.fonts.length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>No distinct colors found.</span>}
            <button className="studio-btn-primary studio-btn-sm" style={{ marginLeft: "auto" }} onClick={() => designFromBrand(brand.colors, brand.fonts)} disabled={brand.colors.length === 0 && brand.fonts.length === 0}>
              <Sparkles size={13} /> Build a design from this
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
