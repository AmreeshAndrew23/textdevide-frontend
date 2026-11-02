// Generating and editing a generated app's design — the engine behind the Studio's Design tab.
//   generateVariation  a complete, unique design: a primary design language BLENDED with a second
//                      one (radius, border weight, shadow, heading weight interpolated), a palette
//                      built from color theory around a base hue, fonts, layout and tokens.
//   designToThemeXml   any design spec → the <Theme> element that saves it.
//   specFromDesign     the app's current resolved design → an editable spec.
//   extractPalette     a logo's dominant brand colors (from canvas ImageData).
// Specs round-trip through designToThemeXml → parseThemeForRun → resolveDesign, so a preview is
// rendered from exactly the XML that would be saved.
import { STYLES, STYLE_DEFAULTS, DOMAIN_STYLES, DOMAIN_PRESETS, FONT_WHITELIST, SHELLS, detectDomain, hashString } from "./designProfile";
import { hexToRgb, rgbToHex } from "./designTokens";

const SERIFS = ["Fraunces", "Playfair Display", "Lora"];
const SANS = [...FONT_WHITELIST].filter((f) => !SERIFS.includes(f));
export const SCHEMES = ["complementary", "analogous", "triadic", "split", "monochrome"];

// Per-language "physical" traits a blend interpolates between.
const TRAITS = {
  corporate: { radius: 4, borderWidth: 1, shadow: "none", spacing: "tight", headingWeight: 700 },
  soft: { radius: 20, borderWidth: 0, shadow: "soft", spacing: "airy", headingWeight: 700 },
  playful: { radius: 18, borderWidth: 2, shadow: "deep", spacing: "normal", headingWeight: 800 },
  editorial: { radius: 0, borderWidth: 1, shadow: "none", spacing: "airy", headingWeight: 500 },
  glass: { radius: 18, borderWidth: 1, shadow: "glow", spacing: "normal", headingWeight: 700 },
  brutal: { radius: 4, borderWidth: 2, shadow: "hard", spacing: "normal", headingWeight: 800 },
  minimal: { radius: 8, borderWidth: 1, shadow: "none", spacing: "normal", headingWeight: 600 },
};

// Small seeded PRNG — the same (app, seed) always produces the same variation.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, list) => list[Math.floor(r() * list.length) % list.length];
const lerp = (a, b, t) => a + (b - a) * t;

export function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = s / 100;
  const ll = l / 100;
  const k = (n) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function accentHue(h, scheme, r) {
  if (scheme === "complementary") return h + 180;
  if (scheme === "analogous") return h + (r() < 0.5 ? 32 : -32);
  if (scheme === "triadic") return h + (r() < 0.5 ? 120 : 240);
  if (scheme === "split") return h + (r() < 0.5 ? 150 : 210);
  return h;
}

// The full color set for a hue + scheme + appearance — never pure white or black.
export function paletteFor(hue, scheme, appearance, r = Math.random) {
  const dark = appearance === "dark";
  const sat = 58 + r() * 22;
  const ah = accentHue(hue, scheme, r);
  return {
    primary: hslToHex(hue, sat, dark ? 60 : 44 + r() * 6),
    accent: scheme === "monochrome" ? hslToHex(hue, sat * 0.7, dark ? 72 : 62) : hslToHex(ah, sat, dark ? 62 : 50),
    surface: dark ? hslToHex(hue, 22, 11) : hslToHex(hue, 22 + r() * 14, 97.6),
    canvas: dark ? hslToHex(hue, 26, 7) : hslToHex(hue, 18 + r() * 14, 93.5 + r() * 1.5),
    text: dark ? hslToHex(hue, 18, 92) : hslToHex(hue, 32, 12),
    muted: dark ? hslToHex(hue, 12, 66) : hslToHex(hue, 12, 40),
    border: dark ? hslToHex(hue, 16, 21) : hslToHex(hue, 20, 85),
  };
}

const STYLE_TITLES = { corporate: "Corporate", soft: "Soft", playful: "Playful", editorial: "Editorial", glass: "Glass", brutal: "Brutal", minimal: "Minimal" };

/**
 * A complete, unique design for an app. seed varies it; opts.style pins the primary language,
 * opts.hue pins the base hue (e.g. from a brand color).
 */
