import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { automationEmail } from "@/lib/email/automationEmail";
import { resolveUserEmail } from "../resolveUserEmail";
import { resolveTemplate } from "../fieldMap";
import type { NormalizedPayload } from "../triggerPayload";

export async function actionSendEmail(
  config: Record<string, any>,
  payload: NormalizedPayload,
  adminSb: SupabaseClient<any>,
): Promise<void> {
  const vars    = payload.vars ?? {};
  const subject = resolveTemplate(config.subject_template ?? "Automation notification", vars);
  const body    = resolveTemplate(config.body_template    ?? "", vars);
  const { subject: emailSubject, html } = automationEmail(subject, body);

  const recipients: { email: string; name: string }[] = [];

  if (config.recipient === "assignees") {
    const assignments: { user_id: string }[] = payload.item?.sitrep_assignments ?? [];
    // Opportunity assigned users
    if (assignments.length === 0 && payload.opportunity) {
      const { data: oppUsers } = await adminSb
        .from("opportunity_users")
        .select("user_id")
        .eq("opportunity_id", payload.opportunity.id);
      for (const u of (oppUsers ?? []) as any[]) {
        const user = await resolveUserEmail(u.user_id);
        if (user?.email) recipients.push(user);
      }
    } else {
      for (const a of assignments) {
        const user = await resolveUserEmail(a.user_id);
        if (user?.email) recipients.push(user);
      }
    }
  } else if (config.recipient === "creator") {
    const creatorId = payload.item?.created_by ?? payload.opportunity?.created_by ?? null;
    if (creatorId) {
      const user = await resolveUserEmail(creatorId);
      if (user?.email) recipients.push(user);
    }
  } else if (config.recipient === "specific_user" && config.user_id) {
    const user = await resolveUserEmail(config.user_id);
    if (user?.email) recipients.push(user);
  } else if (config.recipient === "all_org_members" && payload.tenant_id) {
    const { data: tenantUsers } = await adminSb
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", payload.tenant_id);
    for (const u of (tenantUsers ?? []) as any[]) {
      const user = await resolveUserEmail(u.user_id);
      if (user?.email) recipients.push(user);
    }
  }

  await Promise.all(
    recipients.map((r) => sendEmail(r.email, emailSubject, html).catch(() => {})),
  );
}
