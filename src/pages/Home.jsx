import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Search, Download, Trash2, Boxes, Monitor, Plus, FolderOpen } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import StudioLayout from "../components/StudioLayout";
import { buildFullXml, downloadTextFile, xmlFilenameFor } from "../utils/applicationXml";

// The Studio's home — replaces the old Dashboard (its project workspace was for the retired engine;
// see Dashboard.jsx, kept for rollback). Text-to-app is the primary flow, so the first thing here is
// a single "describe what you want" composer: Create makes the Application and hands the
// description to the Runtime Engine page, which starts generating immediately (see its
// location.state.autoDescribe handling). Existing projects sit underneath as cards.

const EXAMPLES = [
  { label: "Insurance claims", name: "Insurance Claims", text: "An insurance claims app with customers, policies, claims and adjusters. Each policy belongs to a customer and can have many claims; each claim is assigned to an adjuster and has a status, amount and incident date. Claim amounts must be positive." },
  { label: "HR & leave", name: "HR Leave Manager", text: "An HR app with employees, departments and leave requests. Employees belong to a department; leave requests have a type (annual, sick, unpaid), start and end dates, and an approval status. End date can't be before start date." },
  { label: "Inventory", name: "Inventory Tracker", text: "An inventory app with products, suppliers, warehouses and stock movements. Each movement records a product, warehouse, quantity and direction (in/out). Quantity must be greater than zero." },
  { label: "Clinic", name: "Clinic Appointments", text: "A clinic app with patients, doctors and appointments. Users sign up and log in. Each appointment links a patient and a doctor with a date, time slot and status (booked, completed, cancelled)." },
];

