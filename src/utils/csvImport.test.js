import { describe, expect, it } from "vitest";
import { autoMap, buildRows, importableFields, missingRequired, parseCsv, templateCsv } from "./csvImport";
import { toCsv } from "./runtimeFormat";
import { APP_TEMPLATES, TEMPLATE_CATEGORIES, templatesIn } from "./appTemplates";

const fields = [
  { name: "id", type: "string", key: true },
  { name: "number", type: "string", autoNumber: "apt" },
  { name: "patientName", type: "string", required: true },
  { name: "doctorId", type: "string" },
  { name: "fee", type: "decimal" },
  { name: "createdBy", type: "string" },
];

describe("reading a CSV file", () => {
  it("handles quotes, embedded commas and newlines, CRLF and a byte-order mark", () => {
    const { headers, rows } = parseCsv('\uFEFFName,Note\r\n"Rao, Asha","said ""hi""\nthen left"\r\nRavi,\r\n\r\n');
    expect(headers).toEqual(["Name", "Note"]);
    expect(rows).toEqual([["Rao, Asha", 'said "hi"\nthen left'], ["Ravi", ""]]);
  });

  it("detects semicolon and tab separated files", () => {
    expect(parseCsv("a;b\n1;2").rows).toEqual([["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2").headers).toEqual(["a", "b"]);
  });

  it("reads back what Export writes", () => {
    const text = toCsv(["Patient name", "Doctor", "Fee"], [["Asha", "Dr. Rao", "1,250.00"]]);
    const { headers, rows } = parseCsv(text);
    const targets = importableFields(fields);
    const mapping = autoMap(headers, targets, { patientName: "Patient name", doctorId: "Doctor" });
    expect(mapping).toEqual(["patientName", "doctorId", "fee"]);
    expect(buildRows(rows, mapping)).toEqual([{ patientName: "Asha", doctorId: "Dr. Rao", fee: "1,250.00" }]);
  });
});

describe("matching columns to fields", () => {
  it("offers only fields a person types in", () => {
    expect(importableFields(fields).map((f) => f.name)).toEqual(["patientName", "doctorId", "fee"]);
  });

  it("matches names loosely, never uses a field twice, and skips unknown columns", () => {
    expect(autoMap(["PATIENT_NAME", "doctor", "Patient Name", "Colour"], importableFields(fields))).toEqual(["patientName", "doctorId", "", ""]);
  });

  it("warns about required fields no column fills, and offers a blank template", () => {
    const targets = importableFields(fields);
    expect(missingRequired(targets, ["fee"]).map((f) => f.name)).toEqual(["patientName"]);
    expect(templateCsv(targets, { doctorId: "Doctor" })).toBe("Patient name,Doctor,Fee\r\n");
  });
});

describe("app templates", () => {
  it("are complete and filterable", () => {
    const ids = new Set();
    for (const t of APP_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(TEMPLATE_CATEGORIES).toContain(t.category);
      expect(t.modules.length).toBeGreaterThan(2);
      expect(t.highlights.length).toBeGreaterThan(0);
      expect(t.prompt.length).toBeGreaterThan(400);
      for (const r of t.roles) expect(t.prompt).toContain(r);
    }
    expect(templatesIn("Healthcare").map((t) => t.id)).toEqual(["clinic"]);
    expect(templatesIn("All", "lease").map((t) => t.id)).toEqual(["rentals"]);
  });
});
