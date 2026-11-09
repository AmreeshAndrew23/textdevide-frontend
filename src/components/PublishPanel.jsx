import { useCallback, useEffect, useState } from "react";
import { Rocket, Copy, Check, ExternalLink, UserPlus, Trash2, RefreshCw, CircleOff, Sparkles } from "lucide-react";
import api from "../api/client";
import { parseEntityForRun, parseRelationshipForRunFull, humanize } from "../utils/applicationXml";

// The Studio's Publish section: put an app on its public link, control who can join, and manage
// the people using it. Publishing snapshots the definition — later Studio edits stay private until
// "Publish changes" — while records are shared between the Studio and the live app.

const errorText = (e, fallback) => {
  const text = e?.response?.data?.detail ?? e?.response?.data?.message;
  return typeof text === "string" ? text : fallback;
};

// What can limit an entity's records: its creator, a link to a person, or a stored email.
function accessOptions(entityEl, detail, accountName) {
  const relationships = detail.elements.filter((e) => e.tag === "Relationship").map((e) => parseRelationshipForRunFull(e.xml));
  const entities = new Map(detail.elements.filter((e) => e.tag === "Entity").map((e) => [e.name, parseEntityForRun(e.xml).fields]));
  const options = [{ value: "creator", label: "Only records they created" }];
  for (const f of parseEntityForRun(entityEl.xml).fields) {
    const rel = relationships.find((r) => r.fromEntity === entityEl.name && r.fromField === f.name);
    if (rel && (rel.toEntity === accountName || entities.get(rel.toEntity)?.some((x) => /email/i.test(x.name)))) {
      options.push({ value: f.name, label: `Only where they are the ${humanize(rel.toEntity).toLowerCase()}` });
    } else if (!rel && /email/i.test(f.name)) {
      options.push({ value: f.name, label: `Only where ${humanize(f.name).toLowerCase()} is theirs` });
    }
  }
  return options;
}