function nameFromDescription(text) {
  const words = text.replace(/^(an?|the)\s+/i, "").split(/\s+/).slice(0, 4).join(" ");
  const cleaned = words.replace(/[^a-zA-Z0-9 &-]/g, "").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase()) : "Untitled app";
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [apps, setApps] = useState(null);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  function loadApps() {
    return api.get("/runtime-applications")
      .then((res) => setApps([...res.data].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))))
      .catch(() => { setApps([]); setError("Couldn't load your projects."); });
  }

  useEffect(() => { loadApps(); }, []);

  // Name is optional — left blank, a short one is derived from the description, so the fastest
  // path really is "type what you want, press Enter".
  function create({ blank = false } = {}) {
    const text = description.trim();
    if (!blank && !text) return;
    setCreating(true);
    setError("");
    const appName = name.trim() || (blank ? "Untitled app" : nameFromDescription(text));
    api.post("/runtime-applications", { name: appName })
      .then((res) => navigate(`/runtime-engine?id=${res.data.id}`, { state: blank ? undefined : { autoDescribe: text } }))
      .catch((e) => { setError(e.response?.data?.detail || "Couldn't create the project."); setCreating(false); });
  }

  function remove(app) {
    if (!window.confirm(`Delete "${app.name}"? This can't be undone.`)) return;
    api.delete(`/runtime-applications/${app.id}`)
      .then(() => setApps((cur) => cur.filter((a) => a.id !== app.id)))
      .catch(() => setError("Failed to delete this project."));
  }

  function download(app) {
    api.get(`/runtime-applications/${app.id}`)
      .then((res) => downloadTextFile(xmlFilenameFor(res.data.name), buildFullXml(res.data)))
      .catch(() => setError("Failed to download this project's XML."));
  }

  const q = filter.trim().toLowerCase();
  const visible = (apps || []).filter((a) => !q || a.name.toLowerCase().includes(q));
  const firstName = (user?.full_name || "").split(" ")[0];

  return (
    <StudioLayout active="projects">
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 32px 64px" }}>
        {/* Hero composer */}
        <div className="fade-in" style={{ textAlign: "center", marginBottom: 26 }}>
          <div className="studio-pill studio-pill-soft" style={{ marginBottom: 14 }}><Sparkles size={12} /> Text to app</div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.025em", margin: 0, lineHeight: 1.15 }}>
            {greeting()}{firstName ? `, ${firstName}` : ""}. <span className="gradient-text">What should we build?</span>
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "12px auto 0", maxWidth: 560, lineHeight: 1.6 }}>
            Describe your app in plain English. TextDev designs the data model, screens and rules — then you can run it right away.
          </p>
        </div>

        <div className="composer fade-in" style={{ maxWidth: 780, margin: "0 auto" }}>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create(); }}
            placeholder="e.g. A procurement app with vendors, purchase orders and invoices. Each purchase order has line items and needs manager approval over $5,000…"
            autoFocus
          />
          <div className="composer-bar" style={{ flexWrap: "wrap" }}>
            <input
              className="studio-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name (optional)"
              style={{ width: 220, padding: "7px 11px", fontSize: 13 }}
            />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Ctrl+Enter</span>
            <button className="studio-btn-ai" onClick={() => create()} disabled={creating || !description.trim()}>
              {creating ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating…</> : <><Sparkles size={15} /> Generate app</>}
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex.label} className="chip" onClick={() => { setDescription(ex.text); setName(ex.name); }}>
              {ex.label}
            </button>
          ))}
        </div>
        {error && <div style={{ textAlign: "center", color: "var(--danger)", fontSize: 13, marginTop: 14 }}>{error}</div>}

        {/* Projects */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 56, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 17, flex: 1 }}>
            Your projects {apps && apps.length > 0 && <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 14 }}>· {apps.length}</span>}
          </div>
          {apps && apps.length > 3 && (
            <div style={{ position: "relative", width: 240 }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
              <input className="studio-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects…" style={{ paddingLeft: 32, padding: "7px 11px 7px 32px", fontSize: 13 }} />
            </div>
          )}
          <button className="studio-btn-secondary" onClick={() => create({ blank: true })} disabled={creating} title="Create an empty project and describe it later">
            <Plus size={15} /> Blank project
          </button>
        </div>

        {apps === null && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 132, borderRadius: 12 }} />)}
          </div>
        )}

        {apps?.length === 0 && (
          <div className="studio-card" style={{ padding: "40px 24px", textAlign: "center", boxShadow: "none", borderStyle: "dashed" }}>
            <FolderOpen size={28} style={{ color: "var(--muted)" }} />
            <div style={{ fontWeight: 600, marginTop: 10 }}>No projects yet</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Describe an app above, or pick one of the examples to get started.</div>
          </div>
        )}

        {apps && apps.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {visible.map((a) => {
              const entities = a.elementCounts?.Entity || 0;
              const screens = a.elementCounts?.Screen || 0;
              const empty = Object.keys(a.elementCounts || {}).length === 0;
              return (
                <div
                  key={a.id}
                  className="studio-card hover-lift"
                  onClick={() => navigate(`/runtime-engine?id=${a.id}`)}
                  style={{ padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 14, boxShadow: "none" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {a.createdAt ? `Created ${new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "Project"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                      <button className="studio-icon-btn" style={{ border: "none", width: 28, height: 28 }} onClick={() => download(a)} title="Download XML"><Download size={14} /></button>
                      <button className="studio-icon-btn" style={{ border: "none", width: 28, height: 28 }} onClick={() => remove(a)} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {empty ? (
                      <span className="studio-pill studio-pill-muted">Not described yet</span>
                    ) : (
                      <>
                        <span className="studio-pill studio-pill-muted"><Boxes size={12} /> {entities} entit{entities === 1 ? "y" : "ies"}</span>
                        <span className="studio-pill studio-pill-muted"><Monitor size={12} /> {screens} screen{screens === 1 ? "" : "s"}</span>
                      </>
                    )}
                    <ArrowRight size={15} style={{ marginLeft: "auto", color: "var(--muted)" }} />
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>No projects match "{filter}".</div>}
          </div>
        )}
      </div>
    </StudioLayout>
  );
}
