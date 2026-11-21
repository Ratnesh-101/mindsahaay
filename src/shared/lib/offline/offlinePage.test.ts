import { describe, expect, it } from "vitest";
import { escapeHtml, renderOfflinePage } from "./offlinePage";
import { HELPLINES, HELPLINES_LAST_VERIFIED } from "../pwa/helplines";

const TEMPLATE = [
  "<ul>",
  "<!--HELPLINES-->",
  "<li>old</li>",
  "<!--/HELPLINES-->",
  "</ul>",
  "<small>Verified <!--VERIFIED-->2000-01-01<!--/VERIFIED--> and <!--VERIFIED-->2000-01-01<!--/VERIFIED--></small>",
].join("\n");

describe("G6-SEC-10: offline.html templating escapes every interpolated value", () => {
  it("escapes the HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("renders the real helplines unchanged for the legitimate values", () => {
    const out = renderOfflinePage(TEMPLATE, HELPLINES, HELPLINES_LAST_VERIFIED);
    for (const h of HELPLINES) {
      expect(out).toContain(`href="${h.tel}"`);
      expect(out).toContain(h.number);
      expect(out).toContain(h.name);
    }
    expect(out).not.toContain("<li>old</li>");
    expect(out.match(new RegExp(HELPLINES_LAST_VERIFIED, "g"))).toHaveLength(2);
  });

  it("escapes name, tel, number and the verified date, so markup in them cannot become markup", () => {
    const evil = [{ id: "x", name: `<img src=x onerror=alert(1)>`, number: `1"><script>alert(2)</script>`, tel: `tel:1"><b>` }];
    const out = renderOfflinePage(TEMPLATE, evil, `</small><script>alert(3)</script>`);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<b>");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).toContain("&lt;script&gt;alert(3)&lt;/script&gt;");
  });

  it("refuses a href that is not a tel: link", () => {
    const out = renderOfflinePage(TEMPLATE, [{ id: "x", name: "N", number: "1", tel: "javascript:alert(1)" }], "2026-01-01");
    expect(out).not.toContain("javascript:");
  });

  it("does not treat $ sequences in values as replacement patterns", () => {
    const out = renderOfflinePage(TEMPLATE, [{ id: "x", name: "A$&B$`C", number: "1", tel: "tel:1" }], "$&$1");
    expect(out).toContain("A$&amp;B$`C");
    expect(out).toContain("$&amp;$1");
    expect(out).not.toContain("<li>old</li>");
  });
});