export default function PublishPanel({ applicationId, appName, detail, onDetailChange, onAddSignIn }) {
  const [state, setState] = useState(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(null);

  const load = useCallback(() => api.get(`/runtime-applications/${applicationId}/publishing`)
    .then((res) => { setState(res.data); setSlug(res.data.slug || res.data.suggestedSlug); })
    .catch((e) => setError(errorText(e, "Couldn't load publishing details."))), [applicationId]);

  useEffect(() => { load(); }, [load]);

  function act(request, fallback) {
    setBusy(true);
    setError("");
    return request().then(load).catch((e) => setError(errorText(e, fallback))).finally(() => setBusy(false));
  }

  if (!state) {
    return error
      ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div>
      : <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />;
  }

  const url = `${window.location.origin}/a/${state.slug || slug}`;
  const base = `/runtime-applications/${applicationId}`;
  const publish = () => act(() => api.post(`${base}/publish`, { slug: slug.trim().toLowerCase() }), "Couldn't publish this app.");

  function copyLink() {
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  function copyInvite(invite) {
    navigator.clipboard?.writeText(`${url}?invite=${invite.token}`)
      .then(() => { setCopiedInvite(invite.id); setTimeout(() => setCopiedInvite(null), 1500); }).catch(() => {});
  }

  // Saved like any other change, so it appears in History and needs "Publish changes" to go live.
  function saveAccess(entityEl, scopeBy, exempt) {
    const doc = new DOMParser().parseFromString(entityEl.xml, "text/xml");
    const root = doc.documentElement;
    if (scopeBy) root.setAttribute("scopeBy", scopeBy); else root.removeAttribute("scopeBy");
    if (scopeBy && exempt.length) root.setAttribute("scopeExempt", exempt.join(",")); else root.removeAttribute("scopeExempt");
    const xml = new XMLSerializer().serializeToString(root);
    act(() => api.patch(base, { xml: `<Application>${xml}</Application>`, label: `record access for ${entityEl.name}` })
      .then(() => api.get(base)).then((res) => onDetailChange(res.data)), "Couldn't save that setting.");
  }

  function addInvite() {
    if (!inviteEmail.trim()) return;
    act(() => api.post(`${base}/invites`, { email: inviteEmail.trim(), role: inviteRole || null }), "Couldn't add that invitation.")
      .then(() => setInviteEmail(""));
  }

  const roleSelect = (value, onChange, none) => (
    <select className="studio-select" value={value || ""} onChange={(e) => onChange(e.target.value || null)} disabled={busy} style={{ width: 170 }}>
      <option value="">{none}</option>
      {state.roles.map((r) => <option key={r} value={r}>{r}</option>)}
    </select>
  );

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
      <div>
        <h1 className="section-title">Publish</h1>
        <p className="section-sub">Give {appName} a link that real people can use, with their own accounts and no TextDev login.</p>
      </div>

      {error && <div style={{ background: "var(--danger-soft)", color: "var(--danger)", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>{error}</div>}

      {!state.hasAccounts ? (
        <div className="studio-card" style={{ padding: 24, boxShadow: "none" }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Add user sign-in before publishing</div>
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: "6px 0 16px" }}>
            Without sign-in, anyone with the link could see and change all of this app's data, so it can't go public yet.
          </p>
          <button className="studio-btn-ai" onClick={onAddSignIn}><Sparkles size={15} /> Add sign-in with AI</button>
        </div>
      ) : (
        <>
          <div className="studio-card" style={{ padding: 20, boxShadow: "none", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={`studio-pill ${state.published ? "studio-pill-success" : "studio-pill-muted"}`}>{state.published ? "Live" : "Not published"}</span>
              {state.published && state.hasUnpublishedChanges && <span className="studio-pill studio-pill-soft">Unpublished changes</span>}
              {state.publishedAt && state.published && <span style={{ fontSize: 12, color: "var(--muted)" }}>Last published {new Date(state.publishedAt).toLocaleString()}</span>}
            </div>

            {state.published ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ flex: 1, minWidth: 260, padding: "9px 12px", background: "var(--input-bg)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</code>
                <button className="studio-btn-secondary studio-btn-sm" onClick={copyLink}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}</button>
                <a className="studio-btn-secondary studio-btn-sm" href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><ExternalLink size={13} /> Open</a>
              </div>
            ) : (
              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>
                Link name
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400 }}>{window.location.origin}/a/</span>
                  <input className="studio-input" value={slug} onChange={(e) => setSlug(e.target.value)} style={{ width: 240 }} />
                </div>
              </label>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-2)", flexWrap: "wrap" }}>
              Who can create an account
              <select className="studio-select" style={{ width: 230 }} value={state.signupMode} disabled={busy}
                onChange={(e) => { const signupMode = e.target.value; act(() => api.put(`${base}/publishing`, { signupMode }), "Couldn't change that setting."); }}>
                <option value="invite">Only people I invite</option>
                <option value="open">Anyone with the link</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="studio-btn-ai" onClick={publish} disabled={busy || (state.published && !state.hasUnpublishedChanges)}>
                {state.published ? <><RefreshCw size={15} /> Publish changes</> : <><Rocket size={15} /> Publish app</>}
              </button>
              {state.published && (
                <button className="studio-btn-danger" disabled={busy} onClick={() => { if (window.confirm("Take this app offline? Its users won't be able to reach it until you publish again.")) act(() => api.post(`${base}/unpublish`), "Couldn't unpublish this app."); }}>
                  <CircleOff size={14} /> Unpublish
                </button>
              )}
            </div>
          </div>

          {(() => {
            const entityEls = detail.elements.filter((e) => e.tag === "Entity");
            const account = entityEls.find((e) => parseEntityForRun(e.xml).isAccount)?.name;
            const roleEntity = detail.elements.filter((e) => e.tag === "Relationship").map((e) => parseRelationshipForRunFull(e.xml)).find((r) => r.fromEntity === account && r.fromField === "roleId")?.toEntity;
            const rows = entityEls.filter((e) => e.name !== account && e.name !== roleEntity);
            return (
              <div className="studio-card" style={{ padding: 20, boxShadow: "none" }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Who sees which records</div>
                <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
                  Choose whether people see every record or only their own. To match someone through a link (like an appointment's doctor), the linked record's email must be the one they sign in with. The Studio preview always shows everything.
                </p>
                {state.accessProblems.map((p) => <div key={p} style={{ color: "var(--warning)", fontSize: 12.5, marginBottom: 8 }}>{p}</div>)}
                {rows.map((el) => {
                  const root = new DOMParser().parseFromString(el.xml, "text/xml").documentElement;
                  const scopeBy = root.getAttribute("scopeBy") || "";
                  const exempt = (root.getAttribute("scopeExempt") || "").split(",").map((r) => r.trim()).filter(Boolean);
                  return (
                    <div key={el.name} style={{ padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ flex: 1, minWidth: 140, fontWeight: 600 }}>{humanize(el.name)}</span>
                        <select className="studio-select" style={{ width: 290 }} value={scopeBy} disabled={busy} onChange={(e) => saveAccess(el, e.target.value, exempt)}>
                          <option value="">Everyone sees all records</option>
                          {accessOptions(el, detail, account).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          {scopeBy && !accessOptions(el, detail, account).some((o) => o.value === scopeBy) && <option value={scopeBy}>Limited by {scopeBy}</option>}
                        </select>
                      </div>
                      {scopeBy && state.roles.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 12.5, color: "var(--muted)" }}>
                          These roles still see everything:
                          {state.roles.map((r) => (
                            <label key={r} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-2)", cursor: "pointer" }}>
                              <input type="checkbox" checked={exempt.includes(r)} disabled={busy} onChange={(e) => saveAccess(el, scopeBy, e.target.checked ? [...exempt, r] : exempt.filter((x) => x !== r))} /> {r}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {state.supportsInvites && (
            <div className="studio-card" style={{ padding: 20, boxShadow: "none" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Invitations</div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
                Each person gets their own link: send it however you like. It works once, for that email, and expires after 14 days.{state.published ? "" : " Links start working once the app is published."}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input className="studio-input" type="email" placeholder="name@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addInvite(); }} style={{ flex: 1, minWidth: 220 }} />
                {state.usesRoles && roleSelect(inviteRole, (r) => setInviteRole(r || ""), "No role")}
                <button className="studio-btn-primary" onClick={addInvite} disabled={busy || !inviteEmail.trim()}><UserPlus size={14} /> Invite</button>
              </div>
              {state.invites.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
                  {state.invites.map((i) => (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{i.email}</span>
                      {i.role && <span className="studio-pill studio-pill-muted">{i.role}</span>}
                      <span className={`studio-pill ${i.joined ? "studio-pill-success" : "studio-pill-muted"}`}>{i.joined ? "Joined" : i.expired ? "Expired" : "Invited"}</span>
                      {!i.joined && !i.expired && state.published && (
                        <button className="studio-btn-secondary studio-btn-sm" onClick={() => copyInvite(i)}>
                          {copiedInvite === i.id ? <Check size={13} /> : <Copy size={13} />} {copiedInvite === i.id ? "Copied" : "Copy link"}
                        </button>
                      )}
                      {!i.joined && i.expired && (
                        <button className="studio-btn-secondary studio-btn-sm" disabled={busy} onClick={() => act(() => api.post(`${base}/invites`, { email: i.email, role: i.role }), "Couldn't renew that invitation.")}>
                          <RefreshCw size={13} /> Renew
                        </button>
                      )}
                      <button className="studio-icon-btn" style={{ width: 28, height: 28 }} title="Remove invitation" disabled={busy} onClick={() => act(() => api.delete(`${base}/invites/${i.id}`), "Couldn't remove that invitation.")}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="studio-card" style={{ padding: 20, boxShadow: "none" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Members <span style={{ color: "var(--muted)", fontWeight: 500, fontSize: 13 }}>· {state.members.length}</span></div>
            {state.usesRoles && <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 10px" }}>The first person to join without an invited role becomes {state.roles.find((r) => /admin|owner|manager/i.test(r)) || "the top role"}. A role change applies straight away.</p>}
            {state.members.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Nobody has joined yet.</div>
            ) : state.members.map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 600 }}>{m.name || m.identity}</div>
                  {m.name && <div style={{ fontSize: 12, color: "var(--muted)" }}>{m.identity}</div>}
                </div>
                {!m.verified && <span className="studio-pill studio-pill-muted">Email not verified</span>}
                {state.usesRoles && roleSelect(m.role, (role) => act(() => api.put(`${base}/members/${encodeURIComponent(m.key)}/role`, { role }), "Couldn't change that role."), "No role")}
                <button className="studio-icon-btn" style={{ width: 28, height: 28 }} title="Remove member" disabled={busy}
                  onClick={() => { if (window.confirm(`Remove ${m.identity} from this app?`)) act(() => api.delete(`${base}/members/${encodeURIComponent(m.key)}`), "Couldn't remove that member."); }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
