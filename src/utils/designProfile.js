// Decides how one generated app LOOKS — its whole visual system, not just its colors. Without
// this, every app was the same skeleton (left sidebar, gradient banner, Inter, bordered cards)
// recolored navy. A profile picks, per app:
//   shell      sidebar | topnav | rail          — the navigation layout
//   nav        light | tinted | solid | dark    — how the navigation surface is painted
//   appearance light | dark
//   header     banner | pattern | split | minimal — the dashboard's opening section
//   cards      bordered | elevated | soft
//   tables     lines | striped | cards
//   canvas     cool | warm | tinted             — the page background's tone
//   auth       split | split-right | centered   — the sign-in layout
//   style      corporate | soft | playful | editorial | glass | brutal | minimal
//              — the design LANGUAGE: the strongest axis. Each restyles typography, cards, KPI
//              tiles, inputs, buttons, tables, the hero and the whole sign-in composition
//              together (runtimeApp.css .rt-style-*), so two apps never read as one template.
//   radius, density, body/heading fonts, primary/accent colors
//
// Where it comes from, in order:
//   1. The app's own <Theme><Layout .../></Theme> (newer generations — the AI chooses it).
//   2. Otherwise a preset for the app's detected DOMAIN (healthcare, finance, education…), with
//      one of several variants/palettes/font pairs picked from a hash of the app's name — so
//      apps in the same domain still differ, and an app always looks the same on every visit.

import { validateTokens } from "./designTokens";

export const SHELLS = ["sidebar", "topnav", "rail"];
export const STYLES = ["corporate", "soft", "playful", "editorial", "glass", "brutal", "minimal"];
const ENUMS = {
  style: STYLES,
  shell: SHELLS,
  nav: ["light", "tinted", "solid", "dark"],
  appearance: ["light", "dark"],
  header: ["banner", "pattern", "split", "minimal"],
  cards: ["bordered", "elevated", "soft"],
  tables: ["lines", "striped", "cards"],
  canvas: ["cool", "warm", "tinted"],
  auth: ["split", "split-right", "centered"],
};

// Only these are loaded from Google Fonts (anything else falls back to Inter) — a fixed list keeps
// the font request predictable and every choice a known-good UI face.
export const FONT_WHITELIST = new Set([
  "Inter", "Plus Jakarta Sans", "DM Sans", "Manrope", "Poppins", "Nunito", "Nunito Sans", "IBM Plex Sans",
  "Space Grotesk", "Outfit", "Lexend", "Work Sans", "Rubik", "Sora", "Figtree", "Archivo", "Source Sans 3",
  "Barlow", "Fraunces", "Playfair Display", "Lora",
]);

const DOMAIN_KEYWORDS = {
  fintech: /upi|wallet|sav(e|er|ing)|expense|budget|spend|goal|pocket|personal finance|money/i,
  healthcare: /patient|doctor|physician|nurse|appointment|clinic|hospital|medical|prescription|diagnos|ward|pharmac|lab ?test|health/i,
  finance: /invoice|payment|loan|transaction|budget|expense|ledger|bank|account(?!ing)|insurance|claim|policy|premium|tax|payroll|fund|portfolio/i,
  education: /student|course|class|teacher|instructor|exam|grade|enrol|school|lesson|semester|curriculum|assignment|tutor/i,
  hr: /employee|leave|attendance|recruit|candidate|applicant|interview|onboard|appraisal|timesheet|designation|staff/i,
  commerce: /product|order|cart|customer|inventory|stock|supplier|vendor|sku|catalog|store|shop|coupon|purchase/i,
  logistics: /shipment|vehicle|driver|delivery|route|warehouse|fleet|trip|cargo|freight|dispatch|carrier/i,
  media: /song|track|album|artist|playlist|music|stream|video|podcast|episode|movie|film|gallery|photo|creator/i,
  crm: /lead|deal|opportunit|contact|pipeline|campaign|crm|prospect|account manager/i,
  property: /property|tenant|lease|rent|landlord|building|apartment|real ?estate|listing/i,
  hospitality: /booking|reservation|room|guest|hotel|event|ticket|venue|restaurant|menu|table|travel|tour/i,
  projects: /project|task|sprint|milestone|issue|bug|backlog|kanban|epic|todo/i,
};

