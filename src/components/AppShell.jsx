// Deterministic (no LLM, no XML) master-detail app shell wrapping the Studio's live preview —
// a fixed top bar + a left nav listing every one of the project's screens + a content area for
// whichever screen is active. This is what makes "an app with real navigation between screens"
// true for the preview, without ever expressing layout/navigation in a screen's own XML — per
// the design split, individual screens (XmlScreenRenderer) stay independent of the shell that
// hosts them.

export default function AppShell({ projectName, screens, activeScreenId, onSelectScreen, children }) {
  return (
    <div style={styles.shell}>
      <div style={styles.topBar}>
        <span style={styles.topBarTitle}>{projectName || "App Preview"}</span>
      </div>
      <div style={styles.body}>
        <div style={styles.leftNav}>
          {(screens || []).map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectScreen?.(s)}
              style={{
                ...styles.navItem,
                ...(s.id === activeScreenId ? styles.navItemActive : null),
              }}
              title={s.name}
            >
              {s.name}
            </div>
          ))}
          {!screens?.length && <div style={styles.navEmpty}>No screens yet</div>}
        </div>
        <div style={styles.content}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  shell: { display: "flex", flexDirection: "column", minHeight: 480, border: "1px solid var(--st-border, #e5e7eb)", borderRadius: 8, overflow: "hidden", background: "#fff" },
  topBar: { flexShrink: 0, padding: "10px 16px", borderBottom: "1px solid var(--st-border, #e5e7eb)", background: "var(--st-bg, #f9fafb)" },
  topBarTitle: { fontWeight: 700, fontSize: 14, color: "var(--st-text, #1f2937)" },
  body: { display: "flex", flex: 1, minHeight: 0 },
  leftNav: { width: 180, flexShrink: 0, borderRight: "1px solid var(--st-border, #e5e7eb)", padding: 8, overflowY: "auto" },
  navItem: { padding: "8px 10px", borderRadius: 6, fontSize: 12.5, cursor: "pointer", color: "var(--st-text, #1f2937)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  navItemActive: { background: "var(--clr-primary, #6366f1)", color: "#fff", fontWeight: 600 },
  navEmpty: { fontSize: 12, color: "var(--st-muted, #6b7280)", padding: "8px 10px" },
  content: { flex: 1, minWidth: 0, overflow: "auto" },
};
