export type ReminderType =
  | "callback"
  | "return_visit"
  | "opportunity_follow_up"
  | "opportunity_stale"
  | "custom";

export type ReminderStatus = "pending" | "sent" | "cancelled";

export type Reminder = {
  id: string;
  tenant_id: string;
  type: ReminderType;
  title: string;
  notes: string | null;
  due_at: string;
  status: ReminderStatus;
  sent_at: string | null;
  assigned_to_user_id: string | null;
  created_by_user_id: string | null;
  person_id: string | null;
  household_id: string | null;
  opportunity_id: string | null;
  stop_id: string | null;
  walklist_item_id: string | null;
  created_at: string;
  updated_at: string;
};
