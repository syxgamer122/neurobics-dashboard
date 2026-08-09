import { useState } from "react";
import { Suspense, lazy, type ComponentType } from "react";
import {
  Activity,
  Blocks,
  Brain,
  Calculator,
  ChevronRight,
  Focus,
  Grid3X3,
  Loader2,
  RotateCcw,
  Route,
  ShieldAlert,
  Sparkles,
  Zap,
  Search,
  Gamepad2,
  type LucideIcon,
} from "lucide-react";
import type { RoundGame } from "../../lib/api";
import {
  GAME_REGISTRY,
  gameStageClass,
  type GameIconKey,
} from "../../lib/game-registry";
import type { Translation } from "../../lib/i18n";
import { ErrorBoundary } from "../error-boundary";
import { GameTile } from "../ui/game-tile";
import { ArcadePanel } from "./arcade-panel";
// ─── Chunk rieng cho tung game ────────────────────────────────────
// TRUOC DAY 11 game duoc import tinh, nen ca 11 nam trong bundle DAU TIEN:
// nguoi chi choi Schulte van phai tai Sudoku, Mental Rotation, N-Back...
// truoc khi thay man hinh dau tien. Tren 4G do la vai giay chet.
//
// GIO moi game la mot chunk rieng, chi tai dung luc nguoi dung bam vao o do.
// Cac game export theo TEN (khong phai default) nen phai anh xa sang `default`
// cho React.lazy hieu.
const CorsiBlockGame = lazy(() =>
  import("../../games/corsi-game").then((m) => ({ default: m.CorsiBlockGame })),
);
const GoNoGoGame = lazy(() =>
  import("../../games/go-nogo-game").then((m) => ({ default: m.GoNoGoGame })),
);
const MathSprintGame = lazy(() =>
  import("../../games/math-game").then((m) => ({ default: m.MathSprintGame })),
);
const MemoryMatrixGame = lazy(() =>
  import("../../games/memory-game").then((m) => ({
    default: m.MemoryMatrixGame,
  })),
);
const MentalRotationGame = lazy(() =>
  import("../../games/mental-rotation-game").then((m) => ({
    default: m.MentalRotationGame,
  })),
);
const NBackGame = lazy(() =>
  import("../../games/nback-game").then((m) => ({ default: m.NBackGame })),
);
const ReactionTimeGame = lazy(() =>
  import("../../games/reaction-game").then((m) => ({
    default: m.ReactionTimeGame,
  })),
);
const SchulteTableGame = lazy(() =>
  import("../../games/schulte-game").then((m) => ({
    default: m.SchulteTableGame,
  })),
);
const StroopGame = lazy(() =>
  import("../../games/stroop-game").then((m) => ({ default: m.StroopGame })),
);
const SudokuGame = lazy(() =>
  import("../../games/sudoku-game").then((m) => ({ default: m.SudokuGame })),
);
const TrailMakingGame = lazy(() =>
  import("../../games/trail-game").then((m) => ({
    default: m.TrailMakingGame,
  })),
);
const VisualSearchGame = lazy(() =>
  import("../../games/search-game").then((m) => ({
    default: m.VisualSearchGame,
  })),
);

const GAME_ICONS: Record<GameIconKey, LucideIcon> = {
  focus: Focus,
  grid: Grid3X3,
  zap: Zap,
  search: Search,
  activity: Activity,
  brain: Brain,
  sparkles: Sparkles,
  calculator: Calculator,
  shield: ShieldAlert,
  rotate: RotateCcw,
  blocks: Blocks,
  route: Route,
};

type RegistryGameProps = {
  onComplete: (telemetry: unknown) => Promise<void>;
  onPlayStart: () => void;
};

/**
 * UI adapter registry. Game components keep their strongly typed telemetry,
 * while the arena renders one canonical component lookup instead of 9 branches.
 */
