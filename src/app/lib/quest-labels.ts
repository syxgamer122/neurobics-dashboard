/**
 * Nhãn nhiệm vụ — nguồn duy nhất phía client.
 *
 * Postgres chỉ trả `code` kỹ thuật (vd. w_games_7). Giao diện KHÔNG BAO GIỜ
 * được hiện mã thô đó. Thứ tự ưu tiên khi vẽ tên:
 *   1. title_vi / title_en từ RPC (nếu có)
 *   2. QUEST_LABELS[code][lang]
 *   3. humanizeQuestCode(code, lang) — dịch từ cấu trúc mã
 *   4. chuỗi an toàn "Nhiệm vụ" / "Quest" (không bao giờ trả lại code)
 */

export type QuestLang = "vi" | "en";

export const QUEST_LABELS: Record<string, { vi: string; en: string }> = {
  q_rounds_3: { vi: "Khởi động: chơi 3 ván", en: "Warm up: play 3 rounds" },
  q_rounds_5: { vi: "Chơi 5 ván hôm nay", en: "Play 5 rounds today" },
  q_rounds_7: { vi: "Bền bỉ: chơi 7 ván", en: "Endurance: play 7 rounds" },
  q_score_600: { vi: "Đạt 600+ trong một ván", en: "Score 600+ in one round" },
  q_score_750_2: { vi: "Đạt 750+ trong 2 ván", en: "Score 750+ in 2 rounds" },
  q_score_850: { vi: "Đạt 850+ trong một ván", en: "Score 850+ in one round" },
  q_games_2: { vi: "Chơi 2 trò khác nhau", en: "Play 2 different games" },
  q_games_3: { vi: "Chơi 3 trò khác nhau", en: "Play 3 different games" },
  q_games_4: { vi: "Chơi 4 trò khác nhau", en: "Play 4 different games" },
  q_play_schulte_2: { vi: "Chơi Schulte 2 ván", en: "Play 2 Schulte rounds" },
  q_play_sudoku_2: { vi: "Chơi Sudoku 2 ván", en: "Play 2 Sudoku rounds" },
  q_play_stroop_2: { vi: "Chơi Stroop 2 ván", en: "Play 2 Stroop rounds" },
  q_play_reaction_2: { vi: "Chơi Reaction 2 ván", en: "Play 2 Reaction rounds" },
  q_play_memory_2: { vi: "Chơi Memory 2 ván", en: "Play 2 Memory rounds" },
  q_play_nback_2: { vi: "Chơi N-Back 2 ván", en: "Play 2 N-Back rounds" },
  q_play_math_2: { vi: "Chơi Math Sprint 2 ván", en: "Play 2 Math Sprint rounds" },
  q_play_gonogo_2: { vi: "Chơi Go / No-Go 2 ván", en: "Play 2 Go / No-Go rounds" },
  q_play_mental_2: {
    vi: "Chơi Mental Rotation 2 ván",
    en: "Play 2 Mental Rotation rounds",
  },
  w_rounds_25: { vi: "Tuần: hoàn thành 25 ván", en: "Weekly: finish 25 rounds" },
  w_games_7: {
    vi: "Tuần: chơi 7 trò khác nhau",
    en: "Weekly: play 7 different games",
  },
  w_score_800_5: { vi: "Tuần: 5 ván đạt 800+", en: "Weekly: 5 rounds at 800+" },
  w_score_900_3: {
    vi: "Tuần elite: 3 ván đạt 900+",
    en: "Elite week: 3 rounds at 900+",
  },
};

const QUEST_GAME_NAMES: Record<string, string> = {
  schulte: "Schulte",
  sudoku: "Sudoku",
  stroop: "Stroop",
  reaction: "Reaction",
  memory: "Memory",
  nback: "N-Back",
  math: "Math Sprint",
  gonogo: "Go / No-Go",
  mental: "Mental Rotation",
  corsi: "Corsi Block",
  trail: "Trail Making",
};

/** Dịch mã nhiệm vụ thành câu đọc được từ cấu trúc mã. */
export function humanizeQuestCode(code: string, lang: QuestLang): string {
  const raw = String(code ?? "").trim();
  if (!raw) return lang === "vi" ? "Nhiệm vụ" : "Quest";

  const weekly = raw.startsWith("w_");
  const body = raw.replace(/^[qw]_/, "");
  const prefix = weekly ? (lang === "vi" ? "Tuần: " : "Weekly: ") : "";

  let text: string | null = null;
  let m: RegExpMatchArray | null;

  if ((m = body.match(/^rounds_(\d+)$/))) {
    text = lang === "vi" ? `chơi ${m[1]} ván` : `play ${m[1]} rounds`;
  } else if ((m = body.match(/^score_(\d+)_(\d+)$/))) {
    text =
      lang === "vi"
        ? `đạt ${m[1]}+ trong ${m[2]} ván`
        : `score ${m[1]}+ in ${m[2]} rounds`;
  } else if ((m = body.match(/^score_(\d+)$/))) {
    text =
      lang === "vi"
        ? `đạt ${m[1]}+ trong một ván`
        : `score ${m[1]}+ in one round`;
  } else if ((m = body.match(/^games_(\d+)$/))) {
    text =
      lang === "vi"
        ? `chơi ${m[1]} trò khác nhau`
        : `play ${m[1]} different games`;
  } else if ((m = body.match(/^play_([a-z]+)_(\d+)$/))) {
    const game = QUEST_GAME_NAMES[m[1]] ?? m[1];
    text =
      lang === "vi"
        ? `chơi ${game} ${m[2]} ván`
        : `play ${m[2]} ${game} rounds`;
  }

  if (!text) {
    // Bỏ gạch dưới; nếu vẫn giống mã kỹ thuật thì dùng nhãn generic.
    const soft = body.replace(/_/g, " ").trim();
    if (!soft || /^[a-z0-9 ]+$/i.test(soft) && /\d/.test(soft) && soft.length < 4) {
      text = lang === "vi" ? "nhiệm vụ" : "quest";
    } else {
      text = soft || (lang === "vi" ? "nhiệm vụ" : "quest");
    }
  }

  const label = (prefix + text).trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Nhãn hiển thị cuối cùng — không bao giờ trả về mã thô.
 * serverTitle: title_vi/title_en từ RPC (tuỳ ngôn ngữ).
 */
export function resolveQuestLabel(
  code: string,
  lang: QuestLang,
  serverTitle?: string | null,
): string {
  const fromServer = String(serverTitle ?? "").trim();
  if (fromServer && fromServer !== code) return fromServer;

  const mapped = QUEST_LABELS[code]?.[lang];
  if (mapped) return mapped;

  const human = humanizeQuestCode(code, lang);
  // Chặn trường hợp humanize vô tình trả lại đúng mã.
  if (human && human !== code) return human;

  return lang === "vi" ? "Nhiệm vụ" : "Quest";
}
