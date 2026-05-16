export function automationEmail(
  subject: string,
  body: string,
): { subject: string; html: string } {
  // Convert plain text body to simple HTML paragraphs
  const htmlBody = body
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;color:#111;background:#fff;padding:0;margin:0}
.wrap{max-width:560px;margin:32px auto;padding:0 16px}
.label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.title{font-size:20px;font-weight:700;margin:0 0 20px}
p{font-size:14px;color:#374151;line-height:1.6;margin:0 0 12px}
a{color:#2563eb}
.footer{margin-top:32px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px}
</style></head>
<body><div class="wrap">
<div class="label">GroundGame Automation</div>
<div class="title">${subject}</div>
${htmlBody}
<div class="footer">This message was sent by a GroundGame automation rule.</div>
</div></body></html>`;

  return { subject, html };
}
