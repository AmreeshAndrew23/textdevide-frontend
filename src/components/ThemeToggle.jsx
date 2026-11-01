import { Sun, Moon } from "lucide-react";
import { setStudioTheme, useStudioTheme } from "../utils/studioTheme";

// Dark/light switch for the Studio. variant="nav" renders as a full-width sidebar row (label
// included); the default is a compact icon button for headers.
export default function ThemeToggle({ variant = "icon" }) {
  const theme = useStudioTheme();
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;
  const label = theme === "dark" ? "Light mode" : "Dark mode";
  if (variant === "nav") {
    return (
      <button className="nav-item" onClick={() => setStudioTheme(next)} title={`Switch to ${next} mode`}>
        <Icon size={16} strokeWidth={1.8} /> {label}
      </button>
    );
  }
  return (
    <button className="studio-icon-btn" onClick={() => setStudioTheme(next)} title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`}>
      <Icon size={16} />
    </button>
  );
}
