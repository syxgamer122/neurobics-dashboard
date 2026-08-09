import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "../lib/i18n";
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

export function VisualSearchGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: unknown) => Promise<void>;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();
  const [status, setStatus] = useState<"idle" | "playing" | "done">("idle");
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [targetIconIdx, setTargetIconIdx] = useState<number>(0);
  const [grid, setGrid] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hitRtsRef = useRef<number[]>([]);
  const lastHitRef = useRef<number | null>(null);

  const generateBoard = useCallback(() => {
    // Chon target ngau nhien
    const tIdx = Math.floor(Math.random() * ALL_ICONS.length);
    setTargetIconIdx(tIdx);

    // Chon distractor
    const distractorPool = ALL_ICONS.map((_, i) => i).filter((i) => i !== tIdx);
    const distractors: number[] = [];
    for (let i = 0; i < 6; i++) {
      // Dung 6 loai distractor cho moi board de tang do nhieu
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
      // Telemetry: rts (reaction times for each found target)
      // mistakes, score = correct hits
      const telemetry = {
        score,
        mistakes,
        rts: hitRtsRef.current,
        totalTimeMs: 60000,
      };
      await onComplete(telemetry);
    } catch (err) {
      logError("Visual Search save failed", err);
    } finally {
      setSaving(false);
    }
  }, [score, mistakes, onComplete]);

  const finishGame = useCallback(() => {
    setStatus("done");
    if (timerRef.current) clearInterval(timerRef.current);

    // Auto submit
    submitResult();
  }, [submitResult]);

  const startGame = useCallback(() => {
    setStatus("playing");
    setScore(0);
    setMistakes(0);
    setTimeLeft(60);
    hitRtsRef.current = [];
    if (onPlayStart) onPlayStart();
    generateBoard();

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          finishGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [generateBoard, onPlayStart, finishGame]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleCellClick = (iconIdx: number) => {
    if (status !== "playing") return;

    if (iconIdx === targetIconIdx) {
      // Dung!
      setScore((s) => s + 1);
      if (lastHitRef.current) {
        hitRtsRef.current.push(
          Math.round(performance.now() - lastHitRef.current),
        );
      }
      generateBoard();
    } else {
      // Sai!
      setMistakes((m) => m + 1);
    }
  };

  const TargetIcon = ALL_ICONS[targetIconIdx];

  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-6 text-center">
        <h2 className="text-2xl font-bold text-slate-100">
          {t.search_tag || "VISUAL SEARCH"}
        </h2>
        <div className="space-y-2 text-slate-400">
          <p>{t.search_intro_1 || "Ghi nhớ biểu tượng mục tiêu ở trên."}</p>
          <p>
            {t.search_intro_2 ||
              "Tìm và bấm chính xác biểu tượng đó trong lưới bên dưới."}
          </p>
        </div>
        <button
          onClick={startGame}
          className="px-8 py-3 text-lg font-bold text-slate-900 bg-pink-500 rounded-full hover:bg-pink-400 transition-colors"
        >
          {t.search_start || "BẮT ĐẦU"}
        </button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-6 text-center">
        <h2 className="text-2xl font-bold text-slate-100">
          {t.search_complete || "HOÀN THÀNH"}
        </h2>
        <div className="grid grid-cols-2 gap-8 my-6">
          <div className="text-center">
            <div className="text-4xl font-black text-pink-400">{score}</div>
            <div className="text-sm font-bold tracking-widest text-slate-500 mt-2">
              {t.search_score || "ĐIỂM"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black text-red-400">{mistakes}</div>
            <div className="text-sm font-bold tracking-widest text-slate-500 mt-2">
              {t.search_mistakes || "SAI"}
            </div>
          </div>
        </div>
        <button
          onClick={startGame}
          disabled={saving}
          className="px-8 py-3 font-bold text-slate-900 bg-pink-500 rounded-full hover:bg-pink-400 transition-colors disabled:opacity-50"
        >
          {saving
            ? t.search_saving || "Đang lưu kết quả..."
            : t.search_restart || "CHƠI LẠI"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 select-none">
      <div className="flex justify-between items-center w-full mb-6 px-4">
        <div className="text-xl font-bold text-pink-400">
          00:{timeLeft.toString().padStart(2, "0")}
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-slate-500 tracking-wider mb-1">
            {t.search_target || "MỤC TIÊU"}
          </span>
          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border-2 border-pink-500/50">
            {TargetIcon && <TargetIcon className="w-6 h-6 text-slate-100" />}
          </div>
        </div>
        <div className="text-xl font-bold text-slate-100">{score}</div>
      </div>

      <div className="grid grid-cols-5 gap-2 sm:gap-3 w-full">
        {grid.map((iconIdx, i) => {
          const IconComp = ALL_ICONS[iconIdx];
          return (
            <button
              key={i}
              onClick={() => handleCellClick(iconIdx)}
              className="aspect-square bg-slate-800/80 rounded-xl flex items-center justify-center hover:bg-slate-700 transition-colors border border-slate-700/50 active:scale-95"
            >
              <IconComp className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300 pointer-events-none" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
