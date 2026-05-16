import { addDays, todayStr } from "@/lib/date-utils";

export type FieldMapConfig =
  | { mode: "static";    value: any }
  | { mode: "none" }
  | { mode: "today";     offset_days?: number }
  | { mode: "creator" }
  | { mode: "assignees" }
  | { mode: "field";     field: string; offset_days?: number; prefix?: string };

export interface NormalizedPayload {
  tenant_id:    string;
  item?:        Record<string, any> | null;
  opportunity?: Record<string, any> | null;
  person?:      Record<string, any> | null;
  old?:         Record<string, any> | null;
  vars?:        Record<string, string>;
}

export function resolveField(cfg: FieldMapConfig | null | undefined, payload: NormalizedPayload): any {
  if (!cfg) return null;
  if (cfg.mode === "static")    return cfg.value;
  if (cfg.mode === "none")      return null;
  if (cfg.mode === "today")     return addDays(todayStr(), cfg.offset_days ?? 0);
  if (cfg.mode === "creator")   return payload.item?.created_by ?? null;
  if (cfg.mode === "assignees") {
    return (payload.item?.sitrep_assignments ?? []).map((a: any) => a.user_id as string);
  }
  if (cfg.mode === "field") {
    const src = payload.item ?? payload.opportunity ?? payload.person ?? {};
    let raw = src[cfg.field] ?? null;
    if (typeof raw === "string" && raw && cfg.offset_days) {
      raw = addDays(raw.split("T")[0], cfg.offset_days);
    }
    if (cfg.prefix && typeof raw === "string") return `${cfg.prefix}${raw}`;
    return raw;
  }
  return null;
}

export function resolveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => vars[key] ?? "");
}
