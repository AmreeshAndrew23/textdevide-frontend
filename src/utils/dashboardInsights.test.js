import { describe, expect, it } from "vitest";
import { buildInsights, rowLabel } from "./dashboardInsights";

const el = (tag, name, xml) => ({ tag, name, xml });
const mod = (key) => ({ key, label: key.replace(/([a-z])([A-Z])/g, "$1 $2"), icon: null });

const hospital = {
  elements: [
    el("Entity", "Doctor", `<Entity name="Doctor"><Field name="id" type="string" key="true"/><Field name="fullName" type="string"/></Entity>`),
    el("Entity", "Patient", `<Entity name="Patient"><Field name="id" type="string" key="true"/><Field name="fullName" type="string"/><Field name="dob" type="date"/></Entity>`),
    el("Entity", "Appointment", `<Entity name="Appointment"><Field name="id" type="string" key="true"/><Field name="patientId" type="string"/><Field name="doctorId" type="string"/><Field name="appointmentDate" type="date"/><Field name="reason" type="string"/><Field name="status" type="enum"><Value>Booked</Value><Value>Completed</Value><Value>Cancelled</Value></Field></Entity>`),
    el("Entity", "Invoice", `<Entity name="Invoice"><Field name="id" type="string" key="true"/><Field name="patientId" type="string"/><Field name="amount" type="decimal"/><Field name="paymentStatus" type="enum"><Value>Unpaid</Value><Value>Paid</Value></Field></Entity>`),
    el("Relationship", "AppointmentPatient", `<Relationship name="AppointmentPatient" fromEntity="Appointment" fromField="patientId" toEntity="Patient" toField="id"/>`),
    el("Relationship", "AppointmentDoctor", `<Relationship name="AppointmentDoctor" fromEntity="Appointment" fromField="doctorId" toEntity="Doctor" toField="id"/>`),
    el("Relationship", "InvoicePatient", `<Relationship name="InvoicePatient" fromEntity="Invoice" fromField="patientId" toEntity="Patient" toField="id"/>`),
  ],
};
const NOW = new Date("2026-11-01T10:00:00");
const hospitalRows = {
  Doctor: [{ id: "d1", fullName: "Dr. Rao" }, { id: "d2", fullName: "Dr. Lee" }],
  Patient: [{ id: "p1", fullName: "Asha Nair" }, { id: "p2", fullName: "Ben Cole" }],
  Appointment: [
    { id: "a1", patientId: "p1", doctorId: "d1", appointmentDate: "2026-11-01", reason: "Checkup", status: "Booked" },
    { id: "a2", patientId: "p2", doctorId: "d1", appointmentDate: "2026-11-05", reason: "Follow-up", status: "Booked" },
    { id: "a3", patientId: "p1", doctorId: "d2", appointmentDate: "2026-10-20", reason: "Fever", status: "Completed" },
  ],
  Invoice: [
    { id: "i1", patientId: "p1", amount: "1200.50", paymentStatus: "Paid" },
    { id: "i2", patientId: "p2", amount: "800", paymentStatus: "Unpaid" },
  ],
};

describe("dashboardInsights: a dashboard built from the app itself", () => {
  const ins = buildInsights({ modules: ["Doctor", "Patient", "Appointment", "Invoice"].map(mod), detail: hospital, rowsByEntity: hospitalRows, now: NOW });

  it("picks the app's main record type — the linked, dated, status-bearing one", () => {
    expect(ins.focus.key).toBe("Appointment");
    expect(ins.loading).toBe(false);
  });

  it("surfaces what needs attention and money totals as KPIs", () => {
    expect(ins.kpis[0]).toMatchObject({ kind: "count", label: "Total appointments", value: 3, sub: "2 this month" });
    expect(ins.kpis.find((k) => k.kind === "attention")).toMatchObject({ label: "Appointments needing attention", value: 2 });
    expect(ins.kpis.find((k) => k.kind === "money")).toMatchObject({ label: "Total amount", value: 2000.5 });
  });

  it("lists upcoming appointments with linked names, not ids", () => {
    expect(ins.timeline.title).toBe("Upcoming appointments");
    expect(ins.timeline.items.map((i) => i.row.id)).toEqual(["a1", "a2"]);
    expect(ins.timeline.items[0].context).toEqual(["Asha Nair", "Dr. Rao"]);
    expect(ins.highlights[0]).toBe("1 appointment today");
  });

  it("breaks records down by status and by linked entity", () => {
    expect(ins.breakdowns[0]).toMatchObject({ title: "Appointments by status", total: 3 });
    expect(ins.breakdowns[0].buckets[0]).toMatchObject({ value: "Booked", count: 2, tone: "warning" });
    expect(ins.distribution.title).toMatch(/^Appointments by (patient|doctor)$/);
  });

  it("gives a completely different dashboard for an HR app", () => {
    const hr = {
      elements: [
        el("Entity", "Employee", `<Entity name="Employee"><Field name="id" type="string" key="true"/><Field name="firstName" type="string"/><Field name="lastName" type="string"/><Field name="salary" type="decimal"/></Entity>`),
        el("Entity", "LeaveRequest", `<Entity name="LeaveRequest"><Field name="id" type="string" key="true"/><Field name="employeeId" type="string"/><Field name="startDate" type="date"/><Field name="status" type="enum"><Value>Pending</Value><Value>Approved</Value></Field></Entity>`),
        el("Relationship", "LeaveEmployee", `<Relationship name="LeaveEmployee" fromEntity="LeaveRequest" fromField="employeeId" toEntity="Employee" toField="id"/>`),
      ],
    };
    const hrIns = buildInsights({
      modules: [mod("Employee"), mod("LeaveRequest")], detail: hr, now: NOW,
      rowsByEntity: {
        Employee: [{ id: "e1", firstName: "Mia", lastName: "Wong", salary: "5000" }],
        LeaveRequest: [{ id: "l1", employeeId: "e1", startDate: "2026-11-10", status: "Pending" }],
      },
    });
    expect(hrIns.focus.key).toBe("LeaveRequest");
    expect(hrIns.timeline.title).toBe("Upcoming leave requests");
    expect(hrIns.timeline.items[0].context).toEqual(["Mia Wong"]);
    expect(hrIns.kpis.find((k) => k.kind === "money").label).toBe("Total salary");
    expect(hrIns.breakdowns[0].title).toBe("Leave Requests by status");
  });

  it("reports loading until every module's rows arrive, and lists empty modules", () => {
    const partial = buildInsights({ modules: [mod("Doctor"), mod("Invoice")], detail: hospital, rowsByEntity: { Doctor: [], Invoice: "loading" }, now: NOW });
    expect(partial.loading).toBe(true);
    expect(partial.emptyModules.map((m) => m.key)).toEqual(["Doctor"]);
  });

  it("labels rows by their name-like fields", () => {
    const fields = [{ name: "id", type: "string", key: true }, { name: "email", type: "string" }, { name: "fullName", type: "string" }];
    expect(rowLabel(fields, { id: "x", email: "a@b.c", fullName: "Asha Nair" })).toBe("Asha Nair");
  });
});
