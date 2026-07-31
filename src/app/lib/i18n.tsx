import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "vi" | "en";

// ─── Translations ─────────────────────────────────────────────────────────────

const vi = {
  // Nav
  league: "GIẢI ĐẤU TRÍ TUỆ",
  day_streak: "ngày liên tiếp",

  // Dashboard
  cognitive_index: "Chỉ Số Nhận Thức",
  balanced_avg: "trung bình 5 trục",
  save_failed: "Lưu điểm thất bại. Vui lòng thử lại.",
  apprentice: "NGƯỜI MỚI",
  mastermind: "BẬC THẦY",
  brain_age: "Ước Tính Tuổi Não",
yrs_younger: (n: number) => `Trẻ hơn ${n} tuổi`,
yrs_older: (n: number) => `Già hơn ${n} tuổi`,
brain_age_needs_age:
  "Tuổi não được tính bằng cách so tuổi thật của bạn với thứ hạng trong cộng đồng. Hãy nhập năm sinh để bắt đầu.",
birth_year_placeholder: "Năm sinh",
birth_year_invalid: "Năm sinh không hợp lệ.",
save_btn: "LƯU",
brain_age_calibrating: (played: number, needed: number) =>
  `Đang hiệu chuẩn: ${played}/${needed} ván. Cần đủ dữ liệu trước khi đưa ra con số có ý nghĩa.`,
brain_age_percentile: (pct: number, realAge: number) =>
  `Vượt ${pct}% người chơi · tuổi thật ${realAge}`,
brain_age_provisional: "Tạm tính: chưa đủ người chơi để lập phân phối thật.",
round_axis_detail: (round: number, gain: number) =>
  gain > 0 ? `Ván này: ${round} · +${gain}` : `Ván này: ${round} · chưa vượt kỷ lục`,
  cog_matrix: "Ma Trận Hiệu Suất Nhận Thức",
  cog_matrix_sub: "Đánh giá 5 lĩnh vực thần kinh · Phiên #47",
  live: "TRỰC TIẾP",
  synapse_streak: "Chuỗi Ngày Luyện Não",
  best_streak: "Chuỗi Tốt Nhất",
  this_month: "Tháng Này",
  xp_today: "XP Hôm Nay",
level_label: "CẤP ĐỘ",
xp_earned: "XP THU ĐƯỢC",
level_up: "LÊN CẤP!",
days: "ngày",
  sessions: "phiên",
  pts: "điểm",

  // Arena
  arena: "Đấu Trường Neurobics",
  back_to_arena: "QUAY LẠI",
  focus_training: "LUYỆN TẬP TẬP TRUNG",
  logic_training: "LUYỆN TẬP TƯ DUY",
  schulte_desc: "Click 1 → 25 theo thứ tự càng nhanh càng tốt. Cải thiện tầm nhìn ngoại vi và sự tập trung.",
  sudoku_desc: "Giải ô 9×9. 3 mạng, câu đố ngẫu nhiên mỗi ván. Rèn luyện tư duy suy diễn.",
  play_now: "CHƠI NGAY",

  // Schulte game
  size_label: "KÍCH CỠ",
  mode_label: "CHẾ ĐỘ",
  fixation: "NHÌN TÂM",
  classic: "Cổ Điển",
  reverse: "Ngược",
  dual: "Kép",
  hint_classic: (n: number) => `1 → ${n}`,
  hint_reverse: (n: number) => `${n} → 1`,
  hint_dual: "2 màu",
  time_label: "THỜI GIAN",
  find_label: "TÌM",
  start_with_label: "BẮT ĐẦU",
  complete: "HOÀN THÀNH",
  best_label: "Tốt nhất",
  idle_classic: (n: number) => `Click số 1 để bắt đầu · đếm lên đến ${n}`,
  idle_reverse: (n: number) => `Click số ${n} để bắt đầu · đếm ngược`,
  idle_dual: "Click 1 (tím) để bắt đầu · luân phiên màu sắc",
  saving: "Đang lưu điểm…",
  new_game: "VÁN MỚI",

  // Memory Matrix
  mem_tag: "LUYỆN TRÍ NHỚ",
  mem_desc:
    "Ghi nhớ vị trí các ô sáng trên lưới. Độ khó tăng dần theo từng cấp độ.",
  mem_intro_1: "Ghi nhớ vị trí các ô phát sáng.",
  mem_intro_2: "Khi chúng tắt, hãy chọn lại chính xác.",

  // Reaction Time
  rx_tag: "LUYỆN TỐC ĐỘ",
  rx_desc:
    "Chờ tín hiệu chuyển xanh rồi phản ứng nhanh nhất có thể. Bấm sớm sẽ bị phạt.",
  rx_wait: "Chờ tín hiệu chuyển xanh...",
  rx_now: "BẤM NGAY!",
  rx_too_soon_msg: "BẤM QUÁ SỚM!",
  rx_intro_1: "Chờ màn hình chuyển sang màu xanh,",
  rx_intro_2: "sau đó bấm nhanh nhất có thể.",
  rx_dont_press: "Không bấm trước khi màn hình chuyển xanh",
  rx_saving: "Đang lưu kết quả...",
  rx_false_start_note: "Mỗi lần bấm sớm đều trừ điểm Tập trung của ván này.",

  // Sudoku
  sudoku_generating: "Đang tạo đề…",

  // Sudoku game
  new_puzzle: "CÂU ĐỐ MỚI",
  solved: "Đã giải!",
  clues: "gợi ý",
  Easy: "Dễ",
  Medium: "Trung Bình",
  Hard: "Khó",
  Expert: "Chuyên Gia",
  Master: "Bậc Thầy",
  Extreme: "Cực Khó",

  // Round result overlay
  round_complete: "HOÀN THÀNH VÁN",
  domains_this_round: "CÁC LĨNH VỰC NHẬN THỨC VÁN NÀY",
  score_note:
  "Mỗi trục có công thức riêng và chỉ tăng khi bạn vượt kỷ lục của chính trục đó. Nghỉ quá 7 ngày, rating sẽ giảm dần.",
  round_score_label: "ĐIỂM VÁN NÀY",
  current_rating_label: "RATING HIỆN TẠI",
  continue_btn: "TIẾP TỤC",

  // Profile
  operator_stats: "Thông Số Người Dùng",
  clearance: "Cấp Độ",
  operator_label: "NGƯỜI DÙNG",
  omega_label: "CẤP ĐỘ OMEGA-1",
  sign_out: "ĐĂNG XUẤT",

  // Access denied
  auth_level_msg: "CẤP PHÉP: KHÔNG ĐỦ",
  required_label: "YÊU CẦU",
  status_label: "TRẠNG THÁI",
  unauthorized_label: "TRÁI PHÉP",
  dismiss: "ĐÓNG",

  // Auth screen
  sign_in: "Đăng Nhập",
  sign_up: "Đăng Ký",
  username_label: "Tên người dùng",
  password_label: "Mật khẩu",
  have_account: "Đã có tài khoản?",
  no_account: "Chưa có tài khoản?",
  auth_tagline: "Rèn luyện trí não · Theo dõi tiến bộ · Vươn lên đỉnh cao",

  // Dock tooltips
  dock_history: "Lịch Sử",
  dock_dashboard: "Bảng Điều Khiển",
  dock_arena: "Đấu Trường",
  dock_profile: "Hồ Sơ",
  dock_admin: "Bảng Quản Trị",

  // Stroop Test
  stroop_tag: "LUYỆN TẬP ỨC CHẾ",
  stroop_desc: "Nhận diện màu MỰC, không phải nghĩa từ · 20 kích thích · Rèn luyện kiểm soát ức chế nhận thức.",
  stroop_instruction: "Click MÀU MỰC",
  stroop_hint: "Bỏ qua nghĩa từ — click MÀU của chữ",
  stroop_trial: "Lần",
  stroop_inhibition: "Ức Chế",
  stroop_correct: "ĐÚNG",
  stroop_wrong: "SAI",
  stroop_complete: "HOÀN THÀNH",
  // Color names (Vietnamese)
  color_red: "ĐỎ",
  color_blue: "XANH",
  color_green: "LÁ",
  color_yellow: "VÀNG",
  color_purple: "TÍM",
  color_orange: "CAM",
};

