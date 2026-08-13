import { useEffect, useRef, useState } from "react";
import {
  readIntStorage,
  writeBestHigher,
  useOnHidden,
} from "../lib/game-utils";

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
  offsetY: number;
  collected: boolean;
};

export function FlappyGame({
  onGameOver,
}: {
  onGameOver?: (score: number) => void;
}) {
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() =>
    readIntStorage("flappyBest", 0),
  );
  const [gameState, setGameState] = useState<
    "idle" | "playing" | "dead" | "paused"
  >("idle");
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const scoreRef = useRef(score);
  scoreRef.current = score;
  const scoreSpanRef = useRef<HTMLSpanElement>(null);

  const bestScoreRef = useRef(bestScore);
  bestScoreRef.current = bestScore;

  useOnHidden(() => {
    if (gameStateRef.current === "playing") {
      gameStateRef.current = "paused";
      setGameState("paused");
    }
  });

  // Mutable game state
  const state = useRef({
    bird: { x: 0, y: 0, vy: 0, r: 18, rot: 0 },
    pipes: [] as Pipe[],
    particles: [] as Particle[],
    collectStars: [] as Star[],
    frame: 0,
    score: 0,
    spawnIn: 60,
  });

  const initGame = (W: number, H: number) => {
    state.current = {
      bird: { x: W * 0.28, y: H / 2, vy: 0, r: 18, rot: 0 },
      pipes: [],
      particles: [],
      collectStars: [],
      frame: 0,
      score: 0,
      spawnIn: 60,
    };
    setScore(0);
  };

  const handleFlap = () => {
    if (gameStateRef.current === "dead" || gameStateRef.current === "paused")
      return;
    if (gameStateRef.current === "idle") {
      gameStateRef.current = "playing";
      setGameState("playing");
      const gs = state.current;
      gs.pipes = [];
      gs.particles = [];
      gs.collectStars = [];
      gs.frame = 0;
      gs.score = 0;
      gs.bird.y = canvasRef.current ? canvasRef.current.clientHeight / 2 : 300;
      gs.bird.vy = 0;
      gs.bird.rot = 0;
      if (scoreSpanRef.current) scoreSpanRef.current.innerText = "0";
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
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (gameStateRef.current === "paused") {
          gameStateRef.current = "playing";
          setGameState("playing");
          return;
        }
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
    let lastTime: number | null = null;
    
    let W = Math.min(window.innerWidth, 420);
    let H = Math.min(window.innerHeight, 620);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    const updateCanvasSize = () => {
      const newW = Math.min(window.innerWidth, 420);
      const newH = Math.min(window.innerHeight, 620);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      
      const gs = state.current;
      const oldH = H || newH;
      const ratio = newH / oldH;
      
      W = newW;
      H = newH;
      
      if (ratio !== 1 && gs.pipes.length > 0) {
        gs.bird.y *= ratio;
        gs.pipes.forEach((p) => {
          p.topH *= ratio;
          p.initialTopH *= ratio;
        });
        gs.collectStars.forEach((s) => {
          s.y *= ratio;
          s.offsetY *= ratio;
        });
      }

      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.scale(dpr, dpr);
    };
    
    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    window.addEventListener("orientationchange", updateCanvasSize);

    initGame(W, H);

    const spawnPipe = () => {
      const gs = state.current;
      const minY = 80;
      const maxY = H - GAP - 80;
      const topH = Math.random() * (maxY - minY) + minY;
      let vy = 0;
      if (gs.score > 10 && Math.random() < 0.3) {
        vy = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random());
      }
      gs.pipes.push({
        x: W + PIPE_W,
        topH,
        passed: false,
        vy,
        initialTopH: topH,
      });

      if (Math.random() < 0.4) {
        gs.collectStars.push({
          x: W + PIPE_W + 100 + Math.random() * 50,
          y: topH + GAP / 2, // will be updated if pipe moves
          offsetY: (Math.random() - 0.5) * (GAP - 60), // relative to gap center
          collected: false,
        });
      }
    };

    const drawBird = () => {
      const { bird } = state.current;
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate(bird.rot);

      const glow = "rgba(245,158,11,0.3)";
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, bird.r + 8, 0, Math.PI * 2);
      ctx.fill();

      const grad = "#f59e0b";
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
      const tg = bodyColor;
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

    const drawBg = (timeScaleForBg: number) => {
      const { frame } = state.current;
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0f0a1e");
      grad.addColorStop(0.5, "#1e1b4b");
      grad.addColorStop(1, "#0c0a1a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "rgba(196,181,253,0.5)";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137 + frame * 0.05 * timeScaleForBg) % W;
        const sy = (i * 73) % (H * 0.6);
        const ss = 0.5 + (i % 3) * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,255,255,0.03)";
      for (let i = 0; i < 4; i++) {
        const cx =
          ((((i * 200 - frame * 0.4 * timeScaleForBg) % (W + 200)) + W + 200) %
            (W + 200)) -
          100;
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

    const die = () => {
      gameStateRef.current = "dead";
      setGameState("dead");
      const gs = state.current;
      setScore(gs.score);
      writeBestHigher("flappyBest", gs.score);
      setBestScore((prev) => Math.max(prev, gs.score));
      if (onGameOverRef.current) onGameOverRef.current(gs.score);
    };

    const STEP_MS = 1000 / 60;
    const MAX_STEPS = 5;
    let acc = 0;

    const step = () => {
      const gs = state.current;
      gs.frame += 1;
      gs.bird.vy += GRAV;
      gs.bird.y += gs.bird.vy;
      gs.bird.rot = Math.max(-0.5, Math.min(1.2, gs.bird.vy * 0.06));

      gs.spawnIn -= 1;
      if (gs.spawnIn <= 0) {
        spawnPipe();
        gs.spawnIn = 90;
      }

      for (let i = gs.pipes.length - 1; i >= 0; i--) {
        const p = gs.pipes[i];
        p.x -= 3;
        if (p.vy) {
          p.topH += p.vy;
          if (Math.abs(p.topH - p.initialTopH) > 40) p.vy *= -1;
        }
        if (!p.passed && p.x + PIPE_W < gs.bird.x) {
          p.passed = true;
          gs.score++;
          if (scoreSpanRef.current)
            scoreSpanRef.current.textContent = gs.score.toString();
        }
        if (p.x + PIPE_W < 0) gs.pipes.splice(i, 1);
      }

      for (let i = gs.collectStars.length - 1; i >= 0; i--) {
        const s = gs.collectStars[i];
        s.x -= 3;

        // Try to bind star Y to the nearest pipe to left so it bobs with the gap
        const closestPipe = gs.pipes.find(
          (p) => p.x < s.x + 100 && p.x > s.x - PIPE_W * 2,
        );
        if (closestPipe) {
          s.y = closestPipe.topH + GAP / 2 + s.offsetY;
        }

        if (!s.collected) {
          const dx = gs.bird.x - s.x;
          const dy = gs.bird.y - s.y;
          if (Math.sqrt(dx * dx + dy * dy) < gs.bird.r + 12) {
            s.collected = true;
            gs.score += 3;
            if (scoreSpanRef.current)
              scoreSpanRef.current.textContent = gs.score.toString();
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
        }
      }

      if (checkCollision()) {
        die();
        return;
      }
    };

    const loop = (timestamp: number) => {
      if (lastTime === null) lastTime = timestamp;
      const frameMs = Math.min(timestamp - lastTime, 50); // cap 50ms
      lastTime = timestamp;
      const timeScaleForBg = frameMs / 16.666;

      ctx.clearRect(0, 0, W, H);
      drawBg(timeScaleForBg);
      const currentGameState = gameStateRef.current;
      const gs = state.current;

      if (currentGameState === "playing") {
        acc += frameMs;
        let steps = 0;
        while (acc >= STEP_MS && steps < MAX_STEPS) {
          step();
          acc -= STEP_MS;
          steps += 1;
          if (gameStateRef.current !== "playing") break;
        }
        if (steps >= MAX_STEPS) acc = 0;
      } else {
        acc = 0;
      }

      if (currentGameState === "idle") {
        gs.bird.y = H / 2 + Math.sin(Date.now() / 500) * 8;
        gs.bird.rot = 0;
        gs.pipes.forEach((p) => drawPipe(p));
      } else if (
        currentGameState === "dead" ||
        currentGameState === "paused" ||
        currentGameState === "playing"
      ) {
        gs.pipes.forEach((p) => drawPipe(p));

        for (const s of gs.collectStars) {
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
          }
        }

        for (const p of gs.particles) {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      drawBird();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      window.removeEventListener("orientationchange", updateCanvasSize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className="relative w-full h-full bg-[#0c0a1a] flex items-center justify-center overflow-hidden touch-none select-none"
      onPointerDown={(e) => {
        e.preventDefault();
        handleFlap();
      }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full max-w-[420px] object-cover"
      />

      {/* Score */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-[#1e1b4b]/90 border border-purple-500/40 px-4 py-1.5 rounded-full flex items-center gap-2 pointer-events-none">
        <span className="text-xl">🌟</span>
        <span
          ref={scoreSpanRef}
          className="text-amber-500 font-mono text-xl font-bold tracking-widest"
        >
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

      {gameState === "paused" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/50 backdrop-blur-sm"
          onClick={() => {
            gameStateRef.current = "playing";
            setGameState("playing");
          }}
        >
          <h2 className="text-3xl font-bold text-white mb-2 tracking-widest drop-shadow-md">
            PAUSED
          </h2>
          <p className="text-amber-400 font-mono tracking-widest animate-pulse">
            TAP TO RESUME
          </p>
        </div>
      )}

      {gameState === "dead" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/60 animate-[fadeIn_0.2s]">
          <h2 className="text-3xl font-bold text-rose-500 mb-2">GAME OVER</h2>
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
