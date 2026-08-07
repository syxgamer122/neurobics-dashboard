import type { AxisKey } from "../../lib/api";

export type GrantMode = "add" | "set";
export type GrantAxes = Record<AxisKey, string>;

export const EMPTY_GRANT: GrantAxes = {
  logic: "",
  memory: "",
  speed: "",
  focus: "",
  spatial: "",
};

export function parseGrantField(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
