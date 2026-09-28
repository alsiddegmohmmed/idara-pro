export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export interface BilingualContent {
  subject: string;
  arTitle: string;
  arBody: string;
  arButton: string;
  enTitle: string;
  enBody: string;
  enButton: string;
  url: string;
  arFooter: string;
  enFooter: string;
}

/** Arabic first (RTL), English underneath — no per-user language preference exists yet. */
export function renderBilingual(content: BilingualContent): { subject: string; html: string; text: string } {
  const url = escapeHtml(content.url);
  const button = (label: string): string =>
    `<p><a href="${url}" style="display:inline-block;padding:10px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></p>`;
  const html = `<!doctype html><html><body style="font-family:Tahoma,Arial,sans-serif;color:#111">
<div dir="rtl" style="text-align:right"><h2>${escapeHtml(content.arTitle)}</h2><p>${escapeHtml(content.arBody)}</p>${button(content.arButton)}<p style="color:#666;font-size:13px">${escapeHtml(content.arFooter)}</p></div>
<hr>
<div dir="ltr" style="text-align:left"><h2>${escapeHtml(content.enTitle)}</h2><p>${escapeHtml(content.enBody)}</p>${button(content.enButton)}<p style="color:#666;font-size:13px">${escapeHtml(content.enFooter)}</p></div>
</body></html>`;
  const text = `${content.arTitle}\n${content.arBody}\n${content.url}\n${content.arFooter}\n\n---\n\n${content.enTitle}\n${content.enBody}\n${content.url}\n${content.enFooter}\n`;
  return { subject: content.subject, html, text };
}
