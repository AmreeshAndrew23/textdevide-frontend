import { describe, expect, it } from "vitest";
import { generateVariation, designToThemeXml, specFromDesign, extractPalette, paletteFor, hexToHsl, hslToHex, SCHEMES } from "./designStudio";
import { validateTokens, contrast, luminance } from "./designTokens";
import { viewFields, availableViews, defaultView, monthGrid, groupByDay, dateKey } from "./entityViews";
import { resolveDesign, STYLES } from "./designProfile";
import { parseThemeForRun } from "./applicationXml";

const app = (name, entities) => ({ name, elements: entities.map((e) => ({ tag: "Entity", name: e, xml: `<Entity name="${e}"/>` })) });

describe("designTokens: AI/user tokens are validated before they reach CSS", () => {
  it("accepts readable, appearance-appropriate tokens", () => {
    const t = validateTokens({ surface: "#f6f4ef", canvas: "#ece7dd", text: "#1c1917", muted: "#6b6258", border: "#ddd5c8", shadow: "soft", borderWidth: "2", spacing: "airy", typeScale: "1.1", headingWeight: "640" }, "light");
    expect(t.vars["--rt-surface"]).toBe("#f6f4ef");
    expect(t.vars["--rt-text"]).toBe("#1c1917");
    expect(t.vars["--rt-tok-bw"]).toBe("2px");
    expect(t.vars["--rt-pad-x"]).toBe("18px");
    expect(t.vars["--rt-heading-weight"]).toBe("600");
    expect(t.typeScale).toBe(1.1);
    expect(t.classes).toEqual(expect.arrayContaining(["rt-tok-shadow", "rt-tok-bw", "rt-tok-hw"]));
  });

  it("drops unreadable text, wrong-appearance surfaces, junk and out-of-range values", () => {
    const t = validateTokens({ surface: "#1a1a1a", text: "#dddddd", muted: "#eeeeee", border: "nope", shadow: "explode", borderWidth: "9", typeScale: "3" }, "light");
    expect(t.vars["--rt-surface"]).toBeUndefined(); // dark surface in a light app
    expect(t.vars["--rt-text"]).toBeUndefined(); // #ddd on white isn't readable
    expect(t.vars["--rt-border"]).toBeUndefined();
    expect(t.vars["--rt-tok-shadow"]).toBeUndefined();
    expect(t.vars["--rt-tok-bw"]).toBe("3px"); // clamped, not rejected
    expect(t.typeScale).toBe(1.2);
  });
});

describe("designStudio: generated designs are unique, readable and savable", () => {
  const hotel = app("Restaurant Manager", ["DiningTable", "Guest", "Reservation", "MenuItem"]);

  it("produces different variations per seed, the same for the same seed", () => {
    const sig = (v) => `${v.style}|${v.shell}|${v.primary}|${v.bodyFont}|${v.radius}`;
    const vs = Array.from({ length: 9 }, (_, i) => generateVariation(hotel, i));
    expect(new Set(vs.map(sig)).size).toBeGreaterThanOrEqual(7);
    expect(sig(generateVariation(hotel, 4))).toBe(sig(vs[4]));
    for (const v of vs) expect(STYLES).toContain(v.style);
  });

  it("builds palettes with readable text and soft (never pure white) light surfaces", () => {
    for (const scheme of SCHEMES) {
      for (const hue of [0, 95, 210, 300]) {
        const light = paletteFor(hue, scheme, "light", () => 0.5);
        expect(light.surface).not.toBe("#ffffff");
        expect(luminance(light.surface)).toBeGreaterThan(0.85);
        expect(contrast(light.text, light.surface)).toBeGreaterThanOrEqual(4.5);
        const dark = paletteFor(hue, scheme, "dark", () => 0.5);
        expect(contrast(dark.text, dark.surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("round-trips a variation through the saved <Theme> XML with nothing lost", () => {
    const v = generateVariation(hotel, 2);
    const xml = designToThemeXml(v, { name: "default", logo: "https://cdn.example/logo.png" });
    const d = resolveDesign(hotel, parseThemeForRun(xml));
    expect(d).toMatchObject({ source: "theme", style: v.style, shell: v.shell, header: v.header, primary: v.primary, bodyFont: v.bodyFont, radius: Math.min(v.radius, 20) });
    expect(parseThemeForRun(xml).logo).toBe("https://cdn.example/logo.png");
    expect(d.tokens.accepted.surface).toBe(v.tokens.surface);
    // ...and back to an editable spec
    expect(specFromDesign(d)).toMatchObject({ style: v.style, primary: v.primary, tokens: { surface: v.tokens.surface } });
  });

  it("escapes values so a theme can't break out of its XML", () => {
    const xml = designToThemeXml({ ...generateVariation(hotel, 0), bodyFont: `Inter" onload="x` }, { name: `a"<b` });
    expect(xml).not.toContain(`"<b"`);
    expect(xml).toContain("&quot;");
  });

  it("converts colors both ways", () => {
    const { h, s, l } = hexToHsl("#2563eb");
    expect(hslToHex(h, s, l)).toBe("#2563eb");
  });

  it("extracts a logo's brand colors, ignoring white, black and grey", () => {
    const px = [];
    const push = (rgb, n) => { for (let i = 0; i < n; i++) px.push(...rgb, 255); };
    push([255, 255, 255], 400); push([10, 10, 10], 100); push([128, 128, 128], 100);
    push([15, 118, 110], 250); push([245, 158, 11], 120);
    const colors = extractPalette({ data: Uint8ClampedArray.from(px) });
    expect(colors.length).toBe(2);
    expect(hexToHsl(colors[0]).h).toBeGreaterThan(160); // the teal
    expect(hexToHsl(colors[1]).h).toBeLessThan(50); // the amber
  });
});

describe("entityViews: records get the view that fits their data", () => {
  const f = (name, type, extra = {}) => ({ name, type, key: false, required: false, values: [], ...extra });

  it("offers board/calendar/gallery/timeline only when the fields support them", () => {
    const vf = viewFields([f("id", "string", { key: true }), f("status", "enum", { values: ["Booked", "Done"] }), f("appointmentDate", "date"), f("dob", "date")]);
    expect(vf.status.name).toBe("status");
    expect(vf.date.name).toBe("appointmentDate"); // never the birth date
    expect(availableViews(vf)).toEqual(["table", "board", "calendar", "timeline"]);
    expect(availableViews(viewFields([f("name", "string")]))).toEqual(["table"]);
  });

  it("opens each entity in the view that suits it", () => {
    expect(defaultView(viewFields([f("photo", "image")]), "Property")).toBe("gallery");
    expect(defaultView(viewFields([f("date", "date")]), "Reservation")).toBe("calendar");
    expect(defaultView(viewFields([f("stage", "enum", { values: ["New", "Won", "Lost"] })]), "Lead")).toBe("board");
    expect(defaultView(viewFields([f("name", "string")]), "Department")).toBe("table");
  });

  it("builds complete Monday-first month grids and day groups", () => {
    const cells = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(cells).toHaveLength(42);
    expect(cells[0].key).toBe("2026-10-26");
    expect(cells.find((c) => c.inMonth).key).toBe("2026-11-01");
    const groups = groupByDay([{ d: "2026-11-02" }, { d: "2026-11-05" }, { d: "2026-11-02" }, { d: null }], "d");
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([["2026-11-05", 1], ["2026-11-02", 2]]);
    expect(dateKey("2026-03-09")).toBe("2026-03-09");
  });
});
