import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { Sparkles, Boxes, MessageSquareText, Play } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { BrandMark } from "../components/StudioLayout";
import ThemeToggle from "../components/ThemeToggle";
import api from "../api/client";

// Split layout: what the product does on the left (the Describe → Ask → Run flow), the sign-in
// form on the right. The left panel drops away on narrow screens.
const FEATURES = [
  { icon: Sparkles, title: "Describe it", text: "Write what your app should do in plain English." },
  { icon: Boxes, title: "Get a real data model", text: "Entities, relationships, screens and rules — generated for you." },
  { icon: MessageSquareText, title: "Ask anything", text: "Query your app's design and get clear, readable answers." },
  { icon: Play, title: "Run it instantly", text: "Use the working app right away, with real records." },
];

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const payload = isRegister
        ? { email, password, full_name: fullName }
        : { email, password };
      const res = await api.post(endpoint, payload);
      login(res.data.access_token, res.data.user);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async (credentialResponse) => {
    setError("");
    try {
      const res = await api.post("/auth/google", {
        credential: credentialResponse.credential,
      });
      login(res.data.access_token, res.data.user);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Google login failed");
    }
  };

  return (
    <div className="studio-root login-wrap" style={styles.container}>
      <style>{`@media (max-width: 900px) { .login-story { display: none !important; } }`}</style>
      <div className="login-story" style={styles.story}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark size={34} />
          <div style={{ fontWeight: 800, fontSize: 17 }}>TextDev</div>
        </div>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, margin: 0 }}>
            From a sentence to a <span className="gradient-text">working app.</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: "16px 0 34px" }}>
            TextDev is an AI app builder: describe your idea, review what it designs, and run it — no code required.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                  <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>© {new Date().getFullYear()} TextDev</div>
      </div>

      <div style={styles.formSide}>
        <div style={{ position: "absolute", top: 20, right: 20 }}><ThemeToggle /></div>
        <div className="fade-in" style={styles.card}>
          <h2 style={styles.title}>{isRegister ? "Create your account" : "Welcome back"}</h2>
          <p style={styles.subtitle}>
            {isRegister ? "Start building apps from plain English." : "Sign in to continue to your projects."}
          </p>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.googleWrapper}>
            <GoogleLogin
              onSuccess={handleGoogle}
              onError={() => setError("Google login failed")}
              width="340"
              theme="filled_black"
              size="large"
              shape="rectangular"
              text={isRegister ? "signup_with" : "signin_with"}
            />
          </div>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>or with email</span>
            <span style={styles.dividerLine} />
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            {isRegister && (
              <label style={styles.label}>
                Full name
                <input type="text" placeholder="Ada Lovelace" value={fullName} onChange={(e) => setFullName(e.target.value)} className="studio-input" style={styles.input} />
              </label>
            )}
            <label style={styles.label}>
              Email
              <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="studio-input" style={styles.input} />
            </label>
            <label style={styles.label}>
              Password
              <input type="password" placeholder={isRegister ? "At least 6 characters" : "••••••••"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="studio-input" style={styles.input} />
            </label>
            <button type="submit" className="studio-btn-ai" disabled={submitting} style={{ padding: "11px", fontSize: 14.5, marginTop: 6 }}>
              {submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
            </button>
          </form>

          <p style={styles.toggle}>
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
              }}
              style={styles.toggleBtn}
            >
              {isRegister ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    background: "var(--bg)",
  },
  story: {
    flex: "1 1 50%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "40px 56px",
    borderRight: "1px solid var(--border)",
    background: "radial-gradient(90% 70% at 0% 0%, rgba(139,124,248,0.20) 0%, rgba(139,124,248,0) 60%), radial-gradient(70% 60% at 100% 100%, rgba(56,214,240,0.10) 0%, rgba(56,214,240,0) 60%), var(--bg-elev)",
  },
  formSide: {
    flex: "1 1 50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    position: "relative",
  },
  card: {
    width: "100%",
    maxWidth: "380px",
  },
  title: {
    fontSize: "26px",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    margin: "0 0 6px",
  },
  subtitle: {
    color: "var(--muted)",
    fontSize: "14px",
    margin: "0 0 26px",
  },
  error: {
    background: "var(--danger-soft)",
    border: "1px solid rgba(248,113,113,0.35)",
    color: "var(--danger)",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "13px",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "12.5px",
    fontWeight: 600,
    color: "var(--text-2)",
  },
  input: {
    padding: "11px 13px",
    fontSize: "14px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "22px 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "var(--border)",
  },
  dividerText: {
    color: "var(--muted)",
    fontSize: "12px",
  },
  googleWrapper: {
    display: "flex",
    justifyContent: "center",
  },
  toggle: {
    color: "var(--muted)",
    fontSize: "13px",
    textAlign: "center",
    marginTop: "22px",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    color: "var(--accent)",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    padding: 0,
  },
};
