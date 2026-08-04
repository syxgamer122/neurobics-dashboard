import type { AxisKey } from "./axes";

/**
 * Canonical client-side game catalog.
 *
 * Khi thêm game mới, khai báo metadata tại đây trước. Arena, history, overlay,
 * guest counters và API types đều lấy dữ liệu từ registry này — không tự viết
 * thêm một union/map 10 game ở từng file nữa.
 *
 * SQL constraints/migrations vẫn phải khai báo explicit: database là biên bảo
 * mật và không được phụ thuộc code client.
 */
export const GAME_REGISTRY = [
  {
    id: "schulte",
    title: "Schulte Table",
    accent: "#A855F7",
    icon: "focus",
    tagKey: "focus_training",
    descriptionKey: "schulte_desc",
    primaryAxis: "focus",
    secondaryAxis: "spatial",
    sessionColumn: "schulte_sessions",
    stageWidth: "lg",
  },
  {
    id: "sudoku",
    title: "Sudoku",
    accent: "#00D4FF",
    icon: "grid",
    tagKey: "logic_training",
    descriptionKey: "sudoku_desc",
    primaryAxis: "logic",
    secondaryAxis: "memory",
    sessionColumn: "sudoku_sessions",
    stageWidth: "md",
  },
  {
    id: "stroop",
    title: "Stroop Test",
    accent: "#EAB308",
    icon: "zap",
    tagKey: "stroop_tag",
    descriptionKey: "stroop_desc",
    primaryAxis: "focus",
    secondaryAxis: "speed",
    sessionColumn: "stroop_sessions",
    stageWidth: "sm",
  },
  {
    id: "reaction",
    title: "Reaction Time",
    accent: "#10B981",
    icon: "activity",
    tagKey: "rx_tag",
    descriptionKey: "rx_desc",
    primaryAxis: "speed",
    secondaryAxis: "focus",
    sessionColumn: "reaction_sessions",
    stageWidth: "sm",
  },
  {
    id: "memory",
    title: "Memory Matrix",
    accent: "#F43F5E",
    icon: "brain",
    tagKey: "mem_tag",
    descriptionKey: "mem_desc",
    primaryAxis: "memory",
    secondaryAxis: "spatial",
    sessionColumn: "memory_sessions",
    stageWidth: "sm",
  },
  {
    id: "nback",
    title: "N-Back",
    accent: "#A855F7",
    icon: "sparkles",
    tagKey: "nback_tag",
    descriptionKey: "nback_desc",
    primaryAxis: "memory",
    secondaryAxis: "focus",
    sessionColumn: "nback_sessions",
    stageWidth: "sm",
  },
  {
    id: "math",
    title: "Math Sprint",
    accent: "#38BDF8",
    icon: "calculator",
    tagKey: "math_tag",
    descriptionKey: "math_desc",
    primaryAxis: "logic",
    secondaryAxis: "speed",
    sessionColumn: "math_sessions",
    stageWidth: "sm",
  },
  {
    id: "gonogo",
    title: "Go / No-Go",
    accent: "#F97316",
    icon: "shield",
    tagKey: "gonogo_tag",
    descriptionKey: "gonogo_desc",
    primaryAxis: "focus",
    secondaryAxis: "speed",
    sessionColumn: "gonogo_sessions",
    stageWidth: "sm",
  },
  {
    id: "mental",
    title: "Mental Rotation",
    accent: "#22D3EE",
    icon: "rotate",
    tagKey: "mr_tag",
    descriptionKey: "mr_desc",
    primaryAxis: "spatial",
    secondaryAxis: "speed",
    sessionColumn: "mental_sessions",
    stageWidth: "md",
  },
  {
    id: "corsi",
    title: "Corsi Block",
    accent: "#14B8A6",
    icon: "blocks",
    tagKey: "corsi_tag",
    descriptionKey: "corsi_desc",
    primaryAxis: "memory",
    secondaryAxis: "spatial",
    sessionColumn: "corsi_sessions",
    stageWidth: "sm",
  },
  {
    id: "trail",
    title: "Trail Making",
    accent: "#84CC16",
    icon: "route",
    tagKey: "trail_tag",
    descriptionKey: "trail_desc",
    primaryAxis: "speed",
    secondaryAxis: "focus",
    sessionColumn: "trail_sessions",
    stageWidth: "md",
  },
] as const satisfies readonly {
  id: string;
  title: string;
  accent: `#${string}`;
  icon: string;
  tagKey: string;
  descriptionKey: string;
  primaryAxis: AxisKey;
  secondaryAxis: AxisKey;
  sessionColumn: `${string}_sessions`;
  stageWidth: "sm" | "md" | "lg";
}[];

export type GameDefinition = (typeof GAME_REGISTRY)[number];
export type GameId = GameDefinition["id"];
export type GameIconKey = GameDefinition["icon"];
export type SessionColumn = GameDefinition["sessionColumn"];
export type GameStageWidth = GameDefinition["stageWidth"];

export const GAME_IDS = GAME_REGISTRY.map((game) => game.id) as GameId[];
export const SESSION_COLUMNS = GAME_REGISTRY.map(
  (game) => game.sessionColumn,
) as SessionColumn[];

export const GAME_BY_ID = Object.fromEntries(
  GAME_REGISTRY.map((game) => [game.id, game]),
) as Record<GameId, GameDefinition>;

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && value in GAME_BY_ID;
}

export function gameStageClass(game: GameId): string {
  const width = GAME_BY_ID[game].stageWidth;
  if (width === "lg") return "w-full max-w-lg";
  if (width === "md") return "w-full max-w-md";
  return "w-full max-w-sm";
}
