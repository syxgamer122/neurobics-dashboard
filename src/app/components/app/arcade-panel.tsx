import { useState, useEffect } from "react";
import { X, Gamepad2 } from "lucide-react";

export type ArcadeGame = {
  id: string;
  title: string;
  emoji: string;
  desc: string;
  accent: string;
  accentRgb: string;
};

// eslint-disable-next-line react-refresh/only-export-components
export const ARCADE_GAMES: ArcadeGame[] = [
  {
    id: "dino",
    title: "T-Rex Runner",
    emoji: "🦕",
    desc: "Nhảy qua chướng ngại vật. Space hoặc tap để nhảy!",
    accent: "#10b981",
    accentRgb: "16,185,129",
  },
  {
    id: "flappy",
    title: "Flappy Bird",
    emoji: "🐦",
    desc: "Bay qua các cột. Bấm để đập cánh!",
    accent: "#a855f7",
    accentRgb: "168,85,247",
  },
  {
    id: "snake",
    title: "Snake",
    emoji: "🐍",
    desc: "Ăn mồi, tránh tường và thân mình. Arrow keys!",
    accent: "#00d4ff",
    accentRgb: "0,212,255",
  },
];

function ArcadeGameCard({
  game,
  onPlay,
}: {
  game: ArcadeGame;
  onPlay: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group"
      style={{
        background: `rgba(var(--neuro-panel-rgb),0.6)`,
        border: `1px solid rgba(${game.accentRgb},${hovered ? 0.5 : 0.2})`,
        boxShadow: hovered
          ? `0 0 32px rgba(${game.accentRgb},0.25), 0 8px 32px rgba(0,0,0,0.3)`
          : `0 4px 16px rgba(0,0,0,0.15)`,
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPlay(game.id)}
    >
      {/* Glow bg */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 0%, rgba(${game.accentRgb},0.12) 0%, transparent 70%)`,
        }}
      />

      <div className="relative p-6 flex flex-col items-center gap-4 text-center">
        {/* Emoji icon with glow */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-transform duration-300 group-hover:scale-110"
          style={{
            background: `rgba(${game.accentRgb},0.12)`,
            border: `1px solid rgba(${game.accentRgb},0.3)`,
            boxShadow: hovered
              ? `0 0 24px rgba(${game.accentRgb},0.4)`
              : "none",
          }}
        >
          {game.emoji}
        </div>

        <div>
          <div
            className="text-base font-bold tracking-wide mb-1"
            style={{ color: game.accent }}
          >
            {game.title}
          </div>
          <div className="text-xs text-neuro-muted leading-relaxed">
            {game.desc}
          </div>
        </div>

        <button
          type="button"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold tracking-widest transition-all duration-200 hover:brightness-125"
          style={{
            background: `rgba(${game.accentRgb},0.15)`,
            border: `1px solid rgba(${game.accentRgb},0.4)`,
            color: game.accent,
            boxShadow: `0 0 12px rgba(${game.accentRgb},0.2)`,
          }}
        >
          <Gamepad2 size={13} />
          CHƠI NGAY
        </button>
      </div>
    </div>
  );
}

function ArcadeModal({
  game,
  onClose,
}: {
  game: ArcadeGame;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "EXIT_GAME") {
        onClose();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onClose]);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[70] flex flex-col animate-[fadeIn_0.2s_ease-out] h-[100dvh]"
      style={{ background: "rgba(0,0,0,0.95)" }}
    >
      {/* Topbar */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          borderBottom: `1px solid rgba(${game.accentRgb},0.2)`,
          background: `rgba(var(--neuro-panel-rgb),0.8)`,
        }}
      >
        <span className="text-xl">{game.emoji}</span>
        <span
          className="text-sm font-bold tracking-wider font-mono"
          style={{ color: game.accent }}
        >
          {game.title.toUpperCase()}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors text-neuro-muted hover:text-foreground"
          style={{
            background: `rgba(${game.accentRgb},0.1)`,
            border: `1px solid rgba(${game.accentRgb},0.2)`,
          }}
          aria-label="Đóng game"
        >
          <X size={16} />
        </button>
      </div>

      {/* iframe */}
      <iframe
        src={`/arcade/${game.id}.html?v=2`}
        title={game.title}
        className="flex-1 w-full border-0"
        allow="autoplay"
      />
    </div>
  );
}

export function ArcadePanel() {
  const [activeGame, setActiveGame] = useState<ArcadeGame | null>(null);

  return (
    <>
      <div className="max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
            style={{
              background: "rgba(168,85,247,0.15)",
              border: "1px solid rgba(168,85,247,0.3)",
            }}
          >
            🕹️
          </div>
          <div>
            <div className="text-sm font-bold text-foreground">Arcade Zone</div>
            <div className="text-xs text-neuro-muted">
              Game giải trí · Không cần internet
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {ARCADE_GAMES.map((game) => (
            <ArcadeGameCard
              key={game.id}
              game={game}
              onPlay={(id) =>
                setActiveGame(ARCADE_GAMES.find((g) => g.id === id) ?? null)
              }
            />
          ))}
        </div>
      </div>

      {activeGame && (
        <ArcadeModal game={activeGame} onClose={() => setActiveGame(null)} />
      )}
    </>
  );
}
