// Recolors a generated screen's preview HTML client-side, without any AI call. Every screen's
// CSS defines its palette as custom properties in one `:root { --clr-primary: #...; ... }`
// block and every other rule references them via var(--clr-x) — so rewriting just that block
// recolors the whole page.

export function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return { h: 220, s: 60, l: 50 };
  const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.min(100, Math.max(0, s)) / 100; l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Given a primary + secondary color, derives the same qualitative palette the AI generation
// prompt already describes (dark saturated header, very light tinted bg/surface, neutral
// text/muted/border consistent with the primary hue's temperature) — deterministically, so any
// colors the user picks produce a harmonious full theme instead of clashing accents. The header
// band (and --clr-secondary itself) come from the secondary hue, so the two pickers have
// visibly independent effects instead of secondary just being a shade of primary.
export function deriveTheme(primaryHex, secondaryHex) {
  const { h, s } = hexToHsl(primaryHex);
  const { h: sh, s: ss } = hexToHsl(secondaryHex || primaryHex);
  return {
    "--clr-primary": primaryHex.toUpperCase(),
    "--clr-primary-dark": hslToHex(h, Math.min(100, s + 8), 34),
    "--clr-primary-light": hslToHex(h, Math.max(20, s - 15), 92),
    "--clr-secondary": (secondaryHex || primaryHex).toUpperCase(),
    "--clr-secondary-dark": hslToHex(sh, Math.min(100, ss + 8), 30),
    "--clr-header-bg": hslToHex(sh, Math.min(100, ss + 10), 20),
    "--clr-bg": hslToHex(h, Math.min(35, s * 0.25), 97),
    "--clr-surface": hslToHex(h, Math.min(25, s * 0.15), 99.5),
    "--clr-border": hslToHex(h, Math.min(30, s * 0.2), 88),
    "--clr-text": hslToHex(h, Math.min(20, s * 0.1), 18),
    "--clr-muted": hslToHex(h, Math.min(15, s * 0.1), 46),
  };
}

function readColorVar(html, varName) {
  const rootMatch = /:root\s*\{([^}]*)\}/.exec(html || "");
  if (!rootMatch) return null;
  const m = new RegExp(`${varName}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(rootMatch[1]);
  return m ? m[1] : null;
}

// Reads the current --clr-primary out of an already-generated screen's :root block, if any.
export function readPrimaryColor(html) {
  return readColorVar(html, "--clr-primary");
}

// Reads --clr-secondary if this screen already has one (newer generations); older screens have
// no such variable, so --clr-header-bg is the closest existing stand-in for "the accent color
// that isn't primary" — applyThemeToHtml re-derives header-bg from secondary anyway, so picking
// up its current value here keeps the swatch's starting point visually accurate either way.
export function readSecondaryColor(html) {
  return readColorVar(html, "--clr-secondary") || readColorVar(html, "--clr-header-bg");
}

function hexToRgbTriplet(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

const escapeRe = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

// Rewrites the --clr-* declarations present in `theme` inside the html's :root block, leaving
// --clr-danger, --font-family, --radius-card, and everything outside :root untouched — EXCEPT
// that not every generated screen consistently uses var(--clr-x) everywhere the prompt asks for
// it (observed in practice: a hardcoded rgba() focus glow, an unstyled link relying on browser
// default blue instead of var(--clr-primary)). So before touching :root, this also sweeps the
// whole page for literal hex/rgba occurrences of each var's OLD value and swaps them to the new
// one — a safety net for colors the AI hardcoded instead of referencing the variable.
export function applyThemeToHtml(html, theme) {
  const rootMatch = /:root\s*\{([^}]*)\}/.exec(html || "");
  if (!rootMatch) return html;
  const block = rootMatch[1];

  let out = html;
  for (const [varName, newHex] of Object.entries(theme)) {
    const m = new RegExp(`${varName}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(block);
    const oldHex = m && m[1];
    if (!oldHex || oldHex.toLowerCase() === newHex.toLowerCase()) continue;
    out = out.replace(new RegExp(escapeRe(oldHex), "gi"), newHex);
    const [r, g, b] = hexToRgbTriplet(oldHex);
    const [nr, ng, nb] = hexToRgbTriplet(newHex);
    out = out.replace(
      new RegExp(`rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*(,\\s*[\\d.]+\\s*)?\\)`, "gi"),
      (_full, alpha) => `rgba(${nr}, ${ng}, ${nb}, ${alpha ? alpha.replace(",", "").trim() : "1"})`
    );
  }

  // Final pass: make sure the :root declarations themselves exactly match the new theme,
  // whether or not a literal match was found above (covers vars the AI never defined at all).
  const rootMatch2 = /:root\s*\{([^}]*)\}/.exec(out);
  let block2 = rootMatch2[1];
  for (const [varName, value] of Object.entries(theme)) {
    const re = new RegExp(`(${varName}\\s*:\\s*)[^;]+;`);
    block2 = re.test(block2) ? block2.replace(re, `$1${value};`) : block2 + `\n    ${varName}: ${value};`;
  }
  return out.slice(0, rootMatch2.index) + `:root {${block2}}` + out.slice(rootMatch2.index + rootMatch2[0].length);
}
