export type Condition = {
  field: string;
  op: "eq" | "neq" | "in" | "not_in" | "is_empty" | "is_not_empty";
  value?: any;
};

export function evaluateConditions(conditions: Condition[], record: Record<string, any>): boolean {
  for (const cond of conditions) {
    const val = record?.[cond.field];
    switch (cond.op) {
      case "eq":         if (val !== cond.value) return false; break;
      case "neq":        if (val === cond.value) return false; break;
      case "in":         if (!Array.isArray(cond.value) || !cond.value.includes(val)) return false; break;
      case "not_in":     if (!Array.isArray(cond.value) || cond.value.includes(val)) return false; break;
      case "is_empty":   if (val !== null && val !== undefined && val !== "") return false; break;
      case "is_not_empty": if (val === null || val === undefined || val === "") return false; break;
    }
  }
  return true;
}
