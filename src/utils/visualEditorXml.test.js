import { describe, it, expect } from "vitest";
import { xmlToCraftTree, craftTreeToXml } from "./visualEditorXml.js";

const SCREEN = (ui) => `<screen id="s" title="S">
  <header><title>S</title></header>
  <dataSources><dataSource id="mainDB" type="database"/></dataSources>
  <queries>
    <query id="listStudents"><statement>MATCH (s:Student) RETURN s.regNo AS regNo</statement></query>
  </queries>
  ${ui}
  <events>
    <event type="load" element="s"><execute query="listStudents"><map result="rows" target="grid:g"/></execute></event>
  </events>
  <dataBindings><entity name="Student" operations="SELECT"/></dataBindings>
  <accessibility ariaLabel="S" tabOrder="1"/>
</screen>`;

const FULL_UI = `<ui>
  <field id="regNo" label="Reg No" type="text" persistenceMapping="Student.regNo" readonly="false" default="">
    <hint>Enter the registration number</hint>
    <rule required="true"/>
    <rule maxLength="10"/>
    <rule minAge="18"/>
    <rule maxAge="23"/>
    <rule unique="true"/>
  </field>
  <field id="dept" label="Department" type="select" optionValue="deptId" optionLabel="deptName" visibleRoles="Admin,HR"/>
  <field id="status" label="Status" type="select">
    <option value="active" label="Active"/>
    <option value="inactive" label="Inactive"/>
  </field>
  <fieldset legend="Contact">
    <field id="email" label="Email" type="email"/>
    <field id="phone" label="Phone" type="text"/>
  </fieldset>
  <grid id="g" label="Students" emptyMessage="No students.">
    <column id="c1" header="Reg No" binding="regNo" persistenceMapping="Student.regNo"/>
    <actions><action type="edit"/><action type="delete" target="delBtn" confirm="Delete this student?"/></actions>
  </grid>
  <button id="save" label="Save" style="primary"/>
  <button id="delBtn" label="Delete" style="danger"/>
</ui>`;