export function generateVariation(detail, seed = 0, opts = {}) {
  const r = rng(hashString(detail?.name || "app") + seed * 7919 + 13);
  const domain = detectDomain(detail);
  const style = opts.style && STYLES.includes(opts.style)
    ? opts.style
    : r() < 0.6 ? pickR(r, DOMAIN_STYLES[domain] || STYLES) : pickR(r, STYLES);
  const second = pickR(r, STYLES.filter((s) => s !== style));
  const w = 0.15 + r() * 0.3; // how much of the second language blends in
  const ta = TRAITS[style];
  const tb = TRAITS[second];
  const sd = STYLE_DEFAULTS[style];
  const appearance = style === "glass" ? "dark" : "light";
  const scheme = pickR(r, SCHEMES);
  const hue = Number.isFinite(opts.hue) ? opts.hue : Math.floor(r() * 360);
  const pal = paletteFor(hue, scheme, appearance, r);
  const presetFonts = (DOMAIN_PRESETS[domain] || DOMAIN_PRESETS.general).fonts;
  const bodyFont = style === "brutal" ? pickR(r, ["Space Grotesk", "Archivo"]) : r() < 0.6 ? pickR(r, presetFonts)[0] : pickR(r, SANS);
  const headingFont = style === "editorial" ? pickR(r, SERIFS) : r() < 0.2 ? pickR(r, SERIFS) : r() < 0.5 ? pickR(r, SANS) : bodyFont;
  return {
    label: `${STYLE_TITLES[style]} × ${STYLE_TITLES[second]}`,
    scheme,
    style,
    shell: pickR(r, SHELLS),
    nav: r() < 0.7 ? sd.nav : pickR(r, ["light", "tinted", "solid", "dark"]),
    appearance,
    header: r() < 0.6 ? sd.header : pickR(r, ["banner", "pattern", "split", "minimal"]),
    cards: sd.cards,
    tables: r() < 0.7 ? sd.tables : pickR(r, ["lines", "striped", "cards"]),
    canvas: sd.canvas,
    auth: r() < 0.6 ? sd.auth : pickR(r, ["split", "split-right", "centered"]),
    primary: pal.primary,
    accent: pal.accent,
    bodyFont,
    headingFont,
    radius: Math.round(lerp(ta.radius, tb.radius, w)),
    density: sd.density,
    fontSize: 14,
    tokens: {
      surface: pal.surface, canvas: pal.canvas, text: pal.text, muted: pal.muted, border: pal.border,
      shadow: w > 0.35 ? tb.shadow : ta.shadow,
      borderWidth: Math.round(lerp(ta.borderWidth, tb.borderWidth, w)),
      spacing: ta.spacing,
      headingWeight: Math.round(lerp(ta.headingWeight, tb.headingWeight, w) / 100) * 100,
      typeScale: Math.round((0.95 + r() * 0.12) * 100) / 100,
    },
  };
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function designToThemeXml(spec, { name = "default", logo = null } = {}) {
  const tokenAttrs = Object.entries(spec.tokens || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}="${esc(v)}"`).join(" ");
  return [
    `<Theme name="${esc(name)}">`,
    logo ? `  <Logo src="${esc(logo)}" placement="top-left"/>` : null,
    `  <Colors primary="${esc(spec.primary)}" accent="${esc(spec.accent)}" background="${esc(spec.tokens?.surface || "#ffffff")}"/>`,
    `  <Font family="${esc(spec.bodyFont)}"${spec.headingFont && spec.headingFont !== spec.bodyFont ? ` headingFamily="${esc(spec.headingFont)}"` : ""} size="${esc(spec.fontSize || 14)}"/>`,
    `  <Style cornerRadius="${esc(spec.radius)}" density="${esc(spec.density)}"/>`,
    `  <Layout style="${esc(spec.style)}" shell="${esc(spec.shell)}" nav="${esc(spec.nav)}" appearance="${esc(spec.appearance)}" header="${esc(spec.header)}" cards="${esc(spec.cards)}" tables="${esc(spec.tables)}" canvas="${esc(spec.canvas)}" auth="${esc(spec.auth)}"/>`,
    tokenAttrs ? `  <Tokens ${tokenAttrs}/>` : null,
    `</Theme>`,
  ].filter(Boolean).join("\n");
}

// The current resolved design as an editable spec (the Design tab's fine-tune starting point).
export function specFromDesign(design) {
  const { style, shell, nav, appearance, header, cards, tables, canvas, auth, primary, accent, bodyFont, headingFont, radius, density, fontSize } = design;
  return {
    label: "Current design", style, shell, nav, appearance, header, cards, tables, canvas, auth,
    primary, accent, bodyFont, headingFont, radius, density, fontSize,
    tokens: { ...(design.tokens?.accepted || {}) },
  };
}

// A logo's brand colors: buckets every opaque pixel at 4 bits per channel, ignores near-white,
// near-black and grey (backgrounds/outlines), and ranks buckets by count × saturation.
export function extractPalette(imageData, max = 5) {
  const { data } = imageData;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi > 240 && lo > 225) continue;
    if (hi < 28) continue;
    if (hi - lo < 22) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1; cur.r += r; cur.g += g; cur.b += b;
    buckets.set(key, cur);
  }
  const ranked = [...buckets.values()]
    .map((c) => {
      const rgb = [c.r / c.n, c.g / c.n, c.b / c.n];
      const sat = (Math.max(...rgb) - Math.min(...rgb)) / 255;
      return { hex: rgbToHex(rgb), score: c.n * (0.4 + sat) };
    })
    .sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of ranked) {
    const hsl = hexToHsl(c.hex);
    if (out.every((o) => Math.abs(((hexToHsl(o).h - hsl.h + 540) % 360) - 180) > 18 || Math.abs(hexToHsl(o).l - hsl.l) > 18)) out.push(c.hex);
    if (out.length >= max) break;
  }
  return out;
}
