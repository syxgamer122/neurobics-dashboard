/**
 * Catalog badge — chỉ lo HIỂN THỊ (tên, mô tả, hạng, nhóm, icon).
 *
 * Điều kiện mở khoá và XP thưởng là của Postgres (sync_achievements /
 * achievement_xp / get_achievement_progress). Trình duyệt không bao giờ
 * tự khai báo đã đạt — XP ở đây chỉ để hiển thị cho đúng với server.
 *
 * Migration tương ứng: supabase/migrations/20260825_achievement_depth.sql
 */

import { GAME_IDS } from "./game-registry";

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type BadgeCategory =
  "volume" | "level" | "mastery" | "breadth" | "score" | "game";

export type Badge = {
  code: string;
  icon: string;
  xp: number;
  tier: BadgeTier;
  category: BadgeCategory;
  vi: [string, string];
  en: [string, string];
};

/** Màu theo hạng — badge càng hiếm càng nổi. */
export const TIER_COLOR: Record<BadgeTier, string> = {
  bronze: "#B45309",
  silver: "#94A3B8",
  gold: "#F59E0B",
  platinum: "#22D3EE",
  diamond: "#A855F7",
};

export const TIER_ORDER: BadgeTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
];

export const TIER_LABEL: Record<BadgeTier, { vi: string; en: string }> = {
  bronze: { vi: "Đồng", en: "Bronze" },
  silver: { vi: "Bạc", en: "Silver" },
  gold: { vi: "Vàng", en: "Gold" },
  platinum: { vi: "Bạch kim", en: "Platinum" },
  diamond: { vi: "Kim cương", en: "Diamond" },
};

export const CATEGORY_ORDER: BadgeCategory[] = [
  "volume",

  "level",
  "mastery",
  "breadth",
  "score",
  "game",
];

export const CATEGORY_LABEL: Record<BadgeCategory, { vi: string; en: string }> =
  {
    volume: { vi: "Số ván", en: "Volume" },

    level: { vi: "Cấp độ", en: "Level" },
    mastery: { vi: "Chỉ số", en: "Mastery" },
    breadth: { vi: "Toàn diện", en: "Breadth" },
    score: { vi: "Điểm cao", en: "High score" },
    game: { vi: "Từng trò", en: "Per game" },
  };

