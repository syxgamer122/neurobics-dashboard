/** Single source: axis key → profile column */
export const AXIS_COLUMNS = {
  logic: "algebraic_logic_score",
  memory: "memory_score",
  speed: "speed_score",
  focus: "focus_score",
  spatial: "cfop_spatial_record",
} as const;

export type AxisKey = keyof typeof AXIS_COLUMNS;