const V = (shell, nav, header, cards, tables, canvas, auth, radius, density = "comfortable", appearance = "light") =>
  ({ shell, nav, header, cards, tables, canvas, auth, radius, density, appearance });

export const DOMAIN_PRESETS = {
  fintech: {
    palettes: [["#7c3aed", "#22d3ee"], ["#0ea5e9", "#a855f7"], ["#10b981", "#6366f1"]],
    fonts: [["Sora", null], ["Outfit", null], ["Plus Jakarta Sans", null]],
    variants: [
      V("rail", "dark", "banner", "elevated", "cards", "cool", "centered", 16, "comfortable", "dark"),
      V("topnav", "dark", "split", "elevated", "lines", "tinted", "centered", 18, "comfortable", "dark"),
      V("sidebar", "dark", "banner", "soft", "cards", "cool", "centered", 14, "comfortable", "dark"),
    ],
  },
  healthcare: {
    palettes: [["#0f766e", "#0ea5e9"], ["#0369a1", "#14b8a6"], ["#059669", "#6366f1"]],
    fonts: [["Plus Jakarta Sans", null], ["Nunito Sans", null], ["Figtree", null]],
    variants: [
      V("topnav", "light", "split", "elevated", "lines", "tinted", "split", 14),
      V("sidebar", "light", "split", "soft", "cards", "cool", "centered", 12),
      V("rail", "tinted", "banner", "elevated", "lines", "tinted", "split-right", 16),
    ],
  },
  finance: {
    palettes: [["#065f46", "#d97706"], ["#1e3a8a", "#059669"], ["#7f1d1d", "#b45309"]],
    fonts: [["IBM Plex Sans", null], ["Source Sans 3", "IBM Plex Sans"], ["Inter", "Fraunces"]],
    variants: [
      V("sidebar", "dark", "minimal", "bordered", "striped", "cool", "split", 6, "compact"),
      V("topnav", "solid", "minimal", "bordered", "lines", "warm", "centered", 4, "compact"),
      V("sidebar", "solid", "split", "bordered", "striped", "cool", "split-right", 8, "compact"),
    ],
  },
  education: {
    palettes: [["#4f46e5", "#f59e0b"], ["#7c3aed", "#f97316"], ["#2563eb", "#eab308"]],
    fonts: [["Nunito", null], ["Lexend", null], ["Poppins", "Fraunces"]],
    variants: [
      V("rail", "tinted", "pattern", "elevated", "cards", "tinted", "split", 16),
      V("topnav", "light", "pattern", "soft", "lines", "warm", "centered", 18),
      V("sidebar", "tinted", "split", "elevated", "striped", "tinted", "split-right", 14),
    ],
  },
  hr: {
    palettes: [["#7c3aed", "#ec4899"], ["#9333ea", "#f59e0b"], ["#4338ca", "#14b8a6"]],
    fonts: [["Manrope", null], ["DM Sans", null], ["Sora", null]],
    variants: [
      V("sidebar", "tinted", "split", "soft", "lines", "tinted", "split", 12),
      V("topnav", "light", "banner", "elevated", "cards", "cool", "centered", 14),
      V("rail", "dark", "minimal", "bordered", "lines", "cool", "split-right", 10),
    ],
  },
  commerce: {
    palettes: [["#ea580c", "#e11d48"], ["#db2777", "#f59e0b"], ["#16a34a", "#f97316"]],
    fonts: [["Poppins", null], ["Outfit", null], ["Rubik", null]],
    variants: [
      V("topnav", "light", "banner", "elevated", "cards", "warm", "split", 18),
      V("sidebar", "solid", "pattern", "soft", "lines", "warm", "centered", 14),
      V("rail", "light", "split", "elevated", "striped", "tinted", "split-right", 16),
    ],
  },
  logistics: {
    palettes: [["#b45309", "#0ea5e9"], ["#0e7490", "#f59e0b"], ["#334155", "#f97316"]],
    fonts: [["Archivo", null], ["Barlow", null], ["Work Sans", null]],
    variants: [
      V("sidebar", "dark", "minimal", "bordered", "striped", "cool", "split", 4, "compact"),
      V("topnav", "solid", "split", "bordered", "lines", "warm", "split-right", 6, "compact"),
      V("sidebar", "dark", "banner", "soft", "striped", "cool", "centered", 8),
    ],
  },
  media: {
    palettes: [["#db2777", "#8b5cf6"], ["#8b5cf6", "#06b6d4"], ["#e11d48", "#f59e0b"]],
    fonts: [["Space Grotesk", null], ["Outfit", null], ["Sora", null]],
    variants: [
      V("rail", "dark", "banner", "elevated", "cards", "cool", "split", 16, "comfortable", "dark"),
      V("sidebar", "dark", "pattern", "soft", "lines", "cool", "centered", 14, "comfortable", "dark"),
      V("topnav", "dark", "split", "elevated", "cards", "tinted", "split-right", 18, "comfortable", "dark"),
    ],
  },
  crm: {
    palettes: [["#2563eb", "#06b6d4"], ["#0891b2", "#6366f1"], ["#4f46e5", "#22c55e"]],
    fonts: [["DM Sans", null], ["Figtree", null], ["Inter", null]],
    variants: [
      V("sidebar", "solid", "split", "bordered", "lines", "cool", "split", 10),
      V("topnav", "light", "minimal", "elevated", "striped", "tinted", "centered", 12),
      V("rail", "tinted", "banner", "soft", "cards", "cool", "split-right", 14),
    ],
  },
  property: {
    palettes: [["#15803d", "#d97706"], ["#0f766e", "#ea580c"], ["#1d4ed8", "#16a34a"]],
    fonts: [["Lexend", null], ["Manrope", null], ["Work Sans", "Playfair Display"]],
    variants: [
      V("topnav", "light", "banner", "elevated", "cards", "warm", "split", 14),
      V("sidebar", "light", "split", "soft", "lines", "warm", "centered", 12),
      V("rail", "solid", "pattern", "elevated", "striped", "tinted", "split-right", 16),
    ],
  },
  hospitality: {
    palettes: [["#e11d48", "#f59e0b"], ["#c2410c", "#0d9488"], ["#9333ea", "#f43f5e"]],
    fonts: [["Outfit", null], ["Plus Jakarta Sans", "Playfair Display"], ["Poppins", null]],
    variants: [
      V("topnav", "light", "pattern", "elevated", "cards", "warm", "split", 18),
      V("sidebar", "tinted", "banner", "soft", "lines", "warm", "centered", 14),
      V("rail", "light", "split", "elevated", "striped", "warm", "split-right", 16),
    ],
  },
  projects: {
    palettes: [["#4f46e5", "#06b6d4"], ["#0f172a", "#8b5cf6"], ["#2563eb", "#f43f5e"]],
    fonts: [["Inter", null], ["Figtree", null], ["Space Grotesk", null]],
    variants: [
      V("rail", "light", "minimal", "bordered", "lines", "cool", "centered", 8),
      V("sidebar", "dark", "split", "bordered", "striped", "cool", "split", 8),
      V("topnav", "light", "minimal", "soft", "cards", "tinted", "split-right", 12),
    ],
  },
  general: {
    palettes: [["#4f46e5", "#0ea5e9"], ["#0d9488", "#f59e0b"], ["#be185d", "#6366f1"], ["#2563eb", "#10b981"]],
    fonts: [["Inter", null], ["DM Sans", null], ["Manrope", null], ["Plus Jakarta Sans", null]],
    variants: [
      V("sidebar", "light", "banner", "bordered", "lines", "cool", "split", 10),
      V("topnav", "light", "split", "elevated", "cards", "tinted", "centered", 14),
      V("rail", "tinted", "pattern", "soft", "striped", "warm", "split-right", 12),
      V("sidebar", "dark", "minimal", "elevated", "lines", "cool", "split", 8),
    ],
  },
};

