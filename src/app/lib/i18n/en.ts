// English translations. Keep key parity with vi.ts.
import { vi } from "./vi.ts";

export const en: typeof vi = {
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

  arena: "Mindgem Arena",
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
  dock_arena: "Mindgem Arena",
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
    "Mindgem trains memory, focus, speed, logic, and spatial skill through short rounds, then combines the results into your cognitive profile.",
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
    "Add Mindgem to your home screen for quick access, full-screen mode, and an app-like experience.",
  settings_install_btn: "INSTALL MINDGEM",
  settings_install_done: "Mindgem is installed on this device.",
  settings_install_ios:
    "On iPhone/iPad: tap Share in Safari, then choose “Add to Home Screen”.",
  settings_install_manual:
    "If the install button is unavailable, open your browser menu and choose “Install app” or “Add to Home screen”.",
  settings_install_success: "Mindgem installed.",
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