export const BADGES: Badge[] = [
  // ─── Số ván ─────────────────────────────────────────────────────
  {
    code: "first_round",
    icon: "🌱",
    xp: 20,
    tier: "bronze",
    category: "volume",
    vi: ["Khởi động", "Hoàn thành ván đầu tiên"],
    en: ["First Spark", "Finish your first round"],
  },
  {
    code: "rounds_10",
    icon: "⚡",
    xp: 30,
    tier: "bronze",
    category: "volume",
    vi: ["Thành thói quen", "Chơi 10 ván"],
    en: ["Warmed Up", "Play 10 rounds"],
  },
  {
    code: "rounds_50",
    icon: "🔥",
    xp: 60,
    tier: "silver",
    category: "volume",
    vi: ["Bền bỉ", "Chơi 50 ván"],
    en: ["Relentless", "Play 50 rounds"],
  },
  {
    code: "rounds_100",
    icon: "💎",
    xp: 100,
    tier: "silver",
    category: "volume",
    vi: ["Trung thành", "Chơi 100 ván"],
    en: ["Centurion", "Play 100 rounds"],
  },
  {
    code: "rounds_250",
    icon: "🏗️",
    xp: 160,
    tier: "gold",
    category: "volume",
    vi: ["Kẻ xây nền", "Chơi 250 ván"],
    en: ["Foundation", "Play 250 rounds"],
  },
  {
    code: "rounds_500",
    icon: "🏰",
    xp: 250,
    tier: "platinum",
    category: "volume",
    vi: ["Khổ luyện", "Chơi 500 ván"],
    en: ["Grindmaster", "Play 500 rounds"],
  },
  {
    code: "rounds_1000",
    icon: "🌌",
    xp: 400,
    tier: "diamond",
    category: "volume",
    vi: ["Nghìn trận", "Chơi 1000 ván"],
    en: ["Thousand Trials", "Play 1000 rounds"],
  },

  // ─── Cấp độ ─────────────────────────────────────────────────
  {
    code: "level_5",
    icon: "🎚️",
    xp: 40,
    tier: "bronze",
    category: "level",
    vi: ["Cấp 5", "Đạt cấp 5"],
    en: ["Level 5", "Reach level 5"],
  },
  {
    code: "level_10",
    icon: "🚀",
    xp: 70,
    tier: "silver",
    category: "level",
    vi: ["Cấp 10", "Đạt cấp 10"],
    en: ["Level 10", "Reach level 10"],
  },
  {
    code: "level_20",
    icon: "🌟",
    xp: 120,
    tier: "gold",
    category: "level",
    vi: ["Cấp 20", "Đạt cấp 20"],
    en: ["Level 20", "Reach level 20"],
  },
  {
    code: "level_30",
    icon: "☄️",
    xp: 200,
    tier: "platinum",
    category: "level",
    vi: ["Cấp 30", "Đạt cấp 30"],
    en: ["Level 30", "Reach level 30"],
  },
  {
    code: "level_50",
    icon: "🌠",
    xp: 350,
    tier: "diamond",
    category: "level",
    vi: ["Cấp 50", "Đạt cấp 50"],
    en: ["Level 50", "Reach level 50"],
  },
  {
    code: "xp_10000",
    icon: "🔋",
    xp: 220,
    tier: "platinum",
    category: "level",
    vi: ["Mười nghìn", "Tích luỹ 10.000 XP"],
    en: ["Ten Thousand", "Bank 10,000 total XP"],
  },

  // ─── Chỉ số nhận thức ──────────────────────────────────────────
  {
    code: "axis_500",
    icon: "📈",
    xp: 50,
    tier: "silver",
    category: "mastery",
    vi: ["Vượt ngưỡng", "Một trục đạt 500"],
    en: ["Breakthrough", "Any axis hits 500"],
  },
  {
    code: "axis_800",
    icon: "🧠",
    xp: 120,
    tier: "gold",
    category: "mastery",
    vi: ["Tinh thông", "Một trục đạt 800"],
    en: ["Mastery", "Any axis hits 800"],
  },
  {
    code: "axis_900",
    icon: "🔬",
    xp: 200,
    tier: "platinum",
    category: "mastery",
    vi: ["Xuất sắc", "Một trục đạt 900"],
    en: ["Exceptional", "Any axis hits 900"],
  },
  {
    code: "axis_950",
    icon: "💊",
    xp: 320,
    tier: "diamond",
    category: "mastery",
    vi: ["Đỉnh cao", "Một trục đạt 950"],
    en: ["Apex", "Any axis hits 950"],
  },
  {
    code: "all_axes_500",
    icon: "⚖️",
    xp: 150,
    tier: "gold",
    category: "mastery",
    vi: ["Cân bằng", "Cả 5 trục đều ≥ 500"],
    en: ["Balanced", "All 5 axes ≥ 500"],
  },
  {
    code: "all_axes_700",
    icon: "🔱",
    xp: 260,
    tier: "platinum",
    category: "mastery",
    vi: ["Toàn diện", "Cả 5 trục đều ≥ 700"],
    en: ["Well-Rounded", "All 5 axes ≥ 700"],
  },
  {
    code: "all_axes_850",
    icon: "👑",
    xp: 420,
    tier: "diamond",
    category: "mastery",
    vi: ["Toàn bích", "Cả 5 trục đều ≥ 850"],
    en: ["Flawless Mind", "All 5 axes ≥ 850"],
  },

  // ─── Toàn diện theo trò ────────────────────────────────────────
  {
    code: "all_games",
    icon: "🎮",
    xp: 80,
    tier: "silver",
    category: "breadth",
    vi: ["Toàn năng", `Chơi đủ ${GAME_IDS.length} trò`],
    en: ["All-Rounder", `Play all ${GAME_IDS.length} games`],
  },
  {
    code: "all_games_10",
    icon: "🧰",
    xp: 180,
    tier: "gold",
    category: "breadth",
    vi: ["Không bỏ trò nào", "Mỗi trò ≥ 10 ván"],
    en: ["No Weak Link", "10+ rounds in every game"],
  },
  {
    code: "all_games_600",
    icon: "🎯",
    xp: 280,
    tier: "platinum",
    category: "breadth",
    vi: ["Giỏi đều", "Mỗi trò đều từng đạt 600+"],
    en: ["Broad Excellence", "600+ in every game"],
  },

  // ─── Điểm cao ───────────────────────────────────────────────
  {
    code: "score_900",
    icon: "🎯",
    xp: 90,
    tier: "gold",
    category: "score",
    vi: ["Gần tuyệt đối", "Một ván đạt 900+"],
    en: ["Near Perfect", "Score 900+ in a round"],
  },
  {
    code: "score_950",
    icon: "🎖️",
    xp: 150,
    tier: "platinum",
    category: "score",
    vi: ["Siêu phẩm", "Một ván đạt 950+"],
    en: ["Masterstroke", "Score 950+ in a round"],
  },
  {
    code: "score_990",
    icon: "💫",
    xp: 300,
    tier: "diamond",
    category: "score",
    vi: ["Hoàn hảo", "Một ván đạt 990+"],
    en: ["Perfection", "Score 990+ in a round"],
  },
  {
    code: "perfect_10",
    icon: "🔟",
    xp: 220,
    tier: "platinum",
    category: "score",
    vi: ["Ổn định đỉnh cao", "10 ván đạt 950+"],
    en: ["Consistently Elite", "10 rounds at 950+"],
  },

  // ─── Từng trò ───────────────────────────────────────────────
  {
    code: "schulte_700",
    icon: "🔍",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Schulte thành thạo", "Đạt 700+ ở Schulte"],
    en: ["Schulte Adept", "Score 700+ at Schulte"],
  },
  {
    code: "schulte_900",
    icon: "👁️",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Mắt đại bàng", "Đạt 900+ ở Schulte"],
    en: ["Eagle Eye", "Score 900+ at Schulte"],
  },
  {
    code: "schulte_6x6",
    icon: "🔳",
    xp: 120,
    tier: "gold",
    category: "game",
    vi: ["Lưới 6×6", "Thắng một ván Schulte 6×6"],
    en: ["Six by Six", "Win a 6×6 Schulte round"],
  },
  {
    code: "sudoku_700",
    icon: "🔢",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Sudoku thành thạo", "Đạt 700+ ở Sudoku"],
    en: ["Sudoku Adept", "Score 700+ at Sudoku"],
  },
  {
    code: "sudoku_900",
    icon: "🧩",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Sudoku cao thủ", "Đạt 900+ ở Sudoku"],
    en: ["Sudoku Master", "Score 900+ at Sudoku"],
  },
  {
    code: "sudoku_extreme",
    icon: "🔥",
    xp: 120,
    tier: "gold",
    category: "game",
    vi: ["Khắc tinh Sudoku", "Hoàn thành mức Extreme"],
    en: ["Sudoku Slayer", "Finish an Extreme board"],
  },
  {
    code: "stroop_700",
    icon: "🎨",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Stroop thành thạo", "Đạt 700+ ở Stroop"],
    en: ["Stroop Adept", "Score 700+ at Stroop"],
  },
  {
    code: "stroop_900",
    icon: "🌈",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Miễn nhiễm nhiễu", "Đạt 900+ ở Stroop"],
    en: ["Interference Proof", "Score 900+ at Stroop"],
  },
  {
    code: "reaction_700",
    icon: "⚡",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Phản xạ nhanh", "Đạt 700+ ở Reaction"],
    en: ["Quick Draw", "Score 700+ at Reaction"],
  },
  {
    code: "reaction_900",
    icon: "💥",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Nhanh như điện", "Đạt 900+ ở Reaction"],
    en: ["Lightning", "Score 900+ at Reaction"],
  },
  {
    code: "memory_700",
    icon: "🧱",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Trí nhớ tốt", "Đạt 700+ ở Memory Matrix"],
    en: ["Sharp Recall", "Score 700+ at Memory Matrix"],
  },
  {
    code: "memory_900",
    icon: "🗿",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Khắc đá", "Đạt 900+ ở Memory Matrix"],
    en: ["Etched in Stone", "Score 900+ at Memory Matrix"],
  },
  {
    code: "nback_ace",
    icon: "🔮",
    xp: 90,
    tier: "silver",
    category: "game",
    vi: ["Cao thủ N-Back", "Đạt 700+ ở N-Back"],
    en: ["N-Back Ace", "Score 700+ at N-Back"],
  },
  {
    code: "nback_900",
    icon: "🌀",
    xp: 150,
    tier: "gold",
    category: "game",
    vi: ["Bộ nhớ làm việc", "Đạt 900+ ở N-Back"],
    en: ["Working Memory", "Score 900+ at N-Back"],
  },
  {
    code: "nback_deep",
    icon: "🧬",
    xp: 200,
    tier: "platinum",
    category: "game",
    vi: ["Chiều sâu 5-Back", "Hoàn thành mức 5-Back trở lên"],
    en: ["Deep 5-Back", "Finish a 5-Back level or deeper"],
  },
  {
    code: "math_700",
    icon: "➕",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Tính nhanh", "Đạt 700+ ở Math Sprint"],
    en: ["Quick Math", "Score 700+ at Math Sprint"],
  },
  {
    code: "math_900",
    icon: "🧮",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Máy tính sống", "Đạt 900+ ở Math Sprint"],
    en: ["Human Calculator", "Score 900+ at Math Sprint"],
  },
  {
    code: "gonogo_700",
    icon: "🚦",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Biết dừng", "Đạt 700+ ở Go / No-Go"],
    en: ["Know When to Stop", "Score 700+ at Go / No-Go"],
  },
  {
    code: "gonogo_900",
    icon: "🛑",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Ức chế hoàn hảo", "Đạt 900+ ở Go / No-Go"],
    en: ["Perfect Inhibition", "Score 900+ at Go / No-Go"],
  },
  {
    code: "mental_700",
    icon: "🔄",
    xp: 60,
    tier: "silver",
    category: "game",
    vi: ["Xoay được hình", "Đạt 700+ ở Mental Rotation"],
    en: ["Rotator", "Score 700+ at Mental Rotation"],
  },
  {
    code: "mental_900",
    icon: "🧊",
    xp: 130,
    tier: "gold",
    category: "game",
    vi: ["Hình dung không gian", "Đạt 900+ ở Mental Rotation"],
    en: ["Spatial Visionary", "Score 900+ at Mental Rotation"],
  },
];

/** Tổng XP nếu mở khoá toàn bộ — dùng cho dòng tóm tắt trên panel. */
export const TOTAL_BADGE_XP = BADGES.reduce((sum, b) => sum + b.xp, 0);