export function hashString(text) {
  let h = 2166136261;
  for (const ch of String(text || "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// The domain whose vocabulary best matches the app's own name and entity names (the app's name
// counts double — "Insurance Claims" says more than one entity called "Customer").
export function detectDomain(detail) {
  const entityNames = (detail?.elements || []).filter((e) => e.tag === "Entity").map((e) => e.name);
  const sources = [[detail?.name || "", 2], ...entityNames.map((n) => [n, 1])];
  let best = "general";
  let bestScore = 0;
  for (const [domain, re] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const [text, weight] of sources) {
      const words = String(text).replace(/([a-z])([A-Z])/g, "$1 $2");
      if (re.test(words)) score += weight;
    }
    if (score > bestScore) { best = domain; bestScore = score; }
  }
  return best;
}

// Which design languages fit each domain — distinct sets, so neighbouring domains (hotel vs
// property, coaching vs personal finance) can't land on the same look.
export const DOMAIN_STYLES = {
  healthcare: ["soft", "minimal"],
  fintech: ["glass"],
  finance: ["corporate", "minimal"],
  education: ["playful", "soft"],
  hr: ["soft", "corporate"],
  commerce: ["playful", "brutal"],
  logistics: ["corporate", "brutal"],
  media: ["glass"],
  crm: ["brutal", "minimal"],
  property: ["minimal", "corporate"],
  hospitality: ["editorial"],
  projects: ["brutal", "minimal"],
  general: ["soft", "playful", "minimal", "corporate", "brutal"],
};

// What each design language needs from the other axes to read as itself — e.g. glass is only
// glass on a dark canvas, editorial needs a serif headline and warm paper, corporate is sharp.
export const STYLE_DEFAULTS = {
  corporate: { nav: "dark", header: "minimal", cards: "bordered", tables: "striped", canvas: "cool", auth: "split", radius: 4, density: "compact", appearance: "light" },
  soft: { nav: "tinted", header: "split", cards: "elevated", tables: "cards", canvas: "tinted", auth: "centered", radius: 18, density: "comfortable", appearance: "light" },
  playful: { nav: "solid", header: "pattern", cards: "elevated", tables: "cards", canvas: "warm", auth: "split", radius: 18, density: "comfortable", appearance: "light" },
  editorial: { nav: "light", header: "banner", cards: "bordered", tables: "lines", canvas: "warm", auth: "split-right", radius: 2, density: "comfortable", appearance: "light", headingFont: "Playfair Display" },
  glass: { nav: "dark", header: "banner", cards: "elevated", tables: "cards", canvas: "cool", auth: "centered", radius: 16, density: "comfortable", appearance: "dark" },
  brutal: { nav: "light", header: "banner", cards: "bordered", tables: "lines", canvas: "warm", auth: "centered", radius: 6, density: "comfortable", appearance: "light" },
  minimal: { nav: "light", header: "minimal", cards: "bordered", tables: "lines", canvas: "cool", auth: "centered", radius: 8, density: "comfortable", appearance: "light" },
};

function pick(list, n) {
  return list[n % list.length];
}

function valid(key, value, fallback) {
  return ENUMS[key].includes(value) ? value : fallback;
}

function fontOrNull(name) {
  return name && FONT_WHITELIST.has(name.trim()) ? name.trim() : null;
}

/**
 * detail: the Application; theme: parseThemeForRun output.
 * Returns the full visual system for the Run panel.
 */
export function resolveDesign(detail, theme) {
  const domain = detectDomain(detail);
  const preset = DOMAIN_PRESETS[domain];
  const h = hashString(detail?.name || "app");
  const base = pick(preset.variants, h);
  const [presetPrimary, presetAccent] = pick(preset.palettes, h >>> 4);
  const [presetBody, presetHeading] = pick(preset.fonts, h >>> 8);
  const layout = theme?.layout || null;

  // The design language: the AI's explicit <Layout style> if it chose one, else one that fits the
  // domain (picked by name hash where a domain has several).
  const style = valid("style", layout?.style, pick(DOMAIN_STYLES[domain], h >>> 12));
  const sd = STYLE_DEFAULTS[style];

  // Precedence for the layout axes:
  //  - <Layout style="..."> present → the AI composed the whole look deliberately; its values win.
  //  - <Layout> without a style (apps generated before styles existed) → the style's defaults win,
  //    because those generations converged on near-identical choices; only the shell is kept.
  //  - No <Layout> at all (older apps) → style defaults over the domain preset variant.
  const fromTheme = !!layout;
  const aiComposed = !!(layout && ENUMS.style.includes(layout.style));
  const axis = (key) => (aiComposed ? valid(key, layout[key], sd[key] ?? base[key]) : (sd[key] ?? valid(key, layout?.[key], base[key])));
  const resolved = {
    domain,
    style,
    source: fromTheme ? "theme" : "preset",
    shell: valid("shell", layout?.shell, base.shell),
    nav: axis("nav"),
    appearance: axis("appearance"),
    header: axis("header"),
    cards: axis("cards"),
    tables: axis("tables"),
    canvas: axis("canvas"),
    auth: axis("auth"),
    primary: fromTheme && theme.hasColors ? theme.primary : presetPrimary,
    accent: fromTheme && theme.hasColors ? theme.accent : presetAccent,
    bodyFont: (fromTheme && fontOrNull(theme.fontName)) || presetBody,
    headingFont: (fromTheme ? fontOrNull(theme.headingFontName) : presetHeading) || sd.headingFont || null,
    radius: aiComposed ? Math.max(0, Math.min(Number(theme.cornerRadius) || sd.radius, 20)) : sd.radius,
    density: aiComposed ? (theme.density === "compact" ? "compact" : "comfortable") : sd.density,
    fontSize: Number(theme?.fontSize) || 14,
  };
  // A few languages only work with their own type: editorial needs a serif headline, brutal a
  // grotesk, and glass is a dark-only look whatever else was asked.
  if (style === "editorial" && !["Fraunces", "Playfair Display", "Lora"].includes(resolved.headingFont)) resolved.headingFont = "Playfair Display";
  if (style === "brutal" && !aiComposed) resolved.bodyFont = "Space Grotesk";
  if (style === "glass") resolved.appearance = "dark";
  resolved.headingFont = resolved.headingFont || resolved.bodyFont;
  resolved.surfaceBg = fromTheme ? surfaceColorFor(theme.background) : "#ffffff";
  resolved.tokens = validateTokens(theme?.tokens, resolved.appearance);
  return resolved;
}

// A generated app's surfaces must be light unless the design is dark (the light text colors
// assume so) — a Theme background that is actually dark still gets a readable white surface.
export function surfaceColorFor(background) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(background || "").trim());
  if (!m) return "#ffffff";
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 200 ? `#${hex}` : "#ffffff";
}

