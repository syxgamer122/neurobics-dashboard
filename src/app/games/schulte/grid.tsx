import { Check, X } from "lucide-react";
import { useLang } from "../../lib/i18n";
import type {
  SchulteCell,
  SchulteFlash,
  SchulteGameStatus,
  SchulteSize,
} from "./model";

export function SchulteGrid({
  grid,
  size,
  showCenter,
  flashCell,
  foundSet,
  status,
  onCellClick,
}: {
  grid: SchulteCell[];
  size: SchulteSize;
  showCenter: boolean;
  flashCell: SchulteFlash;
  foundSet: ReadonlySet<number>;
  status: SchulteGameStatus;
  onCellClick: (cell: SchulteCell, index: number) => void | Promise<void>;
}) {
  const { t } = useLang();

  return (
    <>
      {/* Grid */}
      <div
        className="mt-4 relative mx-auto w-full"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: size >= 6 ? 4 : 5,
          maxWidth: size <= 3 ? 280 : size === 4 ? 340 : 420,
        }}
      >
        {/* Center fixation crosshair */}
        {showCenter && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            <div style={{ position: "relative", width: 24, height: 24 }}>
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "rgba(168,85,247,0.45)",
                  transform: "translateY(-50%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "rgba(168,85,247,0.45)",
                  transform: "translateX(-50%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#A855F7",
                  boxShadow:
                    "0 0 10px rgba(168,85,247,0.9), 0 0 20px rgba(168,85,247,0.4)",
                }}
              />
            </div>
          </div>
        )}

        {grid.map((cell, idx) => {
          const isFlash = flashCell?.idx === idx;
          const isDone = foundSet.has(idx);
          const isRed = cell.color === "red";

          return (
            <button
              key={idx}
              onClick={() => onCellClick(cell, idx)}
              disabled={status === "done" || isDone}
              className="rounded-xl font-bold flex items-center justify-center select-none transition-all duration-[120ms]"
              style={{
                position: "relative",
                aspectRatio: "1",
                fontSize:
                  size === 6 ? 12 : size === 3 ? 22 : size === 4 ? 18 : 15,
                background: isFlash
                  ? flashCell!.ok
                    ? "rgba(16,185,129,0.32)"
                    : "rgba(244,63,94,0.25)"
                  : isDone
                    ? "rgba(168,85,247,0.06)"
                    : "rgba(255,255,255,0.04)",
                color: isFlash
                  ? flashCell!.ok
                    ? "#10B981"
                    : "#F43F5E"
                  : isDone
                    ? "#10B981"
                    : isRed
                      ? "#F97316"
                      : "#e2e8f0",
                border: isFlash
                  ? `1px solid ${flashCell!.ok ? "rgba(16,185,129,0.55)" : "rgba(244,63,94,0.5)"}`
                  : isDone
                    ? "1px solid rgba(16,185,129,0.25)"
                    : isRed
                      ? "1px solid rgba(249,115,22,0.22)"
                      : "1px solid rgba(255,255,255,0.07)",
                boxShadow:
                  isFlash && flashCell!.ok
                    ? "0 0 18px rgba(16,185,129,0.42)"
                    : isDone
                      ? "0 0 8px rgba(16,185,129,0.12)"
                      : undefined,
                transform: isFlash
                  ? flashCell!.ok
                    ? "scale(0.88)"
                    : "scale(0.96)"
                  : "scale(1)",
                opacity: isDone ? 0.45 : 1,
                cursor: status === "done" || isDone ? "default" : "pointer",
              }}
            >
              {isFlash && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    lineHeight: 0,
                  }}
                >
                  {flashCell!.ok ? (
                    <Check
                      size={11}
                      aria-label={t.answer_correct ?? "Correct"}
                      style={{ color: "#10B981" }}
                    />
                  ) : (
                    <X
                      size={11}
                      aria-label={t.answer_wrong ?? "Wrong"}
                      style={{ color: "#F43F5E" }}
                    />
                  )}
                </span>
              )}
              {cell.value}
            </button>
          );
        })}
      </div>
    </>
  );
}
