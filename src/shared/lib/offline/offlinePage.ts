/**
 * Build-time templating for public/offline.html. Imported by vite.config.ts (so it must stay free of
 * browser and app imports) and unit tested. Every interpolated value is HTML-escaped, even though
 * today's values are static constants: defence in depth in case the helpline data ever comes from
 * somewhere less trusted.
 */

export interface OfflineHelpline {
  id: string;
  name: string;
  number: string;
  tel: string;
}

const OFFLINE_EMERGENCY_HI = "\u0906\u092A\u093E\u0924\u0915\u093E\u0932\u0940\u0928 \u0938\u0947\u0935\u093E";

export function escapeHtml(value: string): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Only plain tel: links are allowed in the href; anything else becomes an inert "#". */
function safeTel(tel: string): string {
  return /^tel:[0-9+]{2,20}$/.test(tel) ? tel : "#";
}

/** Returns the offline page with the helpline list and the "last verified" date filled in. */
export function renderOfflinePage(source: string, helplines: readonly OfflineHelpline[], lastVerified: string): string {
  const items = helplines
    .map((h) => {
      const name = escapeHtml(h.name);
      // The emergency label is bilingual; the two scheme names are proper nouns and stay the same.
      const label =
        h.id === "emergency"
          ? `<span><span data-l="en">${name}</span><span data-l="hi" lang="hi">${OFFLINE_EMERGENCY_HI}</span></span>`
          : `<span>${name}</span>`;
      return `        <li><a class="call" href="${escapeHtml(safeTel(h.tel))}">${label}<span>${escapeHtml(h.number)}</span></a></li>`;
    })
    .join("\n");
  const verified = escapeHtml(lastVerified);
  // Function replacers: a "$&" or "$1" inside a value must stay literal text.
  return source
    .replace(/<!--HELPLINES-->[\s\S]*?<!--\/HELPLINES-->/, () => `<!--HELPLINES-->\n${items}\n        <!--/HELPLINES-->`)
    .replace(/<!--VERIFIED-->[\s\S]*?<!--\/VERIFIED-->/g, () => `<!--VERIFIED-->${verified}<!--/VERIFIED-->`);
}
