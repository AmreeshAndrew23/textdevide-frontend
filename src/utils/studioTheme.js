import { useEffect, useState } from "react";

// The Studio's dark/light mode. The choice lives on <html data-theme="dark|light"> (styles.css
// swaps every color token off that attribute) and is remembered per browser. index.html applies
// the saved value before React loads, so a light-mode user never sees a dark flash on refresh.
// Dark is the default. Generated apps are unaffected — they're branded by their own <Theme>.

const STORAGE_KEY = "textdev.theme";

export function getStudioTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setStudioTheme(theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode) — the choice just won't survive a reload.
  }
  window.setTimeout(() => root.classList.remove("theme-switching"), 300);
}

// Re-renders the caller whenever the theme changes anywhere (any toggle on the page) — for the
// few things that can't read CSS variables themselves, like the Mermaid ER diagram.
export function useStudioTheme() {
  const [theme, setTheme] = useState(getStudioTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getStudioTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
