import { useCallback, useEffect, useRef, useState } from "react";
import { Hand, Play, ShieldAlert } from "lucide-react";
import { useLang } from "../lib/i18n";
import type { GoNoGoTelemetry } from "../lib/scoring";
import { logError } from "../lib/logger";

// ─── Go / No-Go ─────────────────────────────────────────────────────────────
// Bài ức chế phản xạ kinh điển:
//   GO   (vòng xanh)  → phải bấm trong cửa sổ phản hồi
//   NOGO (vuông đỏ)   → KHÔNG được bấm
// Focus chủ yếu đo từ false alarm; Speed lấy từ RT các lần bấm đúng trên GO.
// Toàn bộ điểm chấm lại ở server — client chỉ thu telemetry thô.

const TOTAL_TRIALS = 40;
/** Tỷ lệ trial No-Go (~30% là chuẩn tâm lý học cho task này). */
const NOGO_RATE = 0.3;
/** Thời gian hiện stimulus + cửa sổ bấm. */
const STIM_MS = 900;
/** Khoảng nghỉ ngẫu nhiên giữa các trial (ms). */
const ISI_MIN = 500;
const ISI_MAX = 1100;

const ACCENT = "#F97316";

type Phase = "idle" | "countdown" | "isi" | "stim" | "done";
type StimKind = "go" | "nogo";

const panelStyle: React.CSSProperties = {
  background: "rgba(var(--neuro-panel-rgb),0.62)",
  border: `1px solid ${ACCENT}33`,
  backdropFilter: "blur(var(--glass-blur, 18px))",
  WebkitBackdropFilter: "blur(var(--glass-blur, 18px))",
  boxShadow: "0 4px 44px rgba(0,0,0,0.45)",
};

function buildKinds(total: number, nogoRate: number): StimKind[] {
  const nogoCount = Math.max(4, Math.round(total * nogoRate));
  const kinds: StimKind[] = Array.from({ length: total }, (_, i) =>
    i < nogoCount ? "nogo" : "go",
  );
  // Fisher–Yates shuffle
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds;
}

