import { useEffect, useMemo, useRef, useState } from "react";
import { entitiesToMermaid } from "../utils/erDiagram";

// Extracted from Dashboard.jsx (was private to that file) so the new Domains page can render the
// exact same ER diagram for a domain's entities that a project's own "Architect View → DB Schema"
// already renders for its entities — same {tables:[{name, columns:[{name,type,pk,fk}]}]} shape
// either way, so this needed no changes to work for a domain template too.
export function ERDiagram({ entities, emptyMessage }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);

  const mermaidDef = useMemo(() => entitiesToMermaid(entities), [entities]);

  useEffect(() => {
    // No setSvg("") here on purpose: the render below already returns the empty-state message
    // whenever !mermaidDef, before it ever looks at svg — so a stale svg sitting unused in state
    // is harmless, and clearing it here would just be a synchronous setState-in-effect for nothing.
    if (!mermaidDef) return;
    let cancelled = false;
    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        er: { diagramPadding: 40, layoutDirection: "TB", minEntityWidth: 140, minEntityHeight: 80, entityPadding: 18, useMaxWidth: true },
      });
      const id = `er-${Date.now()}`;
      mermaid.render(id, mermaidDef).then(({ svg: rendered }) => {
        if (!cancelled) { setSvg(rendered); setError(null); }
      }).catch((e) => {
        if (!cancelled) setError(e.message);
      });
    });
    return () => { cancelled = true; };
  }, [mermaidDef]);

  if (!mermaidDef) {
    return <div style={{ padding: 60, textAlign: "center", color: "#7a7a7a" }}>{emptyMessage || "No schema extracted yet. Go to Database Schema in Workspace to extract entities."}</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: "#f87171", fontSize: 13 }}>Diagram error: {error}</div>;
  }
  if (!svg) {
    return <div style={{ padding: 60, textAlign: "center", color: "#7a7a7a" }}>Rendering diagram…</div>;
  }

  return (
    <div ref={containerRef} style={{ padding: 24, overflow: "auto", background: "#13111c", borderRadius: 8, minHeight: 300 }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
