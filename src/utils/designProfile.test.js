import { describe, expect, it } from "vitest";
import { detectDomain, resolveDesign, fontHref, DOMAIN_PRESETS } from "./designProfile";
import { parseThemeForRun } from "./applicationXml";

const app = (name, entities) => ({ name, elements: entities.map((e) => ({ tag: "Entity", name: e, xml: `<Entity name="${e}"/>` })) });
const signature = (d) => [d.shell, d.nav, d.header, d.cards, d.tables, d.bodyFont, d.primary].join("|");

describe("designProfile: every generated app gets its own visual system", () => {
  it("detects the app's domain from its name and entities", () => {
    expect(detectDomain(app("Hospital Patient Management", ["Patient", "Doctor", "Appointment"]))).toBe("healthcare");
    expect(detectDomain(app("Insurance claim", ["Policy", "Claim", "Customer"]))).toBe("finance");
    expect(detectDomain(app("MusicStream", ["Artist", "Album", "Track", "Playlist"]))).toBe("media");
    expect(detectDomain(app("Campus", ["Student", "Course", "Enrollment"]))).toBe("education");
    expect(detectDomain(app("Untitled", ["Thing"]))).toBe("general");
  });

  it("gives different domains different looks", () => {
    const hospital = resolveDesign(app("Hospital Patient Management", ["Patient", "Doctor", "Appointment"]), null);
    const claims = resolveDesign(app("Insurance claim", ["Policy", "Claim"]), null);
    const music = resolveDesign(app("MusicStream", ["Artist", "Track", "Playlist"]), null);
    expect(new Set([signature(hospital), signature(claims), signature(music)]).size).toBe(3);
    expect(music.appearance).toBe("dark");
    expect(claims.density).toBe("compact");
  });

  it("varies apps within one domain, and is stable for the same app", () => {
    const names = ["City Clinic", "Hospital Patient Management", "Dental Care", "Wellness Center", "Care Plus", "MediTrack"];
    const looks = names.map((n) => signature(resolveDesign(app(n, ["Patient", "Appointment"]), null)));
    expect(new Set(looks).size).toBeGreaterThan(2);
    const again = resolveDesign(app("City Clinic", ["Patient", "Appointment"]), null);
    expect(signature(again)).toBe(looks[0]);
  });

  it("lets a <Theme><Layout> from the AI decide everything it specifies", () => {
    const theme = parseThemeForRun(`<Theme name="t"><Colors primary="#be123c" accent="#f59e0b" background="#ffffff"/><Font family="Outfit" headingFamily="Fraunces" size="15"/><Style cornerRadius="18" density="comfortable"/><Layout shell="topnav" nav="solid" appearance="light" header="pattern" cards="elevated" tables="cards" canvas="warm" auth="centered"/></Theme>`);
    const d = resolveDesign(app("Insurance claim", ["Claim"]), theme);
    expect(d).toMatchObject({
      source: "theme", shell: "topnav", nav: "solid", header: "pattern", cards: "elevated", tables: "cards",
      canvas: "warm", auth: "centered", primary: "#be123c", accent: "#f59e0b", bodyFont: "Outfit", headingFont: "Fraunces", radius: 18, fontSize: 15,
    });
  });

  it("ignores invalid layout values and non-whitelisted fonts", () => {
    const theme = parseThemeForRun(`<Theme name="t"><Font family="Comic Sans MS"/><Layout shell="carousel" cards="elevated"/></Theme>`);
    const d = resolveDesign(app("Insurance claim", ["Claim"]), theme);
    expect(["sidebar", "topnav", "rail"]).toContain(d.shell);
    expect(d.cards).toBe("elevated");
    expect(d.bodyFont).not.toBe("Comic Sans MS");
  });

  it("builds one valid Google Fonts URL, deduplicated, without unsupported weights", () => {
    expect(fontHref(["IBM Plex Sans", "IBM Plex Sans", "Fraunces"]))
      .toBe("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Fraunces:wght@400;500;600;700&display=swap");
    expect(fontHref(["Not A Font"])).toBeNull();
  });

  it("only uses known layout values in every preset", () => {
    for (const preset of Object.values(DOMAIN_PRESETS)) {
      for (const v of preset.variants) {
        expect(["sidebar", "topnav", "rail"]).toContain(v.shell);
        expect(["banner", "pattern", "split", "minimal"]).toContain(v.header);
      }
    }
  });
});