describe("xmlToCraftTree: parses the <ui> block into the plain tree", () => {
  it("parses every field attribute, including the advanced ones", () => {
    const { items } = xmlToCraftTree(SCREEN(FULL_UI));
    const regNo = items.find((i) => i.id === "regNo");
    expect(regNo.type).toBe("field");
    expect(regNo.props.label).toBe("Reg No");
    expect(regNo.props.persistenceMapping).toBe("Student.regNo");
    expect(regNo.props.hint).toBe("Enter the registration number");
    expect(regNo.props.rules).toEqual([
      { required: true }, { maxLength: 10 }, { minAge: 18 }, { maxAge: 23 }, { unique: true },
    ]);
  });
  it("parses optionsBinding, visibleRoles, and static options", () => {
    const { items } = xmlToCraftTree(SCREEN(FULL_UI));
    const dept = items.find((i) => i.id === "dept");
    expect(dept.props.optionsBinding).toEqual({ valueColumn: "deptId", labelColumn: "deptName" });
    expect(dept.props.visibleRoles).toEqual(["Admin", "HR"]);
    const status = items.find((i) => i.id === "status");
    expect(status.props.options).toEqual([{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]);
  });
  it("parses a fieldset's nested children and legend", () => {
    const { items } = xmlToCraftTree(SCREEN(FULL_UI));
    const fs = items.find((i) => i.type === "fieldset");
    expect(fs.props.legend).toBe("Contact");
    expect(fs.children.map((c) => c.id)).toEqual(["email", "phone"]);
  });
  it("parses grid columns and edit/delete actions", () => {
    const { items } = xmlToCraftTree(SCREEN(FULL_UI));
    const grid = items.find((i) => i.type === "grid");
    expect(grid.props.columns).toEqual([{ id: "c1", header: "Reg No", binding: "regNo", persistenceMapping: "Student.regNo" }]);
    expect(grid.props.actions).toEqual([{ type: "edit" }, { type: "delete", target: "delBtn", confirm: "Delete this student?" }]);
  });
  it("degrades to an empty tree for malformed, empty, or <ui>-less XML, never throws", () => {
    expect(xmlToCraftTree("")).toEqual({ items: [] });
    expect(xmlToCraftTree("not xml at all <<<")).toEqual({ items: [] });
    expect(xmlToCraftTree(`<screen id="s" title="S"></screen>`)).toEqual({ items: [] });
  });
});

describe("craftTreeToXml: round-trips and never touches anything outside <ui>", () => {
  it("a full round trip (XML -> tree -> XML -> tree) is semantically identical", () => {
    const original = xmlToCraftTree(SCREEN(FULL_UI));
    const rebuiltXml = craftTreeToXml(original.items, SCREEN(FULL_UI));
    const reparsed = xmlToCraftTree(rebuiltXml);
    expect(reparsed).toEqual(original);
  });
  it("leaves <queries>/<events>/<dataBindings>/<accessibility> structurally untouched", () => {
    const original = xmlToCraftTree(SCREEN(FULL_UI));
    const rebuiltXml = craftTreeToXml(original.items, SCREEN(FULL_UI));
    // Both sides normalized through the same DOM round-trip, so a direct comparison is fair.
    const normalizedOriginal = new XMLSerializer().serializeToString(new DOMParser().parseFromString(SCREEN(FULL_UI), "application/xml"));
    const expectedQueries = new DOMParser().parseFromString(normalizedOriginal, "application/xml").querySelector("queries");
    const expectedEvents = new DOMParser().parseFromString(normalizedOriginal, "application/xml").querySelector("events");
    const actualDoc = new DOMParser().parseFromString(rebuiltXml, "application/xml");
    expect(actualDoc.querySelector("queries").outerHTML).toBe(expectedQueries.outerHTML);
    expect(actualDoc.querySelector("events").outerHTML).toBe(expectedEvents.outerHTML);
    expect(actualDoc.querySelector("dataBindings")).toBeTruthy();
    expect(actualDoc.querySelector("accessibility").getAttribute("ariaLabel")).toBe("S");
  });
  it("an edit to one field's label doesn't affect any other item", () => {
    const { items } = xmlToCraftTree(SCREEN(FULL_UI));
    const edited = items.map((i) => (i.id === "regNo" ? { ...i, props: { ...i.props, label: "Registration Number" } } : i));
    const rebuilt = xmlToCraftTree(craftTreeToXml(edited, SCREEN(FULL_UI)));
    expect(rebuilt.items.find((i) => i.id === "regNo").props.label).toBe("Registration Number");
    expect(rebuilt.items.find((i) => i.id === "dept").props.visibleRoles).toEqual(["Admin", "HR"]);
  });
  it("creates a <ui> block (right before <events>) when the screen had none yet", () => {
    const noUiXml = SCREEN("");
    const newField = { type: "field", id: "name", props: { label: "Name", fieldType: "text", rules: [], options: [], optionsBinding: null, visibleRoles: null }, children: [] };
    const result = craftTreeToXml([newField], noUiXml);
    const doc = new DOMParser().parseFromString(result, "application/xml");
    const screenEl = doc.querySelector("screen");
    const children = Array.from(screenEl.children).map((c) => c.tagName);
    expect(children.indexOf("ui")).toBeGreaterThan(-1);
    expect(children.indexOf("ui")).toBeLessThan(children.indexOf("events"));
    expect(doc.querySelector("ui > field").getAttribute("id")).toBe("name");
  });
  it("throws a clear error rather than silently producing garbage for malformed existing XML", () => {
    expect(() => craftTreeToXml([], "not xml <<<")).toThrow(/not well-formed/);
    expect(() => craftTreeToXml([], "<notAScreen/>")).toThrow(/no <screen> root/);
  });
});
