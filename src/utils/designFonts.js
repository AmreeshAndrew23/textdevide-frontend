import { useEffect } from "react";
import { fontHref } from "./designProfile";

// Loads a design's Google Fonts into <head>, once per distinct stylesheet URL (never removed —
// moving between apps or previews just reuses what's already loaded). Used by the Run panel and
// by every Design-tab preview, so previews render in their real fonts.
export function useDesignFonts(...families) {
  const href = fontHref(families);
  useEffect(() => {
    if (!href) return;
    if ([...document.head.querySelectorAll("link[data-rt-font]")].some((l) => l.dataset.rtFont === href)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.rtFont = href;
    document.head.appendChild(link);
  }, [href]);
}
