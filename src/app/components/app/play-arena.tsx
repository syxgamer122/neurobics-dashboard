import type { ComponentType } from "react";
import {
  Activity,
  Brain,
  Calculator,
  ChevronRight,
  Focus,
  Grid3X3,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { RoundGame } from "../../lib/api";
import {
  GAME_BY_ID,
  GAME_REGISTRY,
  gameStageClass,
  type GameIconKey,
} from "../../lib/game-registry";
import type { Translation } from "../../lib/i18n";
import { GameTile } from "../ui/game-tile";
import { GoNoGoGame } from "../../games/go-nogo-game";
import { MathSprintGame } from "../../games/math-game";
import { MemoryMatrixGame } from "../../games/memory-game";
import { MentalRotationGame } from "../../games/mental-rotation-game";
import { NBackGame } from "../../games/nback-game";
import { ReactionTimeGame } from "../../games/reaction-game";
import { SchulteTableGame } from "../../games/schulte-game";
import { StroopGame } from "../../games/stroop-game";
import { SudokuGame } from "../../games/sudoku-game";

const GAME_ICONS: Record<GameIconKey, LucideIcon> = {
  focus: Focus,
  grid: Grid3X3,
  zap: Zap,
  activity: Activity,
  brain: Brain,
  sparkles: Sparkles,
  calculator: Calculator,
  shield: ShieldAlert,
  rotate: RotateCcw,
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
};

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
  const ActiveGame = selectedGame ? GAME_COMPONENTS[selectedGame] : null;

  return (
    <>
      <div
        className={`flex items-center gap-4 pt-1 ${selectedGame ? "max-w-lg mx-auto w-full" : ""}`}
      >
        <Zap
          size={14}
          className="text-neuro-cyan shrink-0"
          style={{ filter: "drop-shadow(0 0 6px #00D4FF)" }}
        />
        <span className="text-xs text-white tracking-[0.25em] uppercase font-mono">
          {t.arena}
        </span>
        <div
          className="flex-1 h-px"
          style={{
            background: "linear-gradient(90deg, rgba(0,212,255,0.3), transparent)",
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

      {!selectedGame && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto w-full">
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

      {selectedGame && ActiveGame && (
        <div className="w-full flex justify-center px-1 sm:px-0">
          <div className={gameStageClass(selectedGame)}>
            <ActiveGame
              onComplete={makeGameHandler(selectedGame)}
              onPlayStart={() => beginPlay(selectedGame)}
            />
          </div>
        </div>
      )}
    </>
  );
}

/** Runtime assertion used by tests/build audits. */
export function hasRegisteredGameComponent(game: RoundGame): boolean {
  return Boolean(GAME_COMPONENTS[game] && GAME_BY_ID[game]);
}
