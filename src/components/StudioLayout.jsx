import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, LayoutGrid, Library, Coins, Settings, LogOut, X as XIcon } from "lucide-react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

// The Studio's own outer shell for top-level pages — brand, primary navigation, and the signed-in
// account (settings, admin, log out) in one fixed left sidebar, so every top-level page reads as
// the same product. Distinct from components/AppShell.jsx, which is the shell of a *generated*
// app's preview, not of the Studio itself.

export function BrandMark({ size = 32 }) {
  return (
    <div className="ai-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}>
      <Sparkles size={Math.round(size * 0.52)} strokeWidth={2} />
    </div>
  );
}

function SettingsModal({ onClose }) {
  const { user, setUser } = useAuth();
  const [githubToken, setGithubToken] = useState(user?.github_token || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function save() {
    setSaving(true);
    setError("");
    api.put("/auth/me", { github_token: githubToken.trim() })
      .then((res) => { setUser(res.data); onClose(); })
      .catch(() => setError("Failed to save — try again."))
      .finally(() => setSaving(false));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="studio-card fade-in" style={{ width: 440, maxWidth: "100%", padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 17, flex: 1 }}>Settings</div>
          <button className="studio-icon-btn" onClick={onClose} title="Close"><XIcon size={16} /></button>
        </div>
        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", marginBottom: 6 }}>GitHub personal access token</label>
        <input type="password" className="studio-input" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxx" />
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.5 }}>Used to create GitHub repos for your projects. Needs the <code>repo</code> scope.</p>
        {error && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
          <button className="studio-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="studio-btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export default function StudioLayout({ active, children }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const displayName = user?.full_name || (user?.email || "User").split("@")[0];

  const items = [
    { key: "projects", label: "Projects", icon: LayoutGrid, to: "/" },
    { key: "domains", label: "Domain catalog", icon: Library, to: "/domains" },
  ];
  if (user?.is_superuser) items.push({ key: "admin", label: "Token usage", icon: Coins, to: "/admin" });

  return (
    <div className="studio-root" style={{ display: "flex", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      <aside style={{ width: 240, flexShrink: 0, background: "var(--bg-elev)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: "18px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px 18px" }}>
          <BrandMark />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>TextDev</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>AI app builder</div>
          </div>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {items.map(({ key, label, icon: Icon, to }) => (
            <button key={key} className={`nav-item${active === key ? " active" : ""}`} onClick={() => navigate(to)}>
              <Icon size={17} strokeWidth={1.8} /> {label}
            </button>
          ))}
        </nav>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 10px" }}>
            {user?.picture
              ? <img src={user.picture} alt="" style={{ width: 32, height: 32, borderRadius: "50%" }} />
              : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{displayName[0]?.toUpperCase()}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
            </div>
          </div>
          <ThemeToggle variant="nav" />
          <button className="nav-item" onClick={() => setShowSettings(true)}><Settings size={16} strokeWidth={1.8} /> Settings</button>
          <button className="nav-item" onClick={logout}><LogOut size={16} strokeWidth={1.8} /> Log out</button>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</main>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
