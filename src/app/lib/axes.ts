/** Single source: axis key → profile column + display color. */
export const AXIS_COLUMNS = {
  logic: "algebraic_logic_score",
  memory: "memory_score",
  speed: "speed_score",
  focus: "focus_score",
  spatial: "cfop_spatial_record",
} as const;

export type AxisKey = keyof typeof AXIS_COLUMNS;

export const AXIS_META: Record<
  AxisKey,
  { color: string; column: (typeof AXIS_COLUMNS)[AxisKey] }
> = {
  speed: { color: "#10B981", column: AXIS_COLUMNS.speed },
  focus: { color: "#A855F7", column: AXIS_COLUMNS.focus },
  spatial: { color: "#F59E0B", column: AXIS_COLUMNS.spatial },
  logic: { color: "#00D4FF", column: AXIS_COLUMNS.logic },
  memory: { color: "#F43F5E", column: AXIS_COLUMNS.memory },
};
