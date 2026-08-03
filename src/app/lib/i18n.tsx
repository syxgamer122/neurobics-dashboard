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
  yrs_same: "Bằng đúng tuổi thật",
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
  cog_matrix: "Ma Trận Hiệu Suất Nhận Thức",
  cog_matrix_sub: (sessions: number) =>
    `Đánh giá 5 lĩnh vực thần kinh · ${sessions} phiên`,
  live: "TRỰC TIẾP",
  synapse_streak: "Chuỗi Ngày Luyện Não",
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
  schulte_desc:
    "Click 1 → 25 theo thứ tự càng nhanh càng tốt. Cải thiện tầm nhìn ngoại vi và sự tập trung.",
  sudoku_desc:
    "Giải ô 9×9. 3 mạng, câu đố ngẫu nhiên mỗi ván. Rèn luyện tư duy suy diễn.",
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
  mem_start: "BẮT ĐẦU MATRIX",
  mem_max_level: "Cấp cao nhất",
  game_over: "KẾT THÚC",
  abort_restart: "HUỶ & CHƠI LẠI",
  streak_week_label: "Chuỗi hiện tại (tối đa 7 ô)",
  streak_tz_note: "Reset 00:00 GMT+7",
  heart_full: "Còn mạng",
  heart_empty: "Mất mạng",
  cell_label: "Ô",
  confirm_change_difficulty:
    "Đổi độ khó sẽ bỏ toàn bộ tiến độ ván này. Tiếp tục?",
  answer_correct: "Đúng",
  answer_wrong: "Sai",
  access_denied_title: "TRUY CẬP BỊ TỪ CHỐI",
  access_denied_role: "QUẢN TRỊ VIÊN",

  // Reaction Time
  rx_tag: "LUYỆN TỐC ĐỘ",
  rx_desc:
    "Chờ tín hiệu chuyển xanh rồi phản ứng nhanh nhất có thể · 10 lần đo. Bấm sớm sẽ bị phạt.",
  rx_wait: "Chờ tín hiệu chuyển xanh...",
  rx_now: "BẤM NGAY!",
  rx_too_soon_msg: "BẤM QUÁ SỚM!",
  rx_intro_1: "Chờ màn hình chuyển sang màu xanh,",
  rx_intro_2: "sau đó bấm nhanh nhất có thể.",
  rx_dont_press: "Không bấm trước khi màn hình chuyển xanh",
  rx_saving: "Đang lưu kết quả...",
  rx_false_start_note: "Mỗi lần bấm sớm đều trừ điểm Tập trung của ván này.",
  rx_start: "BẮT ĐẦU TEST",
  rx_restart: "CHƠI LẠI",
  rx_complete: "HOÀN THÀNH TEST",
  rx_avg_label: "Thời gian phản xạ trung bình",
  rx_trial: "LẦN",
  rx_average: "TRUNG BÌNH",
  rx_too_soon: "BẤM SỚM",

  // Sudoku
  sudoku_generating: "Đang tạo đề…",

  // Sudoku game
  new_puzzle: "CÂU ĐỐ MỚI",
  solved: "Đã giải!",
  clues: "gợi ý",
  // Round result overlay
  round_complete: "HOÀN THÀNH VÁN",
  domains_this_round: "CÁC LĨNH VỰC NHẬN THỨC VÁN NÀY",
  score_note:
    "Thanh và số lớn là điểm VÁN NÀY. Rating hồ sơ tăng khi chơi tốt và giảm khi chơi kém (EMA). Nghỉ >7 ngày còn bị decay thêm.",
  round_score_label: "ĐIỂM VÁN NÀY",
  round_score_hint: "Chỉ ván vừa chơi — không phải rating hồ sơ",
  profile_rating_short: "Hồ sơ",
  continue_btn: "TIẾP TỤC",

  // Profile
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
  guest_play: "CHƠI THỬ KHÔNG CẦN TÀI KHOẢN",
  guest_hint:
    "Chơi đầy đủ các game ngay. Điểm chỉ lưu trên máy này cho đến khi bạn đăng ký.",
  guest_username: "Khách",
  guest_banner:
    "Bạn đang chơi thử — tiến độ chỉ lưu tạm trên máy này. Đăng ký để lưu hồ sơ, nhiệm vụ và xếp hạng.",
  guest_register: "ĐĂNG KÝ ĐỂ LƯU",
  guest_locked: "Cần đăng nhập để dùng tính năng này.",
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

  nback_tag: "TRÍ NHỚ LÀM VIỆC",
  nback_desc:
    "Nhớ vị trí ô sáng N lượt trước rồi bấm khi nó lặp lại — bài tập trí nhớ làm việc kinh điển.",

  math_tag: "TÍNH NHẨM",
  math_desc:
    "Hai mươi bốn phép tính, bốn lựa chọn. Có chế độ Thích ứng tăng dần độ khó.",

  gonogo_tag: "ỨC CHẾ PHẢN XẠ",
  gonogo_desc:
    "Vòng xanh = bấm, vuông đỏ = không bấm. Luyện kiểm soát xung động và tập trung chọn lọc.",

  axis_memory: "Trí nhớ",
  axis_focus: "Tập trung",
  axis_logic: "Tư duy",
  axis_spatial: "Không gian",
  axis_speed: "Tốc độ",
  size_basic: "CƠ BẢN",
  size_normal: "THƯỜNG",
  size_advanced: "NÂNG CAO",
  total_xp_label: "Tổng",
  yrs_unit: "tuổi",
  password_min_length: "Mật khẩu phải có ít nhất 8 ký tự.",
  username_invalid: "Tên 3–20 ký tự: chữ, số, _ . - (không dấu cách).",
  signup_no_email_warning:
    "Không lưu email thật. Quên mật khẩu thì chỉ còn mã khôi phục hiện sau khi đăng ký — hãy chép ra chỗ an toàn.",
  forgot_password: "Quên mật khẩu?",
  back_to_sign_in: "Quay lại đăng nhập",
  recovery_code_label: "Mã khôi phục",
  recovery_code_required: "Nhập mã khôi phục.",
  recover_submit: "Đặt lại mật khẩu",
  recovery_success: "Đã đổi mật khẩu. Hãy đăng nhập.",
  retry_send: "Gửi lại",
  recovery_code_title: "Lưu mã khôi phục của bạn",
  recovery_code_body:
    "Đây là cách duy nhất để reset mật khẩu. Mã sẽ không hiện lại lần nữa.",
  copy_recovery_code: "Sao chép mã",
  copied: "Đã sao chép",

  // Profile settings (Giai đoạn 4)
  settings_profile_section: "Thông tin cá nhân",
  settings_password_section: "Đổi mật khẩu",
  settings_danger_section: "Vùng nguy hiểm",
  settings_avatar_change: "Đổi ảnh đại diện",
  settings_avatar_remove: "Xoá ảnh đại diện",
  settings_avatar_hint: "JPEG / PNG / WebP / GIF · tối đa 2 MB",
  settings_avatar_ok: "Đã cập nhật ảnh đại diện.",
  settings_avatar_removed: "Đã xoá ảnh đại diện.",
  settings_birth_current: "Năm sinh đã lưu",
  settings_birth_ok: "Đã lưu năm sinh.",
  settings_language: "Ngôn ngữ",
  settings_lang_vi: "Tiếng Việt",
  settings_lang_en: "English",
  // Onboarding + calibration
  onboarding_step: "BƯỚC {n}/3",
  onboarding_welcome_title: "Chào mừng {u}",
  onboarding_welcome_body:
    "Neurobics giúp bạn luyện trí nhớ, tập trung, tốc độ, logic và không gian qua các ván ngắn; kết quả được tổng hợp thành hồ sơ nhận thức cá nhân.",
  onboarding_disclaimer:
    "Các chỉ số dùng để theo dõi luyện tập và tiến bộ, không phải kết quả chẩn đoán y tế.",
  onboarding_calibration_title: "Hoàn thành 5 ván hiệu chuẩn",
  onboarding_calibration_body:
    "Năm ván đầu tạo đường cơ sở cho Cognitive Index và năm trục nhận thức. Điểm trước mốc này chỉ là tạm tính.",
  onboarding_calibration_hint:
    "Bạn có thể chơi bất kỳ game nào; nên thử nhiều nhóm để hồ sơ cân bằng hơn.",
  onboarding_routine_title: "Bắt đầu nhịp luyện tập",
  onboarding_routine_body:
    "Chơi 2–3 ván ngắn mỗi ngày. Điểm từng ván phản ánh lần chơi đó, còn điểm hồ sơ sẽ tăng hoặc giảm dần theo kết quả thực tế.",
  onboarding_quests_note:
    "Mục Nhiệm vụ hằng ngày đã có sẵn trên Dashboard để hướng dẫn và trao XP — không tạo thêm hệ thử thách trùng lặp.",
  onboarding_back: "QUAY LẠI",
  onboarding_next: "TIẾP TỤC",
  onboarding_skip: "Bỏ qua",
  onboarding_start: "BẮT ĐẦU VÁN ĐẦU",
  onboarding_continue: "TIẾP TỤC HIỆU CHUẨN",
  onboarding_reopen: "XEM LẠI HƯỚNG DẪN",
  calibration_label: "TIẾN ĐỘ HIỆU CHUẨN",
  calibration_title: "Đang hiệu chuẩn hồ sơ",
  calibration_remaining: (remaining: number) =>
    `Còn ${remaining} ván để mở khóa chỉ số nhận thức có ý nghĩa.`,
  calibration_play: "CHƠI TIẾP",
  calibration_complete_title: "Hiệu chuẩn hoàn tất",
  calibration_complete_body:
    "Đã đủ 5/5 ván. Cognitive Index và các trục giờ có đường cơ sở để theo dõi tiến bộ.",
  calibration_dismiss: "ĐÃ HIỂU",
  // PWA install (giu tu ban A1/A2 da deploy)
  settings_install_section: "Cài đặt ứng dụng",
  settings_install_desc:
    "Thêm Neurobics vào màn hình chính để mở nhanh, chạy toàn màn hình và dùng như một ứng dụng độc lập.",
  settings_install_btn: "CÀI ĐẶT NEUROBICS",
  settings_install_done: "Neurobics đã được cài trên thiết bị này.",
  settings_install_ios:
    "Trên iPhone/iPad: nhấn nút Chia sẻ trong Safari, sau đó chọn “Thêm vào Màn hình chính”.",
  settings_install_manual:
    "Nếu nút cài đặt chưa xuất hiện, mở menu của trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.",
  settings_install_success: "Đã cài Neurobics.",
  settings_install_failed:
    "Không thể mở trình cài đặt. Vui lòng thử lại từ menu trình duyệt.",
  settings_pw_current: "Mật khẩu hiện tại",
  settings_pw_new: "Mật khẩu mới",
  settings_pw_confirm: "Xác nhận mật khẩu mới",
  settings_pw_submit: "ĐỔI MẬT KHẨU",
  settings_pw_hint: "Tối thiểu 8 ký tự. Cần nhập đúng mật khẩu hiện tại.",
  settings_pw_mismatch: "Mật khẩu mới không khớp.",
  settings_pw_ok: "Đã đổi mật khẩu.",
  settings_delete_warn:
    "Xoá tài khoản sẽ xoá vĩnh viễn hồ sơ, lịch sử luyện tập và ảnh đại diện. Không hoàn tác được.",
  settings_delete_type_username: "Gõ đúng tên đăng nhập «{u}» để xác nhận",
  settings_delete_confirm_err: "Tên xác nhận không khớp.",
  settings_delete_btn: "XOÁ TÀI KHOẢN",
  settings_delete_ok: "Tài khoản đã được xoá.",
  // Stroop Test
  stroop_tag: "LUYỆN TẬP ỨC CHẾ",
  stroop_desc:
    "Nhận diện màu MỰC, không phải nghĩa từ · 30 kích thích · Rèn luyện kiểm soát ức chế nhận thức.",
  stroop_instruction: "Click MÀU MỰC",
  stroop_hint: "Bỏ qua nghĩa từ — click MÀU của chữ",
  stroop_trial: "Lần",
  stroop_inhibition: "Ức Chế",
  stroop_complete: "HOÀN THÀNH",
  // Color names (Vietnamese)
  // Math Sprint — chuoi trong man choi (gom tu TXT cuc bo)
  math_hint:
    "Hai mươi bốn phép tính, bốn lựa chọn. Chế độ Thích ứng tăng dần từ dễ đến khó.",
  math_level: "Chọn độ khó",
  math_start: "BẮT ĐẦU",
  math_q: "Câu",
  math_correct: "Đúng",
  math_wrong: "Sai",
  math_easy: "Dễ",
  math_medium: "Vừa",
  math_hard: "Khó",
  math_adaptive: "Thích ứng",

  // N-Back — chuoi trong man choi (gom tu TXT cuc bo)
  nback_hint: "Bấm KHỚP khi ô đang sáng trùng với ô đã hiện N lượt trước.",
  nback_level: "Chọn độ sâu",
  nback_start: "BẮT ĐẦU",
  nback_match: "KHỚP",
  nback_trial: "Lượt",
  nback_hit: "Đúng",
  nback_miss: "Bỏ lỡ",
  nback_false: "Bấm nhầm",
  nback_watch: "Ghi nhớ vị trí…",

  // Go / No-Go
  gonogo_hint:
    "Bấm khi thấy vòng xanh (GO). Giữ yên khi thấy vuông đỏ (NO-GO). Phím cách cũng được.",
  gonogo_start: "BẮT ĐẦU",
  gonogo_restart: "CHƠI LẠI",
  gonogo_complete: "HOÀN THÀNH",
  gonogo_trial: "LƯỢT",
  gonogo_hit: "Đúng GO",
  gonogo_miss: "Bỏ lỡ",
  gonogo_false: "Bấm nhầm",
  gonogo_reject: "Đúng NOGO",
  gonogo_go_label: "GO · BẤM",
  gonogo_nogo_label: "NO-GO · GIỮ",
  gonogo_intro_1: "Vòng xanh → bấm nhanh.",
  gonogo_intro_2: "Vuông đỏ → tuyệt đối không bấm.",
  gonogo_get_ready: "CHUẨN BỊ…",
  gonogo_press_now: "BẤM NGAY",
  gonogo_hold: "KHÔNG BẤM",
  gonogo_wait: "CHỜ TÍN HIỆU…",
  gonogo_accuracy: "Độ chính xác",

  // Mental Rotation
  mr_tag: "XOAY TÂM TRÍ",
  mr_desc:
    "Hai hình: cùng một hình đã xoay, hay bản gương? Luyện tư duy không gian thuần.",
  mr_hint:
    "Hình trái là gốc. Hình phải là bản xoay hoặc bản gương. Chọn GIỐNG hoặc GƯƠNG.",
  mr_start: "BẮT ĐẦU",
  mr_restart: "CHƠI LẠI",
  mr_complete: "HOÀN THÀNH",
  mr_trial: "LƯỢT",
  mr_same: "GIỐNG",
  mr_mirror: "GƯƠNG",
  mr_left: "GỐC",
  mr_right: "SO SÁNH",
  mr_intro_1: "Hình phải chỉ xoay → chọn GIỐNG.",
  mr_intro_2: "Hình phải là bản lật gương → chọn GƯƠNG.",
  mr_correct: "Đúng",
  mr_wrong: "Sai",
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
  yrs_same: "Exactly your real age",
  brain_age_needs_age:
    "Brain age compares your real age against how you rank among other players. Enter your birth year to begin.",
  birth_year_placeholder: "Birth year",
  birth_year_invalid: "That birth year isn't valid.",
  save_btn: "SAVE",
  brain_age_calibrating: (played, needed) =>
    `Calibrating: ${played}/${needed} rounds. We need enough data before the number means anything.`,
  brain_age_percentile: (pct, realAge) =>
    `Ahead of ${pct}% of players · real age ${realAge}`,
  brain_age_provisional:
    "Provisional: not enough players yet for a real distribution.",
  cog_matrix: "Cognitive Performance Matrix",
  cog_matrix_sub: (sessions: number) =>
    `5-domain neural assessment · ${sessions} sessions`,
  live: "LIVE",
  synapse_streak: "Synapse Streak",
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
  schulte_desc:
    "Click 1 → 25 in order as fast as you can. Sharpens peripheral vision & focus.",
  sudoku_desc:
    "Solve the 9×9 grid. 3 hearts, random puzzle every round. Trains deductive logic.",
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
  mem_start: "START MATRIX",
  mem_max_level: "Max Level",
  game_over: "GAME OVER",
  abort_restart: "ABORT & RESTART",
  streak_week_label: "Current streak (up to 7 dots)",
  streak_tz_note: "Resets 00:00 GMT+7",
  heart_full: "Life remaining",
  heart_empty: "Life lost",
  cell_label: "Cell",
  confirm_change_difficulty:
    "Changing difficulty discards this game's progress. Continue?",
  answer_correct: "Correct",
  answer_wrong: "Wrong",
  access_denied_title: "ACCESS DENIED",
  access_denied_role: "ADMINISTRATOR",

  // Reaction Time
  rx_tag: "SPEED TRAINING",
  rx_desc:
    "Wait for the signal to turn green, then react as fast as you can · 10 trials. Early clicks are penalised.",
  rx_wait: "Wait for the green signal...",
  rx_now: "CLICK NOW!",
  rx_too_soon_msg: "TOO SOON!",
  rx_intro_1: "Wait for the screen to turn green,",
  rx_intro_2: "then click as fast as you can.",
  rx_dont_press: "Do not click before the screen turns green",
  rx_saving: "Saving result...",
  rx_false_start_note:
    "Every early click lowers the Focus score for this round.",
  rx_start: "START TEST",
  rx_restart: "RESTART TEST",
  rx_complete: "TEST COMPLETE",
  rx_avg_label: "Average reaction time",
  rx_trial: "TRIAL",
  rx_average: "AVERAGE",
  rx_too_soon: "TOO SOON",

  // Sudoku
  sudoku_generating: "Generating puzzle…",

  new_puzzle: "NEW PUZZLE",
  solved: "Solved!",
  clues: "clues",
  round_complete: "ROUND COMPLETE",
  domains_this_round: "COGNITIVE DOMAINS THIS ROUND",
  score_note:
    "Big number and bars are THIS ROUND. Profile rating rises on good play and falls on bad play (EMA). Idle >7 days also decays.",
  round_score_label: "ROUND SCORE",
  round_score_hint: "This round only — not your profile rating",
  profile_rating_short: "Profile",
  continue_btn: "CONTINUE",

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
  guest_play: "TRY WITHOUT AN ACCOUNT",
  guest_hint:
    "Play every game right away. Scores stay on this device until you sign up.",
  guest_username: "Guest",
  guest_banner:
    "You are in guest mode — progress is temporary on this device. Sign up to save your profile, quests, and ranking.",
  guest_register: "SIGN UP TO SAVE",
  guest_locked: "Sign in to use this feature.",
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

  nback_tag: "WORKING MEMORY",
  nback_desc:
    "Track the cell shown N steps back and tap when it repeats — the classic working memory drill.",

  math_tag: "MENTAL MATH",
  math_desc:
    "Twenty-four problems, four choices. Includes Adaptive mode that ramps difficulty.",

  gonogo_tag: "RESPONSE INHIBITION",
  gonogo_desc:
    "Green circle = tap, red square = hold still. Train impulse control and selective attention.",

  axis_memory: "Memory",
  axis_focus: "Focus",
  axis_logic: "Logic",
  axis_spatial: "Spatial",
  axis_speed: "Speed",
  size_basic: "BASIC",
  size_normal: "NORMAL",
  size_advanced: "ADVANCED",
  total_xp_label: "Total",
  yrs_unit: "yrs",
  password_min_length: "Password must be at least 8 characters.",
  username_invalid: "Username 3–20 chars: letters, numbers, _ . - only.",
  signup_no_email_warning:
    "No real email is stored. If you forget this password, only the recovery code shown after sign-up can restore the account. Save it offline.",
  forgot_password: "Forgot password?",
  back_to_sign_in: "Back to sign in",
  recovery_code_label: "Recovery code",
  recovery_code_required: "Enter your recovery code.",
  recover_submit: "Reset password",
  recovery_success: "Password updated. You can sign in now.",
  retry_send: "Retry",
  recovery_code_title: "Save your recovery code",
  recovery_code_body:
    "This is the only way to reset your password. It will not be shown again.",
  copy_recovery_code: "Copy code",
  copied: "Copied",

  // Profile settings (Phase 4)
  settings_profile_section: "Personal info",
  settings_password_section: "Change password",
  settings_danger_section: "Danger zone",
  settings_avatar_change: "Change avatar",
  settings_avatar_remove: "Remove avatar",
  settings_avatar_hint: "JPEG / PNG / WebP / GIF · max 2 MB",
  settings_avatar_ok: "Avatar updated.",
  settings_avatar_removed: "Avatar removed.",
  settings_birth_current: "Saved birth year",
  settings_birth_ok: "Birth year saved.",
  settings_language: "Language",
  settings_lang_vi: "Tiếng Việt",
  settings_lang_en: "English",
  // Onboarding + calibration
  onboarding_step: "STEP {n}/3",
  onboarding_welcome_title: "Welcome, {u}",
  onboarding_welcome_body:
    "Neurobics trains memory, focus, speed, logic, and spatial skill through short rounds, then combines the results into your cognitive profile.",
  onboarding_disclaimer:
    "These metrics track training and progress; they are not a medical diagnosis.",
  onboarding_calibration_title: "Complete 5 calibration rounds",
  onboarding_calibration_body:
    "Your first five rounds establish a baseline for Cognitive Index and the five cognitive axes. Scores before that point are provisional.",
  onboarding_calibration_hint:
    "You may play any game; trying different categories creates a more balanced profile.",
  onboarding_routine_title: "Build your training rhythm",
  onboarding_routine_body:
    "Play 2–3 short rounds each day. A round score describes that attempt, while profile ratings gradually rise or fall with real performance.",
  onboarding_quests_note:
    "Daily Quests already guide training and award XP on the Dashboard, so there is no duplicate daily-challenge system.",
  onboarding_back: "BACK",
  onboarding_next: "CONTINUE",
  onboarding_skip: "Skip",
  onboarding_start: "START FIRST ROUND",
  onboarding_continue: "CONTINUE CALIBRATION",
  onboarding_reopen: "VIEW GUIDE AGAIN",
  calibration_label: "CALIBRATION PROGRESS",
  calibration_title: "Calibrating your profile",
  calibration_remaining: (remaining) =>
    `${remaining} rounds remaining before your cognitive metrics have a meaningful baseline.`,
  calibration_play: "PLAY NEXT",
  calibration_complete_title: "Calibration complete",
  calibration_complete_body:
    "All 5/5 rounds are complete. Cognitive Index and the five axes now have a baseline for tracking progress.",
  calibration_dismiss: "GOT IT",
  // PWA install (kept from the deployed A1/A2 release)
  settings_install_section: "Install application",
  settings_install_desc:
    "Add Neurobics to your home screen for quick access, full-screen mode, and an app-like experience.",
  settings_install_btn: "INSTALL NEUROBICS",
  settings_install_done: "Neurobics is installed on this device.",
  settings_install_ios:
    "On iPhone/iPad: tap Share in Safari, then choose “Add to Home Screen”.",
  settings_install_manual:
    "If the install button is unavailable, open your browser menu and choose “Install app” or “Add to Home screen”.",
  settings_install_success: "Neurobics installed.",
  settings_install_failed:
    "Could not open the installer. Please use your browser menu.",
  settings_pw_current: "Current password",
  settings_pw_new: "New password",
  settings_pw_confirm: "Confirm new password",
  settings_pw_submit: "UPDATE PASSWORD",
  settings_pw_hint: "At least 8 characters. Current password required.",
  settings_pw_mismatch: "New passwords do not match.",
  settings_pw_ok: "Password updated.",
  settings_delete_warn:
    "Deleting your account permanently removes your profile, training history, and avatar. This cannot be undone.",
  settings_delete_type_username: "Type your username «{u}» to confirm",
  settings_delete_confirm_err: "Confirmation username does not match.",
  settings_delete_btn: "DELETE ACCOUNT",
  settings_delete_ok: "Account deleted.",
  // Stroop Test
  stroop_tag: "INHIBITION TRAINING",
  stroop_desc:
    "Identify the INK color, not the word meaning · 30 stimuli · Trains inhibitory control & cognitive flexibility.",
  stroop_instruction: "Click the INK COLOR",
  stroop_hint: "Ignore the word — click the COLOR of the text",
  stroop_trial: "Trial",
  stroop_inhibition: "Inhibition",
  stroop_complete: "COMPLETE",
  // Color names (English)
  // Math Sprint — in-round strings
  math_hint:
    "Twenty-four problems, four choices. Adaptive mode ramps from easy to hard.",
  math_level: "Choose difficulty",
  math_start: "START",
  math_q: "Q",
  math_correct: "Correct",
  math_wrong: "Wrong",
  math_easy: "Easy",
  math_medium: "Medium",
  math_hard: "Hard",
  math_adaptive: "Adaptive",

  // N-Back — in-round strings
  nback_hint:
    "Press MATCH when the lit cell repeats the one from N steps back.",
  nback_level: "Choose depth",
  nback_start: "START",
  nback_match: "MATCH",
  nback_trial: "Trial",
  nback_hit: "Hits",
  nback_miss: "Misses",
  nback_false: "False",
  nback_watch: "Memorise the positions…",

  // Go / No-Go
  gonogo_hint:
    "Tap on the green circle (GO). Stay still on the red square (NO-GO). Spacebar works too.",
  gonogo_start: "START",
  gonogo_restart: "PLAY AGAIN",
  gonogo_complete: "COMPLETE",
  gonogo_trial: "TRIAL",
  gonogo_hit: "GO hits",
  gonogo_miss: "Misses",
  gonogo_false: "False",
  gonogo_reject: "NOGO OK",
  gonogo_go_label: "GO · TAP",
  gonogo_nogo_label: "NO-GO · HOLD",
  gonogo_intro_1: "Green circle → tap fast.",
  gonogo_intro_2: "Red square → do not tap.",
  gonogo_get_ready: "GET READY…",
  gonogo_press_now: "TAP NOW",
  gonogo_hold: "DON'T TAP",
  gonogo_wait: "WAIT…",
  gonogo_accuracy: "Accuracy",

  // Mental Rotation
  mr_tag: "MENTAL ROTATION",
  mr_desc:
    "Two shapes: same figure rotated, or a mirror image? Pure spatial reasoning.",
  mr_hint:
    "Left is the original. Right is rotated or mirrored. Choose SAME or MIRROR.",
  mr_start: "START",
  mr_restart: "PLAY AGAIN",
  mr_complete: "COMPLETE",
  mr_trial: "TRIAL",
  mr_same: "SAME",
  mr_mirror: "MIRROR",
  mr_left: "BASE",
  mr_right: "COMPARE",
  mr_intro_1: "Right is only rotated → SAME.",
  mr_intro_2: "Right is a mirror flip → MIRROR.",
  mr_correct: "Correct",
  mr_wrong: "Wrong",
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
    try {
      const saved = localStorage.getItem("nb_lang");
      if (saved === "vi" || saved === "en") return saved;
    } catch {
      /* localStorage bi chan (private mode) — roi xuong doan do trinh duyet */
    }
    // Nguoi dung moi: doan theo ngon ngu trinh duyet, mac dinh cuoi cung la vi.
    try {
      const tags = navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
      for (const tag of tags) {
        const base = String(tag ?? "")
          .toLowerCase()
          .split("-")[0];
        if (base === "vi") return "vi";
        if (base === "en") return "en";
      }
      // Khai bao ngon ngu khac han => tieng Anh de doc duoc.
      // (Truoc day co them nhanh `if (tags.length > 0) return "en"` roi moi
      //  `return "vi"`; nhanh cuoi gan nhu khong bao gio chay vi tags hau nhu
      //  luon co phan tu. Bo di cho ro y: chi SSR/test moi roi ve mac dinh.)
      if (tags.length > 0) return "en";
    } catch {
      /* khong co navigator (SSR/test) => mac dinh tieng Viet */
    }
    return "vi";
  });

  const toggle = () =>
    setLang((l) => {
      const next: Lang = l === "vi" ? "en" : "vi";
      try {
        localStorage.setItem("nb_lang", next);
      } catch {}
      return next;
    });

  return (
    <Ctx.Provider value={{ lang, toggle, t: translations[lang] }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang() {
  return useContext(Ctx);
}
