import { useEffect, useRef, useState } from "react";
import {
  readIntStorage,
  writeBestHigher,
  useOnHidden,
} from "../lib/game-utils";

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
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() =>
    readIntStorage("dinoBest", 0),
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
  const duckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useOnHidden(() => {
    if (gameStateRef.current === "playing") {
      gameStateRef.current = "paused";
      setGameState("paused");
    }
  });

  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeoutId = duckTimeoutRef.current;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

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
    spawnIn: 60,
    groundOffset: 0,
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
      spawnIn: 60,
      groundOffset: 0,
    };
    setScore(0);
  };

  const handleJump = () => {
    if (gameStateRef.current === "dead" || gameStateRef.current === "paused")
      return;
    if (gameStateRef.current === "idle") {
      gameStateRef.current = "playing";
      setGameState("playing");
      const gs = state.current;
      gs.frame = 0;
      gs.score = 0;
      gs.obstacles = [];
      gs.speed = 4;
      gs.dino.y = gs.GND;
      gs.dino.vy = 0;
      gs.dino.onGround = true;
      gs.dino.ducking = false;
      if (scoreSpanRef.current) scoreSpanRef.current.innerText = "00000";
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
      const el = e.target as HTMLElement;
      if (
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.isContentEditable
      )
        return;
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (gameStateRef.current === "paused") {
          gameStateRef.current = "playing";
          setGameState("playing");
          return;
        }
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
    let lastTime: number | null = null;
    let W = Math.min(window.innerWidth, 800);
    let H = Math.min(window.innerHeight * 0.75, 300);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const updateCanvasSize = () => {
      W = Math.min(window.innerWidth, 800);
      H = Math.min(window.innerHeight * 0.75, 300);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.scale(dpr, dpr);

      const gs = state.current;
      gs.W = W;
      gs.H = H;
      const oldGND = gs.GND;
      gs.GND = H - 60;
      if (gs.dino.onGround) {
        gs.dino.y = gs.GND;
      } else {
        gs.dino.y += gs.GND - oldGND;
      }
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    window.addEventListener("orientationchange", updateCanvasSize);

    initGame(W, H);

    const spawnObstacle = () => {
      const gs = state.current;
      const isBird = gs.score > 100 && Math.random() < 0.3;
      if (isBird) {
        const BIRD_MUST_JUMP = [12, 22, 34];
        const BIRD_MUST_DUCK = [52, 58, 64];
        const heights = Math.random() < 0.5 ? BIRD_MUST_JUMP : BIRD_MUST_DUCK;
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
      const { GND, W } = state.current;
      ctx.strokeStyle = "#374151";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GND + 2);
      ctx.lineTo(W, GND + 2);
      ctx.stroke();
      ctx.fillStyle = "#374151";
      const gs = state.current;
      for (let i = 0; i < W; i += 30) {
        const x = (((i - gs.groundOffset) % W) + W) % W;
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

    type Box = { left: number; right: number; top: number; bottom: number };

    const dinoBox = (d: typeof state.current.dino): Box => ({
      left: d.x + 6,
      right: d.x + d.w - 6,
      top: d.y - d.h + 4,
      bottom: d.y - 2,
    });

    const obstacleBox = (o: Obstacle, GND: number): Box =>
      o.type === "bird"
        ? {
            left: o.x + 4,
            right: o.x + o.w - 4,
            top: GND - o.yOffset + 3,
            bottom: GND - o.yOffset + o.h - 3,
          }
        : {
            left: o.x + 3,
            right: o.x + o.w - 3,
            top: GND - o.h + 2,
            bottom: GND,
          };

    const overlaps = (a: Box, b: Box) =>
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top;

    const hitsDino = (d: typeof state.current.dino, o: Obstacle, GND: number) =>
      overlaps(dinoBox(d), obstacleBox(o, GND));

    const STEP_MS = 1000 / 60;
    const MAX_STEPS = 5;
    let acc = 0;

    const die = () => {
      gameStateRef.current = "dead";
      setGameState("dead");
      const gs = state.current;
      setScore(gs.score);
      writeBestHigher("dinoBest", gs.score);
      setBestScore((prev) => Math.max(prev, gs.score));
      if (onGameOverRef.current) onGameOverRef.current(gs.score);
    };

    const step = () => {
      const gs = state.current;
      gs.frame += 1;
      gs.score += 1;
      gs.speed = Math.min(14, 4 + gs.score / 200);

      gs.dino.vy += 0.7;
      gs.dino.y += gs.dino.vy;
      if (gs.dino.y >= gs.GND) {
        gs.dino.y = gs.GND;
        gs.dino.vy = 0;
        gs.dino.onGround = true;
      }

      gs.spawnIn -= 1;
      if (gs.spawnIn <= 0) {
        spawnObstacle();
        const sc = Math.floor(gs.score / 150);
        gs.spawnIn = Math.max(50, 90 - sc) + Math.floor(Math.random() * 26);
      }

      gs.groundOffset += gs.speed * 0.5;

      for (let i = gs.obstacles.length - 1; i >= 0; i--) {
        const o = gs.obstacles[i];
        o.x -= gs.speed;
        if (o.x + o.w < 0) {
          gs.obstacles.splice(i, 1);
          continue;
        }
        if (hitsDino(gs.dino, o, gs.GND)) {
          die();
          return;
        }
      }
    };

    const loop = (timestamp: number) => {
      if (lastTime === null) lastTime = timestamp;
      const frameMs = Math.min(timestamp - lastTime, 50); // cap 50ms
      lastTime = timestamp;

      ctx.clearRect(0, 0, W, H);
      const gs = state.current;
      const currentGameState = gameStateRef.current;

      if (currentGameState === "playing") {
        gs.clouds.forEach((cl) => {
          cl.x -= gs.speed * 0.3 * (frameMs / 16.666);
          if (cl.x + cl.w / 2 < 0) cl.x = W + cl.w;
        });

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

      gs.clouds.forEach((cl) => drawCloud(cl));
      drawGround();

      if (currentGameState === "dead" || currentGameState === "paused") {
        gs.obstacles.forEach((o) => drawObstacle(o));
      } else {
        gs.obstacles.forEach((o) => drawObstacle(o));
      }

      drawDino();

      if (scoreSpanRef.current && Math.floor(gs.frame) % 3 === 0) {
        scoreSpanRef.current.textContent = Math.floor(gs.score)
          .toString()
          .padStart(5, "0");
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      window.removeEventListener("orientationchange", updateCanvasSize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const pointerStartY = useRef(0);

  return (
    <div
      className="relative w-full h-full bg-[#111827] flex items-center justify-center overflow-hidden select-none touch-none"
      onPointerDown={(e) => {
        // e.preventDefault() is implicitly handled by touch-none for scrolling,
        // but we can also just capture the pointer start.
        pointerStartY.current = e.clientY;
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0 || e.pointerType === "touch") {
          const dy = e.clientY - pointerStartY.current;
          if (dy > 40) {
            handleDuck(true);
          }
        }
      }}
      onPointerUp={(e) => {
        const dy = e.clientY - pointerStartY.current;
        if (dy <= 40) {
          handleJump();
        }
        handleDuck(false);
      }}
      onPointerCancel={() => {
        handleDuck(false);
      }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full max-w-[800px] object-cover"
      />

      {/* Score */}
      <div className="absolute top-6 right-6 bg-[#1f2937]/90 border border-emerald-500/40 px-4 py-1.5 rounded-full flex gap-4 pointer-events-none font-mono">
        <span
          ref={scoreSpanRef}
          className="text-emerald-500 font-bold tracking-widest"
        >
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
          <p className="text-emerald-400 font-mono tracking-widest animate-pulse">
            TAP TO RESUME
          </p>
        </div>
      )}

      {gameState === "dead" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/60 animate-[fadeIn_0.2s]">
          <h2 className="text-3xl font-bold text-rose-500 mb-2">GAME OVER</h2>
          <p className="text-white/80 font-mono mb-4 text-lg">
            SCORE: {Math.floor(score)}
          </p>
          <p className="text-white/60 font-mono mb-8 text-sm">
            BEST: {Math.floor(bestScore)}
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