const en: typeof vi = {
  league: "MASTERMIND LEAGUE",
  day_streak: "day streak",

  cognitive_index: "Cognitive Index Score",
  balanced_avg: "5-axis average",
  save_failed: "Failed to save score. Please try again.",
  apprentice: "APPRENTICE",
  mastermind: "MASTERMIND",
  brain_age: "Brain Age Estimate",
  yrs_younger: (n) => `${n} yrs younger`,
yrs_older: (n) => `${n} yrs older`,
brain_age_needs_age:
  "Brain age compares your real age against how you rank among other players. Enter your birth year to begin.",
birth_year_placeholder: "Birth year",
birth_year_invalid: "That birth year isn't valid.",
save_btn: "SAVE",
brain_age_calibrating: (played, needed) =>
  `Calibrating: ${played}/${needed} rounds. We need enough data before the number means anything.`,
brain_age_percentile: (pct, realAge) =>
  `Ahead of ${pct}% of players · real age ${realAge}`,
brain_age_provisional: "Provisional: not enough players yet for a real distribution.",
round_axis_detail: (round, gain) =>
  gain > 0 ? `This round: ${round} · +${gain}` : `This round: ${round} · no new record`,
  cog_matrix: "Cognitive Performance Matrix",
  cog_matrix_sub: "5-domain neural assessment · Session #47",
  live: "LIVE",
  synapse_streak: "Synapse Streak",
  best_streak: "Best Streak",
  this_month: "This Month",
  xp_today: "XP Today",
level_label: "LEVEL",
xp_earned: "XP EARNED",
level_up: "LEVEL UP!",
days: "days",
  sessions: "sessions",
  pts: "pts",

  arena: "Neurobics Arena",
  back_to_arena: "BACK TO ARENA",
  focus_training: "FOCUS TRAINING",
  logic_training: "LOGIC TRAINING",
  schulte_desc: "Click 1 → 25 in order as fast as you can. Sharpens peripheral vision & focus.",
  sudoku_desc: "Solve the 9×9 grid. 3 hearts, random puzzle every round. Trains deductive logic.",
  play_now: "PLAY NOW",

  size_label: "SIZE",
  mode_label: "MODE",
  fixation: "FIXATION",
  classic: "Classic",
  reverse: "Reverse",
  dual: "Dual",
  hint_classic: (n) => `1 → ${n}`,
  hint_reverse: (n) => `${n} → 1`,
  hint_dual: "2 colors",
  time_label: "TIME",
  find_label: "FIND",
  start_with_label: "START WITH",
  complete: "COMPLETE",
  best_label: "Best",
  idle_classic: (n) => `Click 1 to start · count to ${n}`,
  idle_reverse: (n) => `Click ${n} to start · count down`,
  idle_dual: "Click 1 (purple) to start · alternate colors",
  saving: "Saving scores…",
  new_game: "NEW GAME",

  // Memory Matrix
  mem_tag: "MEMORY TRAINING",
  mem_desc:
    "Memorise which tiles light up on the grid. Each level adds more of them.",
  mem_intro_1: "Memorise the tiles that light up.",
  mem_intro_2: "Once they fade, select them again exactly.",

  // Reaction Time
  rx_tag: "SPEED TRAINING",
  rx_desc:
    "Wait for the signal to turn green, then react as fast as you can. Early clicks are penalised.",
  rx_wait: "Wait for the green signal...",
  rx_now: "CLICK NOW!",
  rx_too_soon_msg: "TOO SOON!",
  rx_intro_1: "Wait for the screen to turn green,",
  rx_intro_2: "then click as fast as you can.",
  rx_dont_press: "Do not click before the screen turns green",
  rx_saving: "Saving result...",
  rx_false_start_note: "Every early click lowers the Focus score for this round.",

  // Sudoku
  sudoku_generating: "Generating puzzle…",

  new_puzzle: "NEW PUZZLE",
  solved: "Solved!",
  clues: "clues",
  Easy: "Easy",
  Medium: "Medium",
  Hard: "Hard",
  Expert: "Expert",
  Master: "Master",
  Extreme: "Extreme",

  round_complete: "ROUND COMPLETE",
  domains_this_round: "COGNITIVE DOMAINS THIS ROUND",
  score_note:
  "Each axis has its own formula and only rises when you beat that axis's own record. Rest more than 7 days and ratings decay.",
  round_score_label: "ROUND SCORE",
  current_rating_label: "CURRENT RATING",
  continue_btn: "CONTINUE",

  operator_stats: "Operator Stats",
  clearance: "Clearance",
  operator_label: "OPERATOR",
  omega_label: "OMEGA-1 CLEARANCE",
  sign_out: "SIGN OUT",

  auth_level_msg: "AUTHORIZATION LEVEL: INSUFFICIENT",
  required_label: "REQUIRED",
  status_label: "STATUS",
  unauthorized_label: "UNAUTHORIZED",
  dismiss: "DISMISS",

  sign_in: "Sign In",
  sign_up: "Sign Up",
  username_label: "Username",
  password_label: "Password",
  have_account: "Already have an account?",
  no_account: "Don't have an account?",
  auth_tagline: "Train your brain · Track your progress · Rise to the top",

  dock_history: "History",
  dock_dashboard: "Neural Dashboard",
  dock_arena: "Neurobics Arena",
  dock_profile: "Master Control",
  dock_admin: "Admin Panel",

  // Stroop Test
  stroop_tag: "INHIBITION TRAINING",
  stroop_desc: "Identify the INK color, not the word meaning · 20 stimuli · Trains inhibitory control & cognitive flexibility.",
  stroop_instruction: "Click the INK COLOR",
  stroop_hint: "Ignore the word — click the COLOR of the text",
  stroop_trial: "Trial",
  stroop_inhibition: "Inhibition",
  stroop_correct: "CORRECT",
  stroop_wrong: "WRONG",
  stroop_complete: "COMPLETE",
  // Color names (English)
  color_red: "RED",
  color_blue: "BLUE",
  color_green: "GREEN",
  color_yellow: "YELLOW",
  color_purple: "PURPLE",
  color_orange: "ORANGE",
};

export const translations = { vi, en };

// ─── Context ──────────────────────────────────────────────────────────────────

type LangCtx = {
  lang: Lang;
  toggle: () => void;
  t: typeof vi;
};

const Ctx = createContext<LangCtx>({
  lang: "vi",
  toggle: () => {},
  t: vi,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try { return (localStorage.getItem("nb_lang") as Lang) ?? "vi"; } catch { return "vi"; }
  });

  const toggle = () =>
    setLang((l) => {
      const next: Lang = l === "vi" ? "en" : "vi";
      try { localStorage.setItem("nb_lang", next); } catch {}
      return next;
    });

  return <Ctx.Provider value={{ lang, toggle, t: translations[lang] }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
