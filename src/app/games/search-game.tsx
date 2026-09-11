import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "../lib/i18n";
import { useGameLifecycle } from "../lib/use-game-lifecycle";
import { usePress, type InputType } from "../lib/use-press";
import { logError } from "../lib/logger";
import {
  Star,
  Heart,
  Circle,
  Square,
  Triangle,
  Hexagon,
  Cloud,
  Moon,
  Sun,
  Zap,
  Snowflake,
  Flame,
  Droplet,
  Leaf,
  Anchor,
  Bell,
  Camera,
  Gift,
  Award,
  Music,
  Smile,
  Umbrella,
  Shield,
  Clock,
} from "lucide-react";

const ALL_ICONS = [
  Star,
  Heart,
  Circle,
  Square,
  Triangle,
  Hexagon,
  Cloud,
  Moon,
  Sun,
  Zap,
  Snowflake,
  Flame,
  Droplet,
  Leaf,
  Anchor,
  Bell,
  Camera,
  Gift,
  Award,
  Music,
  Smile,
  Umbrella,
  Shield,
  Clock,
];

export type VisualSearchTelemetry = {
  score: number;
  mistakes: number;
  rts: number[];
  timeMs: number;
  totalTimeMs?: number;
  inputType?: InputType;
};

export function VisualSearchGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: VisualSearchTelemetry) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const press = usePress();
  const { t } = useLang();
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const statusRef = useRef(status);
  const setStatusSafe = useCallback((next: "idle" | "playing" | "done") => {
    statusRef.current = next;
    setStatus(next);
  }, []);
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [targetIconIdx, setTargetIconIdx] = useState<number>(0);
  const [grid, setGrid] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const scoreRef = useRef(0);
  scoreRef.current = score;
  const mistakesRef = useRef(0);
  mistakesRef.current = mistakes;
  const startedAtRef = useRef(Date.now());

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hitRtsRef = useRef<number[]>([]);
  const lastHitRef = useRef<number | null>(null);
  const inputTypesRef = useRef<Set<InputType>>(new Set());

  const generateBoard = useCallback((scoreValue: number) => {
    // Chon target ngau nhien
    const tIdx = Math.floor(Math.random() * ALL_ICONS.length);
    setTargetIconIdx(tIdx);

    // Chon distractor tang dan theo score
    const numDistractors = Math.min(
      ALL_ICONS.length - 1,
      4 + Math.floor(scoreValue / 2),
    );
    const distractorPool = ALL_ICONS.map((_, i) => i).filter((i) => i !== tIdx);
    const distractors: number[] = [];
    for (let i = 0; i < numDistractors; i++) {
      // Dung loai distractor cho moi board de tang do nhieu
      const rIdx = Math.floor(Math.random() * distractorPool.length);
      distractors.push(distractorPool.splice(rIdx, 1)[0]);
    }

    // Tao luoi 5x5 = 25 o
    const newGrid = Array(25).fill(0);
    const targetPos = Math.floor(Math.random() * 25);
    for (let i = 0; i < 25; i++) {
      if (i === targetPos) {
        newGrid[i] = tIdx;
      } else {
        const dIdx = Math.floor(Math.random() * distractors.length);
        newGrid[i] = distractors[dIdx];
      }
    }
    setGrid(newGrid);
    lastHitRef.current = performance.now();
  }, []);

  const submitResult = useCallback(async () => {
    setSaving(true);
    try {
      let finalInput = "mouse";
      if (inputTypesRef.current.has("touch")) finalInput = "touch";
      else if (inputTypesRef.current.has("key")) finalInput = "key";

      // Telemetry: rts (reaction times for each found target)
      // mistakes, score = correct hits
      const elapsed = Math.max(1, Date.now() - startedAtRef.current);
      const telemetry: VisualSearchTelemetry = {
        score: scoreRef.current,
        mistakes: mistakesRef.current,
        rts: hitRtsRef.current,
        timeMs: elapsed,
        totalTimeMs: elapsed,
        inputType: finalInput as InputType,
      };
      await onComplete(telemetry);
    } catch (err) {
      logError("Visual Search save failed", err);
    } finally {
      setSaving(false);
    }
  }, [onComplete]);

  const finishGame = useCallback(() => {
    setStatusSafe("done");
    if (timerRef.current) clearInterval(timerRef.current);

    // Auto submit
    submitResult();
  }, [submitResult, setStatusSafe]);

  const resetGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStatusSafe("idle");
    setScore(0);
    scoreRef.current = 0;
    setMistakes(0);
    mistakesRef.current = 0;
    setTimeLeft(60);
    setGrid([]);
    inputTypesRef.current = new Set();
  }, [setStatusSafe]);

  useGameLifecycle({
    isActive: () => statusRef.current === "playing",
    onLeave: resetGame,
  });

  const startGame = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setStatusSafe("playing");
    scoreRef.current = 0;
    mistakesRef.current = 0;
    setScore(0);
    setMistakes(0);
    setTimeLeft(60);
    hitRtsRef.current = [];
    if (onPlayStart) onPlayStart();
    generateBoard(0);

    const now = Date.now();
    startedAtRef.current = now;
    const endTime = now + 60000;

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        finishGame();
      }
    }, 250);
  }, [generateBoard, onPlayStart, finishGame, setStatusSafe]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleCellClick = (iconIdx: number, inputType?: InputType) => {
    if (inputType) inputTypesRef.current.add(inputType);
    if (statusRef.current !== "playing") return;

    if (iconIdx === targetIconIdx) {
      if (lastHitRef.current !== null) {
        const rawRt = performance.now() - lastHitRef.current;
        hitRtsRef.current.push(
          Math.min(10000, Math.max(120, Math.round(rawRt))),
        );
      }
      setScore((s) => {
        const next = s + 1;
        scoreRef.current = next;
        generateBoard(next);
        return next;
      });
    } else {
      // Sai!
      setMistakes((m) => {
        const next = m + 1;
        mistakesRef.current = next;
        return next;
      });
    }
  };

  const TargetIcon = ALL_ICONS[targetIconIdx];

  if (status === "idle") {
    return (
      <div
        className="rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center space-y-6 text-center shadow-xl"
        style={{
          background:
            "linear-gradient(145deg, rgba(13, 20, 48, 0.8), rgba(8, 14, 32, 0.7))",
          border: "1px solid rgba(236, 72, 153, 0.25)",
          backdropFilter: "blur(20px)",
        }}
      >
        <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-wider text-pink-400">
          {t.search_tag || "VISUAL SEARCH"}
        </h2>
        <div className="space-y-2 text-sm text-slate-300 max-w-md">
          <p>{t.search_intro_1 || "Ghi nhớ biểu tượng mục tiêu ở trên."}</p>
          <p>
            {t.search_intro_2 ||
              "Tìm và bấm chính xác biểu tượng đó trong lưới bên dưới."}
          </p>
        </div>
        <button
          type="button"
          onClick={startGame}
          className="px-8 py-3.5 text-sm font-extrabold text-white tracking-widest font-mono rounded-xl hover:scale-105 transition-all shadow-lg cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
            boxShadow: "0 8px 24px -4px rgba(236, 72, 153, 0.5)",
          }}
        >
          {t.search_start || "BẮT ĐẦU"}
        </button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div
        className="rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center space-y-6 text-center shadow-xl"
        style={{
          background:
            "linear-gradient(145deg, rgba(13, 20, 48, 0.8), rgba(8, 14, 32, 0.7))",
          border: "1px solid rgba(236, 72, 153, 0.25)",
          backdropFilter: "blur(20px)",
        }}
      >
        <h2 className="text-xl sm:text-2xl font-bold font-mono tracking-wider text-pink-400">
          {t.search_complete || "HOÀN THÀNH"}
        </h2>
        <div className="grid grid-cols-2 gap-8 my-4">
          <div className="text-center p-4 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="text-4xl font-extrabold text-pink-400 font-mono">
              {score}
            </div>
            <div className="text-xs font-bold tracking-widest text-slate-400 mt-2 font-mono">
              {t.search_score || "ĐIỂM"}
            </div>
          </div>
          <div className="text-center p-4 rounded-xl bg-slate-900/60 border border-white/5">
            <div className="text-4xl font-extrabold text-red-400 font-mono">
              {mistakes}
            </div>
            <div className="text-xs font-bold tracking-widest text-slate-400 mt-2 font-mono">
              {t.search_mistakes || "SAI"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={startGame}
          disabled={saving}
          className="px-8 py-3 text-sm font-bold text-white font-mono rounded-xl hover:scale-105 transition-all disabled:opacity-50 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #ec4899, #8b5cf6)",
          }}
        >
          {saving
            ? t.search_saving || "Đang lưu kết quả..."
            : t.search_restart || "CHƠI LẠI"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center w-full max-w-lg mx-auto p-5 sm:p-6 rounded-2xl select-none shadow-xl"
      style={{
        background:
          "linear-gradient(145deg, rgba(13, 20, 48, 0.8), rgba(8, 14, 32, 0.7))",
        border: "1px solid rgba(236, 72, 153, 0.25)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex justify-between items-center w-full mb-5 px-2">
        <div className="text-lg sm:text-xl font-bold font-mono text-pink-400">
          00:{timeLeft.toString().padStart(2, "0")}
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider mb-1">
            {t.search_target || "MỤC TIÊU"}
          </span>
          <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center border-2 border-pink-500/60 shadow-lg shadow-pink-500/20">
            {TargetIcon && <TargetIcon className="w-6 h-6 text-pink-300" />}
          </div>
        </div>
        <div className="text-lg sm:text-xl font-bold font-mono text-foreground">
          {score} pts
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3 w-full">
        {grid.map((iconIdx, i) => {
          const IconComp = ALL_ICONS[iconIdx];
          return (
            <button
              key={i}
              type="button"
              aria-label={`Select icon ${iconIdx}`}
              {...press((type: InputType) => handleCellClick(iconIdx, type))}
              className="aspect-square bg-slate-900/80 rounded-xl flex items-center justify-center hover:bg-slate-800 transition-all border border-white/5 hover:border-pink-500/40 game-surface active:scale-95 shadow-sm"
            >
              <IconComp
                className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300 pointer-events-none"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
