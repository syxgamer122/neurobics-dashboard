// Vietnamese translations. Keep key parity with en.ts.

export const vi = {
  // Nav
  league: "GIẢI ĐẤU TRÍ TUỆ",

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
  this_month: "Tháng Này",
  xp_today: "XP Hôm Nay",
  level_label: "CẤP ĐỘ",
  xp_earned: "XP THU ĐƯỢC",
  level_up: "LÊN CẤP!",
  days: "ngày",
  sessions: "phiên",
  pts: "điểm",

  // Arena
  arena: "Đấu Trường Mindgem",
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
  rx_avg_label: "Thời gian phản xạ trung vị",
  rx_trial: "LẦN",
  rx_average: "TRUNG VỊ",
  rx_median_label: "Thời gian phản xạ trung vị",
  rx_median: "TRUNG VỊ",
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
    "Mindgem giúp bạn luyện trí nhớ, tập trung, tốc độ, logic và không gian qua các ván ngắn; kết quả được tổng hợp thành hồ sơ nhận thức cá nhân.",
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
    "Thêm Mindgem vào màn hình chính để mở nhanh, chạy toàn màn hình và dùng như một ứng dụng độc lập.",
  settings_install_btn: "CÀI ĐẶT MINDGEM",
  settings_install_done: "Mindgem đã được cài trên thiết bị này.",
  settings_install_ios:
    "Trên iPhone/iPad: nhấn nút Chia sẻ trong Safari, sau đó chọn “Thêm vào Màn hình chính”.",
  settings_install_manual:
    "Nếu nút cài đặt chưa xuất hiện, mở menu của trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.",
  settings_install_success: "Đã cài Mindgem.",
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
  math_complete: "Hoàn thành Sprint!",
  math_accuracy: "Độ chính xác",
  math_saving: "Đang lưu...",
  math_play_again: "CHƠI LẠI",

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

  // Corsi Block
  corsi_tag: "CHUỖI KHỐI CORSI",
  corsi_desc:
    "Chuỗi ô sáng lên rồi tắt. Bấm lại đúng thứ tự — chuỗi dài dần sau mỗi lần đúng.",
  corsi_hint: "Nhớ VỊ TRÍ và THỨ TỰ. Sai hai lần ở cùng độ dài thì kết thúc.",
  corsi_start: "BẮT ĐẦU",
  corsi_restart: "CHƠI LẠI",
  corsi_complete: "HOÀN THÀNH",
  corsi_level: "ĐỘ DÀI",
  corsi_span: "KỶ LỤC",
  corsi_watch: "NHÌN KỸ…",
  corsi_recall: "BẤM LẠI",
  corsi_mistakes: "LỖI",
  corsi_intro_1: "Các ô sẽ sáng lần lượt. Hãy ghi nhớ trình tự.",
  corsi_intro_2: "Sau đó bấm lại đúng thứ tự vừa xem.",
  corsi_saving: "Đang lưu kết quả…",

  // Trail Making
  trail_tag: "NỐI ĐƯỜNG",
  trail_desc:
    "Nối 1 → A → 2 → B → 3 → C… nhanh nhất có thể. Quét thị giác và chuyển đổi quy tắc.",
  trail_hint: "Xen kẽ SỐ và CHỮ. Đồng hồ chỉ chạy từ cú bấm đúng đầu tiên.",
  trail_start: "BẮT ĐẦU",
  trail_restart: "CHƠI LẠI",
  trail_complete: "HOÀN THÀNH",
  trail_next: "TIẾP THEO",
  trail_progress: "TIẾN ĐỘ",
  trail_mistakes: "BẤM NHẦM",
  trail_elapsed: "THỜI GIAN",
  trail_intro_1: "Bắt đầu từ số 1, rồi đến chữ A.",
  trail_intro_2: "Cứ thế xen kẽ cho đến điểm cuối cùng.",
  trail_saving: "Đang lưu kết quả…",

  // Visual Search
  search_tag: "TÌM KIẾM TRỰC QUAN",
  search_desc:
    "Tìm biểu tượng mục tiêu bị giấu giữa hàng chục biểu tượng gây nhiễu. Càng tìm nhanh điểm càng cao.",
  search_hint: "Tìm biểu tượng đang hiển thị ở trên cùng và nhấn vào nó.",
  search_start: "BẮT ĐẦU",
  search_restart: "CHƠI LẠI",
  search_complete: "HOÀN THÀNH",
  search_target: "MỤC TIÊU",
  search_score: "ĐIỂM",
  search_mistakes: "SAI",
  search_intro_1: "Ghi nhớ biểu tượng mục tiêu ở trên.",
  search_intro_2: "Tìm và bấm chính xác biểu tượng đó trong lưới bên dưới.",
  search_saving: "Đang lưu kết quả…",
};
