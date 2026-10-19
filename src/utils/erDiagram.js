// Shared by ERDiagram.jsx and anything else that needs a Mermaid erDiagram definition string from
// this app's {tables:[{name, columns:[{name,type,pk,fk}]}]} entities shape — kept in its own file
// (not inside ERDiagram.jsx) so that component file only ever exports a component, which Vite's
// fast-refresh boundary detection requires.
export function entitiesToMermaid(entities) {
  if (!entities?.tables?.length) return "";
  const lines = ["erDiagram"];
  for (const table of entities.tables) {
    lines.push(`  ${table.name} {`);
    for (const col of (table.columns || [])) {
      const type = (col.type || "string").replace(/\s+/g, "_");
      const name = col.name;
      const tags = [col.pk ? "PK" : null, col.fk ? "FK" : null].filter(Boolean).join(",");
      lines.push(`    ${type} ${name}${tags ? ` "${tags}"` : ""}`);
    }
    lines.push("  }");
  }
  const seen = new Set();
  for (const table of entities.tables) {
    for (const col of (table.columns || [])) {
      if (col.fk) {
        const refTable = col.fk.split(".")[0];
        const key = `${refTable}||--o{${table.name}`;
        if (!seen.has(key) && refTable !== table.name) {
          seen.add(key);
          lines.push(`  ${refTable} ||--o{ ${table.name} : " "`);
        }
      }
    }
  }
  return lines.join("\n");
}
