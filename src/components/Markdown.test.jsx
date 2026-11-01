import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "./Markdown";

const render = (text) => renderToStaticMarkup(<Markdown text={text} />);

describe("Markdown: the Ask panel's answer renderer", () => {
  it("renders headings, paragraphs and inline bold/code", () => {
    const html = render("### Entities\nThe **Claim** entity has a `status` field.");
    expect(html).toContain("<h4>Entities</h4>");
    expect(html).toContain("<p>The <strong>Claim</strong> entity has a <code>status</code> field.</p>");
  });

  it("renders bullet and numbered lists, with one level of nesting", () => {
    const html = render("- Policy\n  - belongs to Customer\n- Claim\n\n1. First\n2. Second");
    expect(html).toContain("<ul><li>Policy<ul><li>belongs to Customer</li></ul></li><li>Claim</li></ul>");
    expect(html).toContain("<ol><li>First</li><li>Second</li></ol>");
  });

  it("renders a GitHub-style table", () => {
    const html = render("| Field | Required |\n|---|---|\n| amount | Yes |\n| notes | No |");
    expect(html).toContain("<th>Field</th><th>Required</th>");
    expect(html).toContain("<td>amount</td><td>Yes</td>");
    expect(html).toContain("<td>notes</td><td>No</td>");
  });

  it("renders fenced code verbatim", () => {
    const html = render("```xml\n<Entity name=\"Claim\"/>\n```");
    expect(html).toContain("<pre class=\"code-block\"><code>&lt;Entity name=&quot;Claim&quot;/&gt;</code></pre>");
  });

  it("never passes raw HTML through, and renders links as plain text", () => {
    const html = render("<img src=x onerror=alert(1)> see [docs](https://evil.example)");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("href");
    expect(html).toContain("see docs");
  });
});
