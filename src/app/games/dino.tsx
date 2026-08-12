import { useEffect, useRef, useState } from "react";

type Obstacle = {
  x: number;
  w: number;
  h: number;
  yOffset: number;
  type: "bird" | "cactus";
  frameOffset?: number;
};

type Cloud = {
  x: number;
  y: number;
  w: number;
};

export function DinoGame({
  onGameOver,
}: {
  onGameOver?: (score: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("dinoBest") || "0");
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
    GND: 0,
    speed: 4,
    frame: 0,
    dino: {
      x: 80,
      y: 0,
      w: 40,
      h: 50,
      normalH: 50,
      duckH: 25,
      vy: 0,
      onGround: true,
      ducking: false,
    },
    obstacles: [] as Obstacle[],
    clouds: [] as Cloud[],
    W: 800,
    H: 300,
    score: 0,
  });

  const initGame = (W: number, H: number) => {
    const GND = H - 60;
    state.current = {
      GND,
      speed: 4,
      frame: 0,
      dino: {
        x: 80,
        y: GND,
        w: 40,
        h: 50,
        normalH: 50,
        duckH: 25,
        vy: 0,
        onGround: true,
        ducking: false,
      },
      obstacles: [],
      clouds: [
        { x: W * 0.3, y: 40, w: 80 },
        { x: W * 0.7, y: 25, w: 60 },
      ],
      W,
      H,
      score: 0,
    };
    setScore(0);
  };

  const handleJump = () => {
    if (gameStateRef.current === "dead") return;
    if (gameStateRef.current === "idle") {
      setGameState("playing");
    }
    const { dino } = state.current;
    if (dino.onGround) {
      dino.vy = -14;
      dino.onGround = false;
    }
  };

  const handleDuck = (isDucking: boolean) => {
    if (gameStateRef.current !== "playing") return;
    const { dino } = state.current;
    if (isDucking) {
      if (dino.onGround && !dino.ducking) {
        dino.ducking = true;
        dino.h = dino.duckH;
      }
    } else {
      if (dino.ducking) {
        dino.ducking = false;
        dino.h = dino.normalH;
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        handleDuck(false);
        handleJump();
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        handleDuck(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowDown") {
        handleDuck(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    const W = Math.min(window.innerWidth, 800);
    const H = Math.min(window.innerHeight * 0.75, 300);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    initGame(W, H);

    let ty = 0;
    const handleTouchStart = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const dy = e.changedTouches[0].clientY - ty;
      if (dy > 30) {
        handleDuck(true);
        setTimeout(() => handleDuck(false), 500);
      } else {
        handleDuck(false);
        handleJump();
      }
    };
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    const spawnObstacle = () => {
      const gs = state.current;
      const isBird = state.current.score > 100 && Math.random() < 0.3;
      if (isBird) {
        const heights = [30, 50, 70];
        const h = heights[Math.floor(Math.random() * heights.length)];
        gs.obstacles.push({
          x: gs.W + 20,
          w: 30,
          h: 20,
          yOffset: h,
          type: "bird",
          frameOffset: Math.random() * 100,
        });
      } else {
        const sizes = [
          [20, 40],
          [25, 55],
          [30, 45],
          [20, 65],
        ];
        const s = sizes[Math.floor(Math.random() * sizes.length)];
        const count = Math.random() < 0.3 ? 2 : 1;
        gs.obstacles.push({
          x: gs.W + 20,
          w: s[0] * count + (count > 1 ? 8 : 0),
          h: s[1],
          type: "cactus",
          yOffset: 0,
        });
      }
    };

    const drawDino = () => {
      const { dino, frame } = state.current;
      const y = dino.y - dino.h;
      ctx.fillStyle = "#10b981";
      ctx.fillRect(dino.x, y, dino.w, dino.h);
      ctx.fillStyle = "#111827";
      ctx.fillRect(dino.x + dino.w - 10, y + 8, 8, 8);
      ctx.fillStyle = "#059669";
      if (dino.ducking) {
        ctx.fillRect(dino.x - 16, y + dino.h - 10, 18, 10);
      } else {
        ctx.fillRect(dino.x - 12, y + dino.h - 16, 14, 10);
      }
      const legY = y + dino.h;
      const legOff = frame % 20 < 10 ? 0 : 6;
      if (!dino.onGround) {
        ctx.fillRect(dino.x + 6, legY - 6, 10, 12);
        ctx.fillRect(dino.x + 22, legY - 6, 10, 12);
      } else {
        ctx.fillRect(dino.x + 6, legY - legOff, 10, 12 + legOff);
        ctx.fillRect(dino.x + 22, legY - (6 - legOff), 10, 12 + (6 - legOff));
      }
    };

    const drawGround = () => {
      const { GND, W, frame, speed } = state.current;
      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GND + 2);
      ctx.lineTo(W, GND + 2);
      ctx.stroke();
      ctx.fillStyle = "#374151";
      for (let i = 0; i < W; i += 30) {
        const x = (((i - frame * speed * 0.5) % W) + W) % W;
        ctx.fillRect(x, GND + 6, 4, 2);
      }
    };

    const drawCloud = (cl: Cloud) => {
      ctx.fillStyle = "rgba(55,65,81,0.6)";
      ctx.beginPath();
      ctx.ellipse(cl.x, cl.y, cl.w / 2, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(
        cl.x - cl.w * 0.2,
        cl.y + 4,
        cl.w * 0.3,
        8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(
        cl.x + cl.w * 0.2,
        cl.y + 2,
        cl.w * 0.25,
        9,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    };

    const drawObstacle = (o: Obstacle) => {
      const { GND, frame } = state.current;
      if (o.type === "bird") {
        const by = GND - o.yOffset;
        ctx.fillStyle = "#f43f5e";
        ctx.fillRect(o.x, by, o.w, o.h);
        const wingY = (frame + (o.frameOffset || 0)) % 20 < 10 ? -10 : 10;
        ctx.fillStyle = "#e11d48";
        ctx.beginPath();
        ctx.moveTo(o.x + 10, by + 10);
        ctx.lineTo(o.x + 20, by + 10 + wingY);
        ctx.lineTo(o.x + 30, by + 10);
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(o.x - 8, by + 4, 8, 6);
      } else {
        ctx.fillStyle = "#34d399";
        ctx.fillRect(o.x, GND - o.h, o.w, o.h);
        ctx.fillStyle = "#6ee7b7";
        ctx.fillRect(o.x - 4, GND - o.h - 6, o.w + 8, 10);
        ctx.fillStyle = "#10b981";
        for (let i = 0; i < 3; i++) {
          const sx = o.x + 4 + i * (o.w / 3);
          ctx.beginPath();
          ctx.moveTo(sx, GND - o.h - 6);
          ctx.lineTo(sx + 6, GND - o.h - 20);
          ctx.lineTo(sx + 12, GND - o.h - 6);
          ctx.fill();
        }
      }
    };

    const collides = (
      a: { x: number; y: number; w: number; h: number },
      b: Obstacle,
    ) => {
      const { GND } = state.current;
      const by = b.type === "bird" ? GND - b.yOffset : GND - b.h;
      return (
        a.x + 8 < b.x + b.w &&
        a.x + a.w - 8 > b.x &&
        a.y - a.h + 8 < by + b.h &&
        a.y > by + 4
      );
    };

    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      const gs = state.current;
      const currentGameState = gameStateRef.current;

      gs.clouds.forEach((cl) => {
        cl.x -= gs.speed * 0.3;
        if (cl.x + cl.w / 2 < 0) cl.x = W + cl.w;
        drawCloud(cl);
      });

      drawGround();

      if (currentGameState === "playing") {
        gs.frame++;
        gs.score++;
        gs.speed = 4 + gs.score / 200;
        // Sync to React state every 10 frames to reduce re-renders
        if (gs.frame % 10 === 0) setScore(gs.score);

        gs.dino.vy += 0.7;
        gs.dino.y += gs.dino.vy;
        if (gs.dino.y >= gs.GND) {
          gs.dino.y = gs.GND;
          gs.dino.vy = 0;
          gs.dino.onGround = true;
        }

        if (gs.frame % Math.max(50, 90 - Math.floor(gs.score / 150)) === 0)
          spawnObstacle();

        for (let i = gs.obstacles.length - 1; i >= 0; i--) {
          gs.obstacles[i].x -= gs.speed;
          drawObstacle(gs.obstacles[i]);
          if (gs.obstacles[i].x + gs.obstacles[i].w < 0) {
            gs.obstacles.splice(i, 1);
            continue;
          }
          if (collides(gs.dino, gs.obstacles[i])) {
            setGameState("dead");
            setScore(gs.score); // final sync
            const finalScore = gs.score;
            let currentBest = bestScoreRef.current;
            if (finalScore > currentBest) {
              currentBest = finalScore;
              setBestScore(finalScore);
              localStorage.setItem("dinoBest", finalScore.toString());
            }
            if (onGameOver) onGameOver(finalScore);
          }
        }
      } else if (currentGameState === "dead") {
        gs.obstacles.forEach((o) => drawObstacle(o));
      }

      drawDino();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onGameOver]);

  return (
    <div className="relative w-full h-full bg-[#111827] flex items-center justify-center overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className="block w-full h-full max-w-[800px] object-cover"
      />

      {/* Score */}
      <div className="absolute top-6 right-6 bg-[#1f2937]/80 border border-emerald-500/40 px-4 py-1.5 rounded-full flex gap-4 backdrop-blur-sm pointer-events-none shadow-[0_0_20px_rgba(16,185,129,0.3)] font-mono">
        <span className="text-emerald-500 font-bold tracking-widest drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">
          {score.toString().padStart(5, "0")}
        </span>
        <span className="text-emerald-500/50">
          HI {bestScore.toString().padStart(5, "0")}
        </span>
      </div>

      {/* Overlays */}
      {gameState === "idle" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto"
          onClick={handleJump}
        >
          <h2 className="text-3xl font-bold text-white mb-2 tracking-widest drop-shadow-md">
            T-REX RUNNER
          </h2>
          <p className="text-emerald-400 font-mono tracking-widest animate-pulse">
            PRESS SPACE / TAP TO START
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
            className="px-6 py-3 bg-emerald-500/20 border border-emerald-500 text-emerald-400 rounded-xl font-mono tracking-widest hover:bg-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all"
          >
            {"PLAY AGAIN"}
          </button>
        </div>
      )}
    </div>
  );
}
