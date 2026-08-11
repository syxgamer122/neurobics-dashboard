import { useEffect, useRef, useState } from "react";

const PIPE_W = 52;
const GAP = 160;
const GRAV = 0.45;
const FLAP = -8;

type Pipe = {
  x: number;
  topH: number;
  passed: boolean;
  vy: number;
  initialTopH: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type Star = {
  x: number;
  y: number;
  collected: boolean;
};

export function FlappyGame({
  onGameOver,
}: {
  onGameOver?: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("flappyBest") || "0");
  });
  const [gameState, setGameState] = useState<"idle" | "playing" | "dead">(
    "idle",
  );
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const scoreRef = useRef(0);
  scoreRef.current = score;

  const bestScoreRef = useRef(bestScore);
  bestScoreRef.current = bestScore;

  // Mutable game state
  const state = useRef({
    bird: { x: 0, y: 0, vy: 0, r: 18, rot: 0 },
    pipes: [] as Pipe[],
    particles: [] as Particle[],
    collectStars: [] as Star[],
    frame: 0,
  });

  const initGame = (W: number, H: number) => {
    state.current = {
      bird: { x: W * 0.28, y: H / 2, vy: 0, r: 18, rot: 0 },
      pipes: [],
      particles: [],
      collectStars: [],
      frame: 0,
    };
    setScore(0);
  };

  const handleFlap = () => {
    if (gameStateRef.current === "dead") return;
    if (gameStateRef.current === "idle") {
      setGameState("playing");
    }
    const { bird, particles } = state.current;
    bird.vy = FLAP;
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: bird.x,
        y: bird.y + bird.r,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 2 + 1,
        life: 1,
        color: Math.random() > 0.5 ? "#f59e0b" : "#fbbf24",
      });
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleFlap();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    const W = Math.min(window.innerWidth, 420);
    const H = Math.min(window.innerHeight, 620);
    canvas.width = W;
    canvas.height = H;

    initGame(W, H);

    const spawnPipe = () => {
      const minY = 80;
      const maxY = H - GAP - 80;
      const topH = Math.random() * (maxY - minY) + minY;
      let vy = 0;
      if (scoreRef.current > 10 && Math.random() < 0.3) {
        vy = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random());
      }
      state.current.pipes.push({
        x: W + PIPE_W,
        topH,
        passed: false,
        vy,
        initialTopH: topH,
      });

      if (Math.random() < 0.4) {
        state.current.collectStars.push({
          x: W + PIPE_W + 100 + Math.random() * 50,
          y: Math.random() * (H - 150) + 75,
          collected: false,
        });
      }
    };

    const drawBird = () => {
      const { bird } = state.current;
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate(bird.rot);

      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, bird.r + 8);
      glow.addColorStop(0, "rgba(245,158,11,0.3)");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, bird.r + 8, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, bird.r);
      grad.addColorStop(0, "#fde68a");
      grad.addColorStop(1, "#f59e0b");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#d97706";
      ctx.beginPath();
      ctx.ellipse(-4, 4, 12, 6, 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(8, -5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(9, -6, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(bird.r - 2, -2);
      ctx.lineTo(bird.r + 10, 0);
      ctx.lineTo(bird.r - 2, 4);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawPipe = (p: Pipe) => {
      const accentColor = "#10b981";
      const bodyColor = "#059669";
      const tg = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      tg.addColorStop(0, "#065f46");
      tg.addColorStop(0.5, bodyColor);
      tg.addColorStop(1, "#064e3b");
      ctx.fillStyle = tg;
      ctx.fillRect(p.x, 0, PIPE_W, p.topH);
      ctx.fillStyle = accentColor;
      ctx.fillRect(p.x - 5, p.topH - 20, PIPE_W + 10, 20);
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 5, p.topH - 20, PIPE_W + 10, 20);

      const botY = p.topH + GAP;
      ctx.fillStyle = tg;
      ctx.fillRect(p.x, botY, PIPE_W, H - botY);
      ctx.fillStyle = accentColor;
      ctx.fillRect(p.x - 5, botY, PIPE_W + 10, 20);
      ctx.strokeStyle = "#34d399";
      ctx.strokeRect(p.x - 5, botY, PIPE_W + 10, 20);
    };

    const drawBg = () => {
      const { frame } = state.current;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0f0a1e");
      grad.addColorStop(0.5, "#1e1b4b");
      grad.addColorStop(1, "#0c0a1a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(196,181,253,0.5)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137 + frame * 0.05) % W;
        const sy = (i * 73) % (H * 0.6);
        const ss = 0.5 + (i % 3) * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let i = 0; i < 4; i++) {
        const cx =
          ((((i * 200 - frame * 0.4) % (W + 200)) + W + 200) % (W + 200)) - 100;
        const cy = 100 + (i % 3) * 80;
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI * 2);
        ctx.arc(cx + 30, cy - 10, 50, 0, Math.PI * 2);
        ctx.arc(cx + 60, cy, 40, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const checkCollision = () => {
      const { bird, pipes } = state.current;
      if (bird.y - bird.r <= 0 || bird.y + bird.r >= H) return true;
      for (const p of pipes) {
        if (bird.x + bird.r - 8 > p.x && bird.x - bird.r + 8 < p.x + PIPE_W) {
          if (
            bird.y - bird.r + 8 < p.topH ||
            bird.y + bird.r - 8 > p.topH + GAP
          )
            return true;
        }
      }
      return false;
    };

    const loop = () => {
      drawBg();
      const currentGameState = gameStateRef.current;
      const gs = state.current;

      if (currentGameState === "playing") {
        gs.frame++;
        gs.bird.vy += GRAV;
        gs.bird.y += gs.bird.vy;
        gs.bird.rot = Math.max(-0.5, Math.min(1.2, gs.bird.vy * 0.06));

        if (gs.frame % 90 === 0) spawnPipe();

        for (let i = gs.pipes.length - 1; i >= 0; i--) {
          gs.pipes[i].x -= 3;
          if (gs.pipes[i].vy) {
            gs.pipes[i].topH += gs.pipes[i].vy;
            if (Math.abs(gs.pipes[i].topH - gs.pipes[i].initialTopH) > 40)
              gs.pipes[i].vy *= -1;
          }
          drawPipe(gs.pipes[i]);
          if (!gs.pipes[i].passed && gs.pipes[i].x + PIPE_W < gs.bird.x) {
            gs.pipes[i].passed = true;
            setScore((s) => s + 1);
          }
          if (gs.pipes[i].x + PIPE_W < 0) gs.pipes.splice(i, 1);
        }

        for (let i = gs.collectStars.length - 1; i >= 0; i--) {
          const s = gs.collectStars[i];
          s.x -= 3;
          if (!s.collected) {
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(gs.frame * 0.05);
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            for (let j = 0; j < 5; j++) {
              ctx.lineTo(
                Math.cos(((18 + j * 72) * Math.PI) / 180) * 12,
                -Math.sin(((18 + j * 72) * Math.PI) / 180) * 12,
              );
              ctx.lineTo(
                Math.cos(((54 + j * 72) * Math.PI) / 180) * 6,
                -Math.sin(((54 + j * 72) * Math.PI) / 180) * 6,
              );
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            const dx = gs.bird.x - s.x;
            const dy = gs.bird.y - s.y;
            if (Math.sqrt(dx * dx + dy * dy) < gs.bird.r + 12) {
              s.collected = true;
              setScore((sc) => sc + 3);
              for (let k = 0; k < 10; k++) {
                gs.particles.push({
                  x: s.x,
                  y: s.y,
                  vx: (Math.random() - 0.5) * 5,
                  vy: (Math.random() - 0.5) * 5,
                  life: 1,
                  color: "#fbbf24",
                });
              }
            }
          }
          if (s.x < -20 || s.collected) gs.collectStars.splice(i, 1);
        }

        for (let i = gs.particles.length - 1; i >= 0; i--) {
          const p = gs.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.06;
          if (p.life <= 0) {
            gs.particles.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        if (checkCollision()) {
          setGameState("dead");
          const finalScore = scoreRef.current;
          let currentBest = bestScoreRef.current;
          if (finalScore > currentBest) {
            currentBest = finalScore;
            setBestScore(finalScore);
            localStorage.setItem("flappyBest", finalScore.toString());
          }
          if (onGameOver) onGameOver(finalScore);
        }
      } else if (currentGameState === "idle") {
        gs.bird.y = H / 2 + Math.sin(Date.now() / 500) * 8;
        gs.bird.rot = 0;
        gs.pipes.forEach((p) => drawPipe(p));
      } else if (currentGameState === "dead") {
        gs.pipes.forEach((p) => drawPipe(p));
      }

      drawBird();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [onGameOver]);

  return (
    <div
      className="relative w-full h-full bg-[#0c0a1a] flex items-center justify-center overflow-hidden touch-none select-none"
      onPointerDown={handleFlap}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full max-w-[420px] object-cover"
      />

      {/* Score */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-[#1e1b4b]/80 border border-purple-500/40 px-4 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-sm pointer-events-none shadow-[0_0_20px_rgba(168,85,247,0.3)]">
        <span className="text-xl">🌟</span>
        <span className="text-amber-500 font-mono text-xl font-bold tracking-widest drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">
          {score}
        </span>
      </div>

      {/* Overlays */}
      {gameState === "idle" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto"
          onClick={handleFlap}
        >
          <h2 className="text-3xl font-bold text-white mb-2 tracking-widest drop-shadow-md">
            FLAPPY BIRD
          </h2>
          <p className="text-amber-400 font-mono tracking-widest animate-pulse">
            TAP / SPACE TO START
          </p>
        </div>
      )}

      {gameState === "dead" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s]">
          <h2 className="text-3xl font-bold text-rose-500 mb-2 drop-shadow-[0_0_12px_rgba(225,29,72,0.5)]">
            GAME OVER
          </h2>
          <p className="text-white/80 font-mono mb-4 text-lg">SCORE: {score}</p>
          <p className="text-white/60 font-mono mb-8 text-sm">
            BEST: {bestScore}
          </p>
          <button
            onClick={() => {
              setGameState("idle");
              setScore(0);
            }}
            className="px-6 py-3 bg-purple-500/20 border border-purple-500 text-purple-400 rounded-xl font-mono tracking-widest hover:bg-purple-500/40 hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] transition-all"
          >
            {"PLAY AGAIN"}
          </button>
        </div>
      )}
    </div>
  );
}
