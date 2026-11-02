// Fine-grained design tokens from a Theme's <Tokens .../> element — the AI (or the Studio's Design
// tab) can set an app's exact surface/canvas/text colors, shadow type, border weight, spacing and
// type scale. Everything is validated here before it reaches CSS: colors must parse, text must
// stay readable (WCAG contrast), light surfaces must be light and dark ones dark, numbers are
// clamped. A token that fails is simply dropped — the design language's own value stays.

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la == null || lb == null) return 0;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const SHADOW_TOKENS = {
  none: "none",
  soft: "0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px -14px rgba(15, 23, 42, 0.22)",
  deep: "0 2px 4px rgba(15, 23, 42, 0.06), 0 24px 48px -20px rgba(15, 23, 42, 0.38)",
  hard: "4px 4px 0 var(--rt-text)",
  glow: "0 0 0 1px color-mix(in srgb, var(--rt-primary) 30%, transparent), 0 14px 40px -16px var(--rt-primary)",
};
export const SPACING_TOKENS = { tight: [6, 10, 12], normal: [10, 14, 18], airy: [13, 18, 24] };

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
};

/**
 * raw: the <Tokens> attributes ({surface, canvas, text, muted, border, shadow, borderWidth,
 * spacing, typeScale, headingWeight}); appearance: "light" | "dark".
 * Returns { vars, classes, typeScale, accepted } — CSS variables + root classes to apply.
 */
export function validateTokens(raw, appearance = "light") {
  const out = { vars: {}, classes: [], typeScale: 1, accepted: {} };
  if (!raw) return out;
  const dark = appearance === "dark";
  const isSurface = (hex) => {
    const l = luminance(hex);
    return l != null && (dark ? l <= 0.06 : l >= 0.72);
  };
  const surface = isSurface(raw.surface) ? raw.surface : null;
  const canvas = isSurface(raw.canvas) ? raw.canvas : null;
  const against = surface || (dark ? "#171a21" : "#ffffff");
  if (surface) { out.vars["--rt-bg"] = surface; out.vars["--rt-surface"] = surface; out.accepted.surface = surface; }
  if (canvas) { out.vars["--rt-canvas"] = canvas; out.accepted.canvas = canvas; }
  if (hexToRgb(raw.text) && contrast(raw.text, against) >= 4.5) { out.vars["--rt-text"] = raw.text; out.accepted.text = raw.text; }
  if (hexToRgb(raw.muted) && contrast(raw.muted, against) >= 3) {
    out.vars["--rt-muted"] = raw.muted;
    out.vars["--rt-text-2"] = raw.muted;
    out.accepted.muted = raw.muted;
  }
  if (hexToRgb(raw.border)) {
    out.vars["--rt-border"] = raw.border;
    out.vars["--rt-border-strong"] = `color-mix(in srgb, ${raw.border} 75%, ${dark ? "#fff" : "#000"})`;
    out.accepted.border = raw.border;
  }
  if (SHADOW_TOKENS[raw.shadow]) {
    out.vars["--rt-tok-shadow"] = SHADOW_TOKENS[raw.shadow];
    out.classes.push("rt-tok-shadow");
    out.accepted.shadow = raw.shadow;
  }
  const bw = num(raw.borderWidth, 0, 3);
  if (bw != null) { out.vars["--rt-tok-bw"] = `${bw}px`; out.classes.push("rt-tok-bw"); out.accepted.borderWidth = bw; }
  if (SPACING_TOKENS[raw.spacing]) {
    const [y, x, gap] = SPACING_TOKENS[raw.spacing];
    out.vars["--rt-pad-y"] = `${y}px`;
    out.vars["--rt-pad-x"] = `${x}px`;
    out.vars["--rt-gap"] = `${gap}px`;
    out.accepted.spacing = raw.spacing;
  }
  const scale = num(raw.typeScale, 0.9, 1.2);
  if (scale != null) { out.typeScale = scale; out.accepted.typeScale = scale; }
  const hw = num(raw.headingWeight, 500, 800);
  if (hw != null) {
    out.vars["--rt-heading-weight"] = String(Math.round(hw / 100) * 100);
    out.classes.push("rt-tok-hw");
    out.accepted.headingWeight = Math.round(hw / 100) * 100;
  }
  return out;
}
