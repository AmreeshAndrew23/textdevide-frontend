import { API_ORIGIN } from "../api/client";

// Replaces client-side XML interpretation (XmlScreenRenderer) for screens generated under the
// current query/event vocabulary: the Node runtime engine parses the screen's XML and renders the
// HTML itself (see backend-node/src/runtime/renderer.ts); this is just the thin embed point. A
// real navigation (not srcDoc) so the page's own fetch() calls resolve against the backend's
// origin directly — see the plan for why srcDoc (used by the unrelated ScreenGenerator page)
// wouldn't work here. Auth travels as a ?token= query param since a top-level navigation can't
// carry an Authorization header; the token is re-embedded in the rendered page for the client
// script's own run-event calls.
export default function ServerScreenRenderer({ projectId, screenId }) {
  if (!projectId || !screenId) return null;
  const token = localStorage.getItem("token") || "";
  const src = `${API_ORIGIN}/runtime/projects/${projectId}/screens/${screenId}?token=${encodeURIComponent(token)}`;
  return (
    <iframe
      key={`${projectId}:${screenId}`}
      src={src}
      title="Screen preview"
      sandbox="allow-scripts allow-same-origin allow-forms"
      style={{ width: "100%", height: "100%", minHeight: 600, border: "none", background: "#fff" }}
    />
  );
}