export function GoNoGoGame({
  onComplete,
  onPlayStart,
}: {
  onComplete: (tel: GoNoGoTelemetry) => Promise<void> | void;
  onPlayStart?: () => void;
}) {
  const { t } = useLang();

  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [trial, setTrial] = useState(0);
  const [stim, setStim] = useState<StimKind | null>(null);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
  });

  const kindsRef = useRef<StimKind[]>([]);
  const trialRef = useRef(0);
  const respondedRef = useRef(false);
  const stimStartRef = useRef(0);
  const startedAtRef = useRef(0);
  const rtsRef = useRef<number[]>([]);
  const statsRef = useRef({
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
  });
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimers();
    setPhase("done");
    setStim(null);
    setSaving(true);

    const kinds = kindsRef.current;
    const goTrials = kinds.filter((k) => k === "go").length;
    const nogoTrials = kinds.length - goTrials;
    const s = statsRef.current;

    try {
      await onComplete({
        timeMs: Math.max(1, Date.now() - startedAtRef.current),
        trials: kinds.length,
        goTrials,
        nogoTrials,
        hits: s.hits,
        misses: s.misses,
        falseAlarms: s.falseAlarms,
        correctRejections: s.correctRejections,
        rts: rtsRef.current,
      });
    } catch (err) {
      logError("Go/No-Go completion failed:", err);
    } finally {
      setSaving(false);
    }
  }, [clearTimers, onComplete]);

  const runTrial = useCallback(
    (index: number) => {
      if (index >= kindsRef.current.length) {
        void finish();
        return;
      }

      trialRef.current = index;
      setTrial(index);
      setFlash(null);
      setStim(null);
      setPhase("isi");
      respondedRef.current = false;

      const isi = ISI_MIN + Math.random() * (ISI_MAX - ISI_MIN);
      schedule(() => {
        const kind = kindsRef.current[index];
        respondedRef.current = false;
        stimStartRef.current = performance.now();
        setStim(kind);
        setPhase("stim");

        schedule(() => {
          // Hết cửa sổ phản hồi mà chưa bấm.
          if (!respondedRef.current) {
            if (kind === "go") {
              statsRef.current = {
                ...statsRef.current,
                misses: statsRef.current.misses + 1,
              };
            } else {
              statsRef.current = {
                ...statsRef.current,
                correctRejections: statsRef.current.correctRejections + 1,
              };
            }
            setStats(statsRef.current);
          }
          setStim(null);
          runTrial(index + 1);
        }, STIM_MS);
      }, isi);
    },
    [finish, schedule],
  );

  const startCountdown = () => {
    onPlayStart?.();
    clearTimers();
    finishedRef.current = false;
    kindsRef.current = buildKinds(TOTAL_TRIALS, NOGO_RATE);
    rtsRef.current = [];
    statsRef.current = {
      hits: 0,
      misses: 0,
      falseAlarms: 0,
      correctRejections: 0,
    };
    setStats(statsRef.current);
    setFlash(null);
    setStim(null);
    setTrial(0);
    setCountdown(3);
    setPhase("countdown");
    startedAtRef.current = Date.now();

    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        startedAtRef.current = Date.now();
        runTrial(0);
        return;
      }
      setCountdown(n);
      schedule(tick, 700);
    };
    schedule(tick, 700);
  };

  const press = useCallback(() => {
    if (phase !== "stim" || respondedRef.current || !stim) return;
    respondedRef.current = true;

    const rt = Math.max(
      1,
      Math.round(performance.now() - stimStartRef.current),
    );

    if (stim === "go") {
      rtsRef.current.push(rt);
      statsRef.current = {
        ...statsRef.current,
        hits: statsRef.current.hits + 1,
      };
      setFlash("ok");
    } else {
      statsRef.current = {
        ...statsRef.current,
        falseAlarms: statsRef.current.falseAlarms + 1,
      };
      setFlash("bad");
    }
    setStats(statsRef.current);
  }, [phase, stim]);

  // Space / click pad
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (phase !== "stim" && phase !== "isi") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        pressRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const reset = () => {
    clearTimers();
    finishedRef.current = false;
    setPhase("idle");
    setStim(null);
    setFlash(null);
    setTrial(0);
    setSaving(false);
    setStats({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 });
  };

  const goTotal =
    kindsRef.current.filter((k) => k === "go").length ||
    Math.round(TOTAL_TRIALS * (1 - NOGO_RATE));
  const accuracyPct =
    trial > 0 || phase === "done"
      ? Math.round(
          ((stats.hits + stats.correctRejections) /
            Math.max(
              1,
              stats.hits +
                stats.misses +
                stats.falseAlarms +
                stats.correctRejections,
            )) *
            100,
        )
      : null;

  return (
    <div className="rounded-2xl p-5 flex flex-col" style={panelStyle}>
      <div className="flex items-start justify-between">
        <div>
          <div
            className="text-xs tracking-[0.2em] mb-1.5 font-mono"
            style={{ color: ACCENT }}
          >
            {t.gonogo_tag}
          </div>
          <div className="text-base font-bold text-white">Go / No-Go</div>
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: `${ACCENT}2e`,
            color: ACCENT,
            border: `1px solid ${ACCENT}47`,
          }}
        >
          <ShieldAlert size={17} />
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
        {t.gonogo_hint}
      </p>

      <div className="grid grid-cols-4 gap-2 mt-4">
        <div className="text-center">
          <div className="text-[10px] text-slate-500 tracking-wider">
            {t.gonogo_trial}
          </div>
          <div className="text-sm font-bold text-white">
            {phase === "idle"
              ? `0/${TOTAL_TRIALS}`
              : `${Math.min(trial + 1, TOTAL_TRIALS)}/${TOTAL_TRIALS}`}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 tracking-wider">
            {t.gonogo_hit}
          </div>
          <div className="text-sm font-bold text-emerald-400">{stats.hits}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 tracking-wider">
            {t.gonogo_miss}
          </div>
          <div className="text-sm font-bold text-slate-300">{stats.misses}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 tracking-wider">
            {t.gonogo_false}
          </div>
          <div className="text-sm font-bold text-rose-400">
            {stats.falseAlarms}
          </div>
        </div>
      </div>

      {phase === "idle" && (
        <div
          className="mt-6 flex flex-col items-center justify-center gap-4"
          style={{ minHeight: 280 }}
        >
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-14 h-14 rounded-full"
                style={{
                  background: "rgba(var(--neuro-green-rgb),0.85)",
                  boxShadow: "0 0 24px rgba(var(--neuro-green-rgb),0.45)",
                }}
              />
              <span className="text-[11px] text-emerald-400 font-mono tracking-widest">
                {t.gonogo_go_label}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-14 h-14 rounded-lg"
                style={{
                  background: "rgba(var(--neuro-red-rgb),0.85)",
                  boxShadow: "0 0 24px rgba(var(--neuro-red-rgb),0.4)",
                }}
              />
              <span className="text-[11px] text-rose-400 font-mono tracking-widest">
                {t.gonogo_nogo_label}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-400 text-center leading-relaxed max-w-xs">
            {t.gonogo_intro_1}
            <br />
            {t.gonogo_intro_2}
          </p>
          <button
            type="button"
            onClick={startCountdown}
            className="mt-2 px-8 py-3 rounded-xl text-sm font-bold tracking-widest hover:scale-105 transition-all font-mono flex items-center gap-2"
            style={{
              background: `${ACCENT}26`,
              color: ACCENT,
              border: `1px solid ${ACCENT}66`,
            }}
          >
            <Play size={14} /> {t.gonogo_start}
          </button>
        </div>
      )}

      {phase === "countdown" && (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 280 }}
        >
          <div className="text-6xl font-bold text-white tabular-nums">
            {countdown}
          </div>
          <div className="mt-3 text-xs text-slate-500 tracking-widest font-mono">
            {t.gonogo_get_ready}
          </div>
        </div>
      )}

      {(phase === "isi" || phase === "stim") && (
        <button
          type="button"
          onClick={press}
          className="mt-6 rounded-2xl flex flex-col items-center justify-center transition-all select-none"
          style={{
            minHeight: 280,
            background:
              flash === "bad"
                ? "rgba(var(--neuro-red-rgb),0.2)"
                : flash === "ok"
                  ? "rgba(var(--neuro-green-rgb),0.12)"
                  : "rgba(var(--neuro-ink-rgb),0.75)",
            border:
              flash === "bad"
                ? "1px solid rgba(var(--neuro-red-rgb),0.7)"
                : flash === "ok"
                  ? "1px solid rgba(var(--neuro-green-rgb),0.55)"
                  : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {phase === "isi" && (
            <div className="w-3 h-3 rounded-full bg-white/20" />
          )}
          {phase === "stim" && stim === "go" && (
            <div
              className="w-28 h-28 rounded-full animate-pulse"
              style={{
                background: "rgba(var(--neuro-green-rgb),0.9)",
                boxShadow: "0 0 48px rgba(var(--neuro-green-rgb),0.55)",
              }}
            />
          )}
          {phase === "stim" && stim === "nogo" && (
            <div
              className="w-28 h-28 rounded-xl"
              style={{
                background: "rgba(var(--neuro-red-rgb),0.92)",
                boxShadow: "0 0 48px rgba(var(--neuro-red-rgb),0.5)",
              }}
            />
          )}
          <div className="mt-5 text-xs tracking-[0.2em] font-mono text-slate-400 flex items-center gap-2">
            <Hand size={12} />
            {stim === "go"
              ? t.gonogo_press_now
              : stim === "nogo"
                ? t.gonogo_hold
                : t.gonogo_wait}
          </div>
        </button>
      )}

      {phase === "done" && (
        <div
          className="mt-6 flex flex-col items-center justify-center"
          style={{ minHeight: 280 }}
        >
          <div className="text-lg font-bold text-white">
            {t.gonogo_complete}
          </div>
          <div className="mt-3 text-4xl font-bold" style={{ color: ACCENT }}>
            {accuracyPct ?? 0}%
          </div>
          <div className="mt-1 text-xs text-slate-500">{t.gonogo_accuracy}</div>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-slate-400">
            <span>
              {t.gonogo_hit}: <b className="text-emerald-400">{stats.hits}</b>/
              {goTotal}
            </span>
            <span>
              {t.gonogo_false}:{" "}
              <b className="text-rose-400">{stats.falseAlarms}</b>
            </span>
            <span>
              {t.gonogo_miss}: <b className="text-slate-300">{stats.misses}</b>
            </span>
            <span>
              {t.gonogo_reject}:{" "}
              <b className="text-sky-400">{stats.correctRejections}</b>
            </span>
          </div>
          {saving ? (
            <div className="mt-5 text-xs text-slate-500">{t.saving}</div>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="mt-5 px-6 py-2 rounded-xl text-xs font-bold tracking-widest font-mono"
              style={{
                background: `${ACCENT}1f`,
                color: ACCENT,
                border: `1px solid ${ACCENT}55`,
              }}
            >
              {t.gonogo_restart}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