const GAME_COMPONENTS: Record<RoundGame, ComponentType<RegistryGameProps>> = {
  schulte: ({ onComplete, onPlayStart }) => (
    <SchulteTableGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  sudoku: ({ onComplete, onPlayStart }) => (
    <SudokuGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  stroop: ({ onComplete, onPlayStart }) => (
    <StroopGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  reaction: ({ onComplete, onPlayStart }) => (
    <ReactionTimeGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  memory: ({ onComplete, onPlayStart }) => (
    <MemoryMatrixGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  nback: ({ onComplete, onPlayStart }) => (
    <NBackGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  math: ({ onComplete, onPlayStart }) => (
    <MathSprintGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  gonogo: ({ onComplete, onPlayStart }) => (
    <GoNoGoGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  mental: ({ onComplete, onPlayStart }) => (
    <MentalRotationGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  corsi: ({ onComplete, onPlayStart }) => (
    <CorsiBlockGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  trail: ({ onComplete, onPlayStart }) => (
    <TrailMakingGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
  search: ({ onComplete, onPlayStart }) => (
    <VisualSearchGame onComplete={onComplete} onPlayStart={onPlayStart} />
  ),
};

/**
 * Khung cho trong khi chunk cua game dang tai. Giu chieu cao toi thieu de
 * layout khong nhay mot cai khi game xuat hien.
 */
function GameChunkFallback() {
  return (
    <div className="flex min-h-[320px] w-full items-center justify-center">
      <Loader2 size={24} className="animate-spin text-neuro-cyan" />
    </div>
  );
}

export function PlayArena({
  selectedGame,
  t,
  onSelect,
  beginPlay,
  makeGameHandler,
}: {
  selectedGame: RoundGame | null;
  t: Translation;
  onSelect: (game: RoundGame | null) => void;
  beginPlay: (game: RoundGame) => void;
  makeGameHandler: (game: RoundGame) => (telemetry: unknown) => Promise<void>;
}) {
  const [tab, setTab] = useState<"cognitive" | "arcade">("cognitive");
  const ActiveGame = selectedGame ? GAME_COMPONENTS[selectedGame] : null;

  const TABS = [
    { id: "cognitive" as const, label: "Game Nhận Thức", icon: Brain },
    { id: "arcade" as const, label: "Arcade", icon: Gamepad2 },
  ];

  return (
    <>
      {/* Tab switcher — chỉ hiện khi chưa chọn game nhận thức */}
      {!selectedGame && (
        <div className="flex gap-2 max-w-4xl mx-auto w-full">
          {TABS.map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = tab === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => setTab(tabItem.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-widest transition-all duration-200"
                style={{
                  background: isActive
                    ? "rgba(var(--neuro-cyan-rgb),0.15)"
                    : "rgba(var(--neuro-panel-rgb),0.5)",
                  border: isActive
                    ? "1px solid rgba(var(--neuro-cyan-rgb),0.45)"
                    : "1px solid rgba(var(--neuro-panel-rgb),0.6)",
                  color: isActive ? "var(--neuro-cyan)" : "var(--neuro-muted)",
                  boxShadow: isActive
                    ? "0 0 16px rgba(var(--neuro-cyan-rgb),0.2)"
                    : "none",
                }}
              >
                <Icon size={13} />
                {tabItem.label}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="flex items-center gap-4 pt-1"
        style={{ maxWidth: selectedGame ? undefined : undefined }}
      >
        <Zap
          size={14}
          className="text-neuro-cyan shrink-0"
          style={{ filter: "drop-shadow(0 0 6px #00D4FF)" }}
        />
        <span className="text-xs text-foreground tracking-[0.25em] uppercase font-mono">
          {t.arena}
        </span>
        <div
          className="flex-1 h-px"
          style={{
            background:
              "linear-gradient(90deg, rgba(var(--neuro-cyan-rgb),0.3), transparent)",
          }}
        />
        {selectedGame && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "#00D4FF" }}
          >
            <ChevronRight size={12} className="rotate-180" /> {t.back_to_arena}
          </button>
        )}
      </div>

      {!selectedGame && tab === "cognitive" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto w-full page-enter">
          {GAME_REGISTRY.map((game) => {
            const Icon = GAME_ICONS[game.icon];
            return (
              <GameTile
                key={game.id}
                accent={game.accent}
                icon={<Icon size={22} />}
                tag={t[game.tagKey]}
                title={game.title}
                desc={t[game.descriptionKey]}
                playLabel={t.play_now}
                onPlay={() => onSelect(game.id)}
              />
            );
          })}
        </div>
      )}

      {!selectedGame && tab === "arcade" && (
        <div className="page-enter">
          <ArcadePanel />
        </div>
      )}

      {selectedGame && ActiveGame && (
        <div className="w-full flex justify-center px-1 sm:px-0">
          <div className={gameStageClass(selectedGame)}>
            {/* Boundary NAM NGOAI Suspense de bat duoc ca hai loai su co:
                (1) game nem loi luc dang choi,
                (2) chunk cua game tai that bai (rot mang, hoac file cu da bi
                    xoa sau khi deploy ban moi).
                `key` doi theo game -> doi sang game khac la boundary moi, khong
                bi dinh trang thai loi cua game truoc. */}
            <ErrorBoundary
              key={selectedGame}
              area={`game:${selectedGame}`}
              variant="inline"
            >
              <Suspense fallback={<GameChunkFallback />}>
                <ActiveGame
                  onComplete={makeGameHandler(selectedGame)}
                  onPlayStart={() => beginPlay(selectedGame)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>
      )}
    </>
  );
}
