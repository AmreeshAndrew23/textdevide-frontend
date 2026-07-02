import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import api from "../api/client";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
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
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Text Dev IDE</h1>
        <p style={styles.subtitle}>
          {isRegister ? "Create your account" : "Sign in to continue"}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {isRegister && (
            <input
              type="text"
              placeholder="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={styles.input}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>
            {isRegister ? "Register" : "Sign In"}
          </button>
        </form>

        <div style={styles.divider}>
          <span style={styles.dividerText}>or</span>
        </div>

        <div style={styles.googleWrapper}>
          <GoogleLogin
            onSuccess={handleGoogle}
            onError={() => setError("Google login failed")}
            width="100%"
            theme="filled_black"
            size="large"
            text={isRegister ? "signup_with" : "signin_with"}
          />
        </div>

        <p style={styles.toggle}>
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            style={styles.toggleBtn}
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1e1e1e",
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
  },
  card: {
    background: "#252526",
    borderRadius: "16px",
    padding: "40px",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    border: "1px solid #333",
  },
  title: {
    color: "#e0e0e0",
    fontSize: "28px",
    fontWeight: 700,
    margin: "0 0 4px",
    textAlign: "center",
  },
  subtitle: {
    color: "#7a7a7a",
    fontSize: "14px",
    margin: "0 0 24px",
    textAlign: "center",
  },
  error: {
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#f87171",
    borderRadius: "8px",
    padding: "10px",
    fontSize: "13px",
    marginBottom: "16px",
    textAlign: "center",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #3c3c3c",
    background: "#2d2d30",
    color: "#e0e0e0",
    fontSize: "14px",
    outline: "none",
  },
  button: {
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    background: "#6366f1",
    color: "#fff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "4px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "20px 0",
    gap: "12px",
  },
  dividerText: {
    color: "#7a7a7a",
    fontSize: "13px",
    flex: "none",
    padding: "0 8px",
    width: "100%",
    textAlign: "center",
    borderTop: "1px solid #333",
    lineHeight: "0",
    paddingTop: "10px",
  },
  googleWrapper: {
    display: "flex",
    justifyContent: "center",
  },
  toggle: {
    color: "#7a7a7a",
    fontSize: "13px",
    textAlign: "center",
    marginTop: "20px",
  },
  toggleBtn: {
    background: "none",
    border: "none",
    color: "#818cf8",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    padding: 0,
  },
};
