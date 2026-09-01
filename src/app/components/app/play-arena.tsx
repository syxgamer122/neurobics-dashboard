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
import { useFeatureFlags } from "../../hooks/use-feature-flags";

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
  isAdmin,
  onSelect,
  beginPlay,
  makeGameHandler,
}: {
  selectedGame: RoundGame | null;
  t: Translation;
  isAdmin: boolean;
  onSelect: (game: RoundGame | null) => void;
  beginPlay: (game: RoundGame) => void;
  makeGameHandler: (game: RoundGame) => (telemetry: unknown) => Promise<void>;
}) {
  const [tab, setTab] = useState<"cognitive" | "arcade">("cognitive");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const { isEnabled } = useFeatureFlags();
  const ActiveGame = selectedGame ? GAME_COMPONENTS[selectedGame] : null;

  const TABS = [
    { id: "cognitive" as const, label: "LUYỆN TRÍ NÃO", icon: Brain },
    { id: "arcade" as const, label: "GIẢI TRÍ ARCADE", icon: Gamepad2 },
  ];

  const CATEGORIES = [
    { id: "all", label: "Tất cả" },
    { id: "memory", label: "Trí nhớ" },
    { id: "logic", label: "Logic & Toán" },
    { id: "speed", label: "Phản xạ & Tốc độ" },
    { id: "spatial", label: "Không gian" },
    { id: "focus", label: "Tập trung" },
  ];

  const filteredGames = GAME_REGISTRY.filter((game) => {
    const status = game.status as string;
    if (status === "disabled") return false;
    if (status === "internal" && !isAdmin) return false;
    if (!isEnabled(`game_${game.id}`) && !isAdmin) return false;

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = game.title.toLowerCase().includes(q);
      const matchTag = (t[game.tagKey] ?? "").toLowerCase().includes(q);
      const matchDesc = (t[game.descriptionKey] ?? "")
        .toLowerCase()
        .includes(q);
      if (!matchTitle && !matchTag && !matchDesc) return false;
    }

    // Filter by category
    if (selectedCategory !== "all") {
      if (
        selectedCategory === "memory" &&
        !["corsi", "memory", "nback"].includes(game.id)
      )
        return false;
      if (selectedCategory === "logic" && !["math", "sudoku"].includes(game.id))
        return false;
      if (
        selectedCategory === "speed" &&
        !["reaction", "stroop", "schulte", "trail", "search"].includes(game.id)
      )
        return false;
      if (
        selectedCategory === "spatial" &&
        !["mental", "corsi", "memory"].includes(game.id)
      )
        return false;
      if (
        selectedCategory === "focus" &&
        !["gonogo", "stroop", "search", "schulte"].includes(game.id)
      )
        return false;
    }

    return true;
  });

  return (
    <>
      {/* Header controls & tabs when no active game */}
      {!selectedGame && (
        <div className="max-w-5xl mx-auto w-full space-y-4">
          {/* Main Top Bar: Mode Tabs + Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-2 rounded-2xl border border-white/5 backdrop-blur-md">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 rounded-xl border border-white/5">
              {TABS.map((tabItem) => {
                const Icon = tabItem.icon;
                const isActive = tab === tabItem.id;
                return (
                  <button
                    key={tabItem.id}
                    type="button"
                    onClick={() => setTab(tabItem.id)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold font-mono tracking-wider transition-all duration-200"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, rgba(var(--neuro-cyan-rgb), 0.25), rgba(var(--neuro-purple-rgb), 0.25))"
                        : "transparent",
                      border: isActive
                        ? "1px solid rgba(var(--neuro-cyan-rgb), 0.4)"
                        : "1px solid transparent",
                      color: isActive ? "#ffffff" : "#94a3b8",
                      boxShadow: isActive
                        ? "0 0 16px rgba(var(--neuro-cyan-rgb), 0.2)"
                        : "none",
                    }}
                  >
                    <Icon
                      size={14}
                      className={isActive ? "text-cyan-400" : "text-slate-400"}
                    />
                    {tabItem.label}
                  </button>
                );
              })}
            </div>

            {/* Quick Search */}
            {tab === "cognitive" && (
              <div className="relative flex-1 max-w-xs flex items-center bg-slate-950/50 rounded-xl px-3 py-2 border border-white/5">
                <Search size={14} className="text-slate-500 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Tìm kiếm bài tập..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Skill Filter Chips (Cognitive tab) */}
          {tab === "cognitive" && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map((cat) => {
                const isCatActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all shrink-0 cursor-pointer"
                    style={{
                      background: isCatActive
                        ? "linear-gradient(135deg, #06b6d4, #8b5cf6)"
                        : "rgba(255,255,255,0.04)",
                      color: isCatActive ? "#ffffff" : "#94a3b8",
                      border: `1px solid ${isCatActive ? "transparent" : "rgba(255,255,255,0.08)"}`,
                      boxShadow: isCatActive
                        ? "0 4px 14px rgba(6, 182, 212, 0.3)"
                        : "none",
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Breadcrumb / Active Header */}
      {selectedGame && (
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto w-full pt-1">
          <div className="flex items-center gap-2.5">
            <Zap
              size={15}
              className="text-cyan-400 shrink-0"
              style={{ filter: "drop-shadow(0 0 6px #00D4FF)" }}
            />
            <span className="text-xs text-foreground font-bold tracking-[0.2em] uppercase font-mono">
              {t.arena}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex items-center gap-1.5 text-xs font-bold font-mono transition-colors text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-cyan-500/20"
          >
            <ChevronRight size={12} className="rotate-180" /> {t.back_to_arena}
          </button>
        </div>
      )}

      {/* Cognitive Grid */}
      {!selectedGame && tab === "cognitive" && (
        <div className="max-w-5xl mx-auto w-full">
          {filteredGames.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-mono text-xs">
              Không tìm thấy bài tập nào phù hợp từ khóa &quot;{searchQuery}
              &quot;.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 page-enter">
              {filteredGames.map((game) => {
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
        </div>
      )}

      {/* Arcade Tab */}
      {!selectedGame && tab === "arcade" && (
        <div className="max-w-5xl mx-auto w-full page-enter">
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
