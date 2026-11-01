// A small, dependency-free Markdown renderer for the Ask panel's answers — headings, paragraphs,
// bullet/numbered lists (one nesting level), tables, fenced code, and inline bold/italic/code.
// Builds React elements directly (never dangerouslySetInnerHTML), so an answer can't inject
// markup no matter what text comes back. Links render as their text only, on purpose: answers
// describe the application's own metadata and have no business sending the user anywhere.

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*```/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function parseBlocks(source) {
  const lines = (source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const startsBlock = (line) => FENCE.test(line) || /^#{1,6}\s/.test(line) || LIST_ITEM.test(line) || /^\s*\|/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (FENCE.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }
    if (/^\s*\|/.test(line) && TABLE_DIVIDER.test(lines[i + 1] || "")) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_ITEM);
        if (m) {
          const item = { text: m[3], children: [] };
          if (m[1].length >= 2 && items.length > 0) items[items.length - 1].children.push(item);
          else items.push(item);
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length > 0) {
          const last = items[items.length - 1];
          const target = last.children.length ? last.children[last.children.length - 1] : last;
          target.text += ` ${lines[i].trim()}`;
        } else break;
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const buf = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) buf.push(lines[i++].trim());
    blocks.push({ type: "paragraph", text: buf.join(" ") });
  }
  return blocks;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)]+\))/g;

function renderInline(text, keyPrefix = "i") {
  const out = [];
  let last = 0;
  let n = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n++}`;
    if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**") || token.startsWith("__")) out.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("[")) out.push(token.slice(1, token.indexOf("]")));
    else out.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderList(block, key) {
  const Tag = block.ordered ? "ol" : "ul";
  return (
    <Tag key={key}>
      {block.items.map((item, j) => (
        <li key={j}>
          {renderInline(item.text, `${key}-${j}`)}
          {item.children.length > 0 && (
            <ul>{item.children.map((c, k) => <li key={k}>{renderInline(c.text, `${key}-${j}-${k}`)}</li>)}</ul>
          )}
        </li>
      ))}
    </Tag>
  );
}

export default function Markdown({ text }) {
  const blocks = parseBlocks(text);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const Tag = b.level <= 2 ? "h3" : "h4";
          return <Tag key={i}>{renderInline(b.text, `h${i}`)}</Tag>;
        }
        if (b.type === "paragraph") return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
        if (b.type === "list") return renderList(b, `l${i}`);
        if (b.type === "hr") return <hr key={i} />;
        if (b.type === "code") return <pre key={i} className="code-block"><code>{b.text}</code></pre>;
        if (b.type === "table") {
          return (
            <div key={i} className="table-wrap">
              <table className="data-table">
                <thead><tr>{b.header.map((h, j) => <th key={j}>{renderInline(h, `th${i}-${j}`)}</th>)}</tr></thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r}>{b.header.map((_, j) => <td key={j}>{renderInline(row[j] ?? "", `td${i}-${r}-${j}`)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