// One resolved design → the className + CSS variables for an .rt-app root. Shared by the Run
// panel and every Design-tab preview, so a preview is exactly what the app will look like.
export function designToCss(design) {
  const t = design.tokens || { vars: {}, classes: [], typeScale: 1 };
  const className = [
    "rt-app",
    design.density === "compact" && "rt-compact",
    design.appearance === "dark" && "rt-dark",
    `rt-style-${design.style}`, `rt-nav-${design.nav}`, `rt-cards-${design.cards}`, `rt-tables-${design.tables}`, `rt-canvas-${design.canvas}`,
    design.radius >= 14 ? "rt-shape-round" : design.radius <= 6 ? "rt-shape-sharp" : null,
    ...t.classes,
  ].filter(Boolean).join(" ");
  const style = {
    "--rt-primary": design.primary,
    "--rt-accent": design.accent,
    "--rt-bg": design.appearance === "dark" ? "#171a21" : design.surfaceBg || "#ffffff",
    "--rt-radius": `${Math.max(0, Math.min(design.radius, 14))}px`,
    "--rt-font": `"${design.bodyFont}", Inter, system-ui, sans-serif`,
    "--rt-font-heading": `"${design.headingFont}", "${design.bodyFont}", Inter, system-ui, sans-serif`,
    "--rt-font-size": `${Math.round(design.fontSize * (t.typeScale || 1) * 10) / 10}px`,
    ...t.vars,
  };
  return { className, style };
}

// The Google Fonts stylesheet URL for a profile's fonts. Weights stop at 700 because every
// whitelisted family has 400–700, and Google rejects the WHOLE request if any weight is missing.
export function fontHref(families) {
  const unique = [...new Set(families.filter((f) => f && FONT_WHITELIST.has(f)))];
  if (unique.length === 0) return null;
  const params = unique.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`).join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
