import { describe, expect, it } from "vitest";
import { pluralize, toneForValue, formatDate, formatNumber, displayText, toCsv, initials } from "./runtimeFormat";

describe("runtimeFormat: how a generated app's values read to its end users", () => {
  it("pluralizes module names", () => {
    expect(pluralize("Patient")).toBe("Patients");
    expect(pluralize("Policy")).toBe("Policies");
    expect(pluralize("Day")).toBe("Days");
    expect(pluralize("Class")).toBe("Classes");
    expect(pluralize("Branch")).toBe("Branches");
  });

  it("gives status-like values a meaningful tone, never matching success inside a negative word", () => {
    expect(toneForValue("Paid")).toBe("success");
    expect(toneForValue("Completed")).toBe("success");
    expect(toneForValue("Unpaid")).toBe("warning");
    expect(toneForValue("Inactive")).toBe("danger");
    expect(toneForValue("Cancelled")).toBe("danger");
    expect(toneForValue("Pending")).toBe("warning");
    expect(toneForValue("Cardiology")).toBe(toneForValue("Cardiology")); // stable for anything else
    expect(["info", "purple", "teal", "neutral"]).toContain(toneForValue("Cardiology"));
  });

  it("formats a bare calendar date without shifting it a day", () => {
    const out = formatDate("2026-03-01");
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/1\b/);
    expect(out).not.toMatch(/Feb|28|29/);
    expect(formatDate("not a date")).toBe("not a date");
  });

  it("formats numbers and booleans for display and export", () => {
    expect(formatNumber("1234.5", "decimal")).toBe((1234.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(formatNumber("", "integer")).toBe("");
    expect(displayText(true, "boolean")).toBe("Yes");
    expect(displayText("false", "boolean")).toBe("No");
    expect(displayText(null, "string")).toBe("");
  });

  it("quotes CSV cells that need it", () => {
    expect(toCsv(["Name", "Notes"], [["Ada", 'said "hi", left'], ["Bob", "line1\nline2"]]))
      .toBe('Name,Notes\r\nAda,"said ""hi"", left"\r\nBob,"line1\nline2"');
  });

  it("builds initials from names and emails", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("ada.lovelace@example.com")).toBe("AL");
    expect(initials("")).toBe("?");
  });
});
