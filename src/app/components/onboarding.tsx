import { useEffect, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Play,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { useLang } from "../lib/i18n";

export const CALIBRATION_TARGET = 5;

function ProgressSegments({ played }: { played: number }) {
  const current = Math.min(CALIBRATION_TARGET, Math.max(0, played));
  return (
    <div
      className="grid grid-cols-5 gap-2"
      aria-label={`${current}/${CALIBRATION_TARGET}`}
    >
      {Array.from({ length: CALIBRATION_TARGET }, (_, index) => {
        const complete = index < current;
        return (
          <div
            key={index}
            className="h-2 rounded-full transition-all duration-500"
            style={{
              background: complete
                ? "linear-gradient(90deg, #00D4FF, #A855F7)"
                : "rgba(148,163,184,0.15)",
              boxShadow: complete
                ? "0 0 12px rgba(var(--neuro-cyan-rgb),0.4)"
                : "none",
            }}
          />
        );
      })}
    </div>
  );
}

export function OnboardingOverlay({
  username,
  played,
  onClose,
  onStart,
}: {
  username: string;
  played: number;
  onClose: () => void;
  onStart: () => void;
}) {
  const { t } = useLang();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const icons = [
    <Brain key="welcome" size={30} />,
    <Gauge key="calibration" size={30} />,
    <Target key="routine" size={30} />,
  ];
  const titles = [
    t.onboarding_welcome_title.replace("{u}", username),
    t.onboarding_calibration_title,
    t.onboarding_routine_title,
  ];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{
        background: "rgba(var(--neuro-ink-rgb),0.94)",
        backdropFilter: "blur(12px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl p-6 sm:p-8"
        style={{
          background:
            "linear-gradient(145deg, rgba(var(--neuro-panel-rgb),0.98), rgba(7,12,29,0.98))",
          border: "1px solid rgba(var(--neuro-cyan-rgb),0.25)",
          boxShadow:
            "0 30px 100px rgba(0,0,0,0.7), 0 0 60px rgba(var(--neuro-cyan-rgb),0.1)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, #00D4FF, #A855F7, transparent)",
          }}
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:text-white"
          aria-label={t.onboarding_skip}
        >
          <X size={17} />
        </button>

        <div className="mb-7 flex gap-2 pr-10">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="h-1 flex-1 rounded-full transition-all"
              style={{
                background:
                  index <= step
                    ? "linear-gradient(90deg, #00D4FF, #A855F7)"
                    : "rgba(148,163,184,0.13)",
              }}
            />
          ))}
        </div>

        <div
          className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            color: step === 1 ? "#A855F7" : "#00D4FF",
            background:
              step === 1
                ? "rgba(var(--neuro-purple-rgb),0.13)"
                : "rgba(var(--neuro-cyan-rgb),0.1)",
            border:
              step === 1
                ? "1px solid rgba(var(--neuro-purple-rgb),0.3)"
                : "1px solid rgba(var(--neuro-cyan-rgb),0.25)",
          }}
        >
          {icons[step]}
        </div>

        <p className="mb-2 text-xs font-bold tracking-[0.22em] text-neuro-cyan font-mono">
          {t.onboarding_step.replace("{n}", String(step + 1))}
        </p>
        <h2
          id="onboarding-title"
          className="text-2xl font-bold text-white sm:text-3xl"
        >
          {titles[step]}
        </h2>

        {step === 0 && (
          <div className="mt-4 space-y-4">
            <p className="leading-relaxed text-slate-300">
              {t.onboarding_welcome_body}
            </p>
            <div
              className="flex gap-3 rounded-xl p-3 text-xs leading-relaxed text-slate-400"
              style={{
                background: "rgba(var(--neuro-cyan-rgb),0.06)",
                border: "1px solid rgba(var(--neuro-cyan-rgb),0.14)",
              }}
            >
              <ShieldCheck
                size={17}
                className="mt-0.5 shrink-0 text-neuro-cyan"
              />
              {t.onboarding_disclaimer}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-4 space-y-5">
            <p className="leading-relaxed text-slate-300">
              {t.onboarding_calibration_body}
            </p>
            <div
              className="rounded-2xl p-4"
              style={{
                background: "rgba(var(--neuro-ink-rgb),0.55)",
                border: "1px solid rgba(var(--neuro-purple-rgb),0.2)",
              }}
            >
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="font-bold tracking-wider text-slate-400 font-mono">
                  {t.calibration_label}
                </span>
                <span className="font-bold text-white">
                  {Math.min(played, CALIBRATION_TARGET)}/{CALIBRATION_TARGET}
                </span>
              </div>
              <ProgressSegments played={played} />
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {t.onboarding_calibration_hint}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-4">
            <p className="leading-relaxed text-slate-300">
              {t.onboarding_routine_body}
            </p>
            <div
              className="rounded-xl p-4 text-sm leading-relaxed text-emerald-200/85"
              style={{
                background: "rgba(var(--neuro-green-rgb),0.08)",
                border: "1px solid rgba(var(--neuro-green-rgb),0.22)",
              }}
            >
              {t.onboarding_quests_note}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((value) => value - 1)}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold tracking-wider text-slate-400 transition-colors hover:text-white"
            >
              <ChevronLeft size={15} /> {t.onboarding_back}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-2 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-300"
            >
              {t.onboarding_skip}
            </button>
          )}

          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((value) => value + 1)}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-bold tracking-wider text-white transition-all hover:brightness-125"
              style={{
                background: "linear-gradient(135deg, #00A8CC, #7C3AED)",
                boxShadow: "0 0 24px rgba(var(--neuro-cyan-rgb),0.2)",
              }}
            >
              {t.onboarding_next} <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-xs font-bold tracking-wider text-white transition-all hover:brightness-125"
              style={{
                background: "linear-gradient(135deg, #10B981, #059669)",
                boxShadow: "0 0 24px rgba(var(--neuro-green-rgb),0.25)",
              }}
            >
              <Play size={15} />{" "}
              {played >= CALIBRATION_TARGET
                ? t.play_now
                : played > 0
                  ? t.onboarding_continue
                  : t.onboarding_start}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CalibrationBanner({
  played,
  completed,
  onStart,
  onDismiss,
}: {
  played: number;
  completed: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLang();
  const current = Math.min(played, CALIBRATION_TARGET);
  const remaining = Math.max(0, CALIBRATION_TARGET - current);

  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: completed
          ? "linear-gradient(135deg, rgba(var(--neuro-green-rgb),0.12), rgba(var(--neuro-panel-rgb),0.72))"
          : "linear-gradient(135deg, rgba(var(--neuro-cyan-rgb),0.09), rgba(var(--neuro-purple-rgb),0.08))",
        border: completed
          ? "1px solid rgba(var(--neuro-green-rgb),0.3)"
          : "1px solid rgba(var(--neuro-cyan-rgb),0.22)",
      }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{
            color: completed ? "#34D399" : "#00D4FF",
            background: completed
              ? "rgba(var(--neuro-green-rgb),0.12)"
              : "rgba(var(--neuro-cyan-rgb),0.1)",
          }}
        >
          {completed ? <CheckCircle2 size={23} /> : <Gauge size={23} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="font-bold text-white">
              {completed ? t.calibration_complete_title : t.calibration_title}
            </h2>
            <span className="shrink-0 text-sm font-bold text-white">
              {current}/{CALIBRATION_TARGET}
            </span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            {completed
              ? t.calibration_complete_body
              : t.calibration_remaining(remaining)}
          </p>
          <ProgressSegments played={current} />
        </div>

        <button
          type="button"
          onClick={completed ? onDismiss : onStart}
          className="h-10 shrink-0 rounded-xl px-5 text-xs font-bold tracking-wider transition-all hover:brightness-125"
          style={{
            color: completed ? "#34D399" : "#00D4FF",
            background: completed
              ? "rgba(var(--neuro-green-rgb),0.12)"
              : "rgba(var(--neuro-cyan-rgb),0.11)",
            border: completed
              ? "1px solid rgba(var(--neuro-green-rgb),0.32)"
              : "1px solid rgba(var(--neuro-cyan-rgb),0.32)",
          }}
        >
          {completed ? t.calibration_dismiss : t.calibration_play}
        </button>
      </div>
    </div>
  );
}
