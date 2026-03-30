import type { Reminder } from "@/lib/types/reminder";

const TYPE_LABELS: Record<string, string> = {
  callback: "Callback",
  return_visit: "Return Visit",
  opportunity_follow_up: "Opportunity Follow-up",
  opportunity_stale: "Stale Opportunity",
  custom: "Reminder",
};

function base(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;color:#111;background:#fff;padding:0;margin:0}
.wrap{max-width:560px;margin:32px auto;padding:0 16px}
.label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
.title{font-size:20px;font-weight:700;margin:0 0 16px}
.field{margin-bottom:12px}
.field-label{font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em}
.field-value{font-size:14px;color:#374151;margin-top:2px}
.btn{display:inline-block;margin-top:20px;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600}
.footer{margin-top:32px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px}
</style></head>
<body><div class="wrap">
<div class="label">GroundGame Reminder</div>
<div class="title">${title}</div>
${body}
<div class="footer">You received this because a reminder was assigned to you in GroundGame.</div>
</div></body></html>`;
}

export function reminderEmail(
  reminder: Reminder,
  assigneeName: string,
  recordName: string | null,
  recordUrl: string | null
): { subject: string; html: string } {
  const typeLabel = TYPE_LABELS[reminder.type] ?? "Reminder";
  const dueStr = new Date(reminder.due_at).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    year: "numeric", hour: "numeric", minute: "2-digit",
  });

  const body = `
    <div class="field"><div class="field-label">Hi</div><div class="field-value">${assigneeName}</div></div>
    <div class="field"><div class="field-label">Type</div><div class="field-value">${typeLabel}</div></div>
    <div class="field"><div class="field-label">Due</div><div class="field-value">${dueStr}</div></div>
    ${reminder.notes ? `<div class="field"><div class="field-label">Notes</div><div class="field-value">${reminder.notes}</div></div>` : ""}
    ${recordName ? `<div class="field"><div class="field-label">Linked To</div><div class="field-value">${recordName}</div></div>` : ""}
    ${recordUrl ? `<a class="btn" href="${recordUrl}">View Record →</a>` : ""}
  `;

  return {
    subject: `[GroundGame] ${typeLabel}: ${reminder.title}`,
    html: base(reminder.title, body),
  };
}

export function staleOpportunityEmail(
  oppTitle: string,
  oppId: string,
  daysSince: number,
  assigneeName: string,
  appUrl: string
): { subject: string; html: string } {
  const url = `${appUrl}/crm/opportunities/${oppId}`;
  const body = `
    <div class="field"><div class="field-label">Hi</div><div class="field-value">${assigneeName}</div></div>
    <div class="field"><div class="field-label">Opportunity</div><div class="field-value">${oppTitle}</div></div>
    <div class="field"><div class="field-label">Last Updated</div><div class="field-value">${daysSince} day${daysSince !== 1 ? "s" : ""} ago</div></div>
    <p style="font-size:14px;color:#374151;margin:16px 0">This opportunity hasn't been updated recently. Make sure it's moving forward!</p>
    <a class="btn" href="${url}">View Opportunity →</a>
  `;
  return {
    subject: `[GroundGame] Opportunity stale: ${oppTitle}`,
    html: base(`Stale: ${oppTitle}`, body),
  };
}
