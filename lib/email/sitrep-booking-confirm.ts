import { sendEmail } from "./resend";

export interface BookingConfirmData {
  attendeeName: string;
  attendeeEmail: string;
  hostName: string;
  title: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  timezone: string;
  confirmationMsg?: string;
  bookingUrl: string;
}

function fmtDatetime(iso: string, tz: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function durationLabel(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export async function sendBookingConfirmation(data: BookingConfirmData) {
  const start = fmtDatetime(data.startAt, data.timezone);
  const duration = durationLabel(data.startAt, data.endAt);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:40px auto;background:#161b22;border-radius:16px;overflow:hidden;border:1px solid #30363d">
    <div style="padding:32px 32px 0">
      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#58a6ff;text-transform:uppercase;margin-bottom:8px">Booking Confirmed</div>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#e6edf3">${data.title}</h1>
      <p style="margin:0;font-size:14px;color:#8b949e">with ${data.hostName}</p>
    </div>
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #21262d;vertical-align:top">
            <div style="font-size:11px;font-weight:700;color:#8b949e;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">When</div>
            <div style="font-size:14px;color:#e6edf3">${start}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #21262d">
            <div style="font-size:11px;font-weight:700;color:#8b949e;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Duration</div>
            <div style="font-size:14px;color:#e6edf3">${duration}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0">
            <div style="font-size:11px;font-weight:700;color:#8b949e;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px">Attendee</div>
            <div style="font-size:14px;color:#e6edf3">${data.attendeeName}</div>
            <div style="font-size:13px;color:#8b949e">${data.attendeeEmail}</div>
          </td>
        </tr>
      </table>
      ${data.confirmationMsg ? `<div style="margin-top:20px;padding:16px;background:#0d1117;border-radius:10px;border:1px solid #30363d;font-size:14px;color:#c9d1d9;line-height:1.6">${data.confirmationMsg}</div>` : ""}
    </div>
    <div style="padding:20px 32px;background:#0d1117;border-top:1px solid #21262d">
      <p style="margin:0;font-size:12px;color:#484f58;text-align:center">
        Powered by <a href="${data.bookingUrl}" style="color:#58a6ff;text-decoration:none">GroundGame</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  await sendEmail(data.attendeeEmail, `Booking confirmed: ${data.title}`, html);
}
