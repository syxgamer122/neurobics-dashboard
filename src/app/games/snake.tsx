import React, { useEffect, useRef, useState } from "react";

export function SnakeGame({ onGameOver }: { onGameOver?: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem("snakeBest") || "0");
  });
  const [level, setLevel] = useState(1);
  const [gameState, setGameState] = useState<"idle" | "playing" | "dead">("idle");

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const scoreRef = useRef(0);
  scoreRef.current = score;
  const bestScoreRef = useRef(bestScore);
  bestScoreRef.current = bestScore;
  const levelRef = useRef(level);
  levelRef.current = level;

  const state = useRef({
    CELL: 20,
    COLS: 20,
    ROWS: 20,
    SIZE: 400,
    snake: [] as { x: number; y: number }[],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: null as { x: number; y: number } | null,
    goldFood: null as { x: number; y: number } | null,
    eatCount: 0,
    goldTimer: 0,
    walls: [] as { x: number; y: number }[],
    foodPulse: 0,
  });

  const rnd = (n: number) => Math.floor(Math.random() * n);

  const isOccupied = (pos: { x: number; y: number }) => {
    const s = state.current;
    return (
      s.snake.some((seg) => seg.x === pos.x && seg.y === pos.y) ||
      s.walls.some((w) => w.x === pos.x && w.y === pos.y) ||
      (s.food && s.food.x === pos.x && s.food.y === pos.y) ||
      (s.goldFood && s.goldFood.x === pos.x && s.goldFood.y === pos.y)
    );
  };

  const spawnFood = () => {
    const s = state.current;
    let pos;
    do {
      pos = { x: rnd(s.COLS), y: rnd(s.ROWS) };
    } while (isOccupied(pos));

    if (Math.random() < 0.15 && !s.goldFood) {
      s.goldFood = pos;
      s.goldTimer = 40;
      do {
        pos = { x: rnd(s.COLS), y: rnd(s.ROWS) };
      } while (isOccupied(pos));
      s.food = pos;
    } else {
      s.food = pos;
    }

    const lv = Math.floor(s.eatCount / 5) + 1;
    if (lv >= 3 && Math.random() < 0.4 && s.walls.length < lv * 2) {
      let wpos;
      do {
        wpos = { x: rnd(s.COLS), y: rnd(s.ROWS) };
      } while (
        isOccupied(wpos) ||
        (s.snake.length > 0 && Math.abs(wpos.x - s.snake[0].x) < 3 && Math.abs(wpos.y - s.snake[0].y) < 3)
      );
      s.walls.push(wpos);
    }
  };

  const initGame = (SIZE: number) => {
    const CELL = 20;
    const COLS = SIZE / CELL;
    const ROWS = SIZE / CELL;
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);

    state.current = {
      CELL,
      COLS,
      ROWS,
      SIZE,
      snake: [
        { x: cx, y: cy },
        { x: cx - 1, y: cy },
        { x: cx - 2, y: cy },
      ],
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      food: null,
      goldFood: null,
      eatCount: 0,
      goldTimer: 0,
      walls: [],
      foodPulse: 0,
    };
    setScore(0);
    setLevel(1);
    spawnFood();
  };

  const setDir = (dx: number, dy: number) => {
    const s = state.current;
    if (dx === -s.dir.x && dy === -s.dir.y) return;
    s.nextDir = { x: dx, y: dy };
  };

  const startGame = () => {
    if (gameStateRef.current === "idle" || gameStateRef.current === "dead") {
      setGameState("playing");
      const SIZE = Math.min(
        Math.floor(Math.min(window.innerWidth, window.innerHeight - 80) / 20) * 20,
        400
      );
      initGame(SIZE);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        KeyW: [0, -1],
        KeyS: [0, 1],
        KeyA: [-1, 0],
        KeyD: [1, 0],
      };
      if (map[e.code]) {
        e.preventDefault();
        if (gameStateRef.current !== "playing") startGame();
        else setDir(...map[e.code]);
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

    let SIZE = Math.min(
      Math.floor(Math.min(window.innerWidth, window.innerHeight - 80) / 20) * 20,
      400
    );
    canvas.width = SIZE;
    canvas.height = SIZE;
    if (gameStateRef.current === "idle") initGame(SIZE);

    let tx = 0, ty = 0;
    const handleTouchStart = (e: TouchEvent) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (gameStateRef.current !== "playing") {
          startGame();
        } else {
          if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
          else setDir(0, dy > 0 ? 1 : -1);
        }
      } else {
        if (gameStateRef.current !== "playing") startGame();
      }
    };
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    const draw = () => {
      const s = state.current;
      ctx.clearRect(0, 0, s.SIZE, s.SIZE);

      ctx.strokeStyle = "rgba(16,185,129,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= s.SIZE; i += s.CELL) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s.SIZE);
        ctx.moveTo(0, i);
        ctx.lineTo(s.SIZE, i);
      }
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      s.walls.forEach((w) => {
        ctx.fillRect(w.x * s.CELL + 1, w.y * s.CELL + 1, s.CELL - 2, s.CELL - 2);
        ctx.strokeStyle = "#475569";
        ctx.strokeRect(w.x * s.CELL + 1, w.y * s.CELL + 1, s.CELL - 2, s.CELL - 2);
        ctx.beginPath();
        ctx.moveTo(w.x * s.CELL + 1, w.y * s.CELL + s.CELL / 2);
        ctx.lineTo(w.x * s.CELL + s.CELL - 1, w.y * s.CELL + s.CELL / 2);
        ctx.stroke();
      });

      if (s.food) {
        const fx = s.food.x * s.CELL + s.CELL / 2;
        const fy = s.food.y * s.CELL + s.CELL / 2;
        s.foodPulse = (s.foodPulse + 0.1) % (Math.PI * 2);
        const pulse = 1 + Math.sin(s.foodPulse) * 0.1;

        ctx.fillStyle = "#ef4444";
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(fx, fy, (s.CELL / 2 - 2) * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (s.goldFood) {
        const gfx = s.goldFood.x * s.CELL + s.CELL / 2;
        const gfy = s.goldFood.y * s.CELL + s.CELL / 2;
        const pulse = 1 + Math.cos(s.foodPulse * 2) * 0.2;

        ctx.fillStyle = "#fbbf24";
        ctx.shadowColor = "#fbbf24";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(gfx, gfy, (s.CELL / 2 - 2) * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      s.snake.forEach((seg, i) => {
        const sx = seg.x * s.CELL;
        const sy = seg.y * s.CELL;
        const t = i / s.snake.length;
        const alpha = 1 - t * 0.3;
        ctx.globalAlpha = alpha;

        if (i === 0) {
          const hg = ctx.createRadialGradient(
            sx + s.CELL / 2,
            sy + s.CELL / 2,
            0,
            sx + s.CELL / 2,
            sy + s.CELL / 2,
            s.CELL
          );
          hg.addColorStop(0, "rgba(52,211,153,0.4)");
          hg.addColorStop(1, "transparent");
          ctx.fillStyle = hg;
          ctx.beginPath();
          ctx.arc(sx + s.CELL / 2, sy + s.CELL / 2, s.CELL, 0, Math.PI * 2);
          ctx.fill();

          const hgrad = ctx.createLinearGradient(sx, sy, sx + s.CELL, sy + s.CELL);
          hgrad.addColorStop(0, "#34d399");
          hgrad.addColorStop(1, "#10b981");
          ctx.fillStyle = hgrad;
          ctx.beginPath();
          ctx.roundRect(sx + 1, sy + 1, s.CELL - 2, s.CELL - 2, 5);
          ctx.fill();

          ctx.globalAlpha = 1;
          ctx.fillStyle = "#0f172a";
          if (s.dir.x === 1) {
            ctx.fillRect(sx + 13, sy + 4, 4, 4);
            ctx.fillRect(sx + 13, sy + 12, 4, 4);
          } else if (s.dir.x === -1) {
            ctx.fillRect(sx + 3, sy + 4, 4, 4);
            ctx.fillRect(sx + 3, sy + 12, 4, 4);
          } else if (s.dir.y === -1) {
            ctx.fillRect(sx + 4, sy + 3, 4, 4);
            ctx.fillRect(sx + 12, sy + 3, 4, 4);
          } else {
            ctx.fillRect(sx + 4, sy + 13, 4, 4);
            ctx.fillRect(sx + 12, sy + 13, 4, 4);
          }
        } else {
          const sg = ctx.createLinearGradient(sx, sy, sx + s.CELL, sy + s.CELL);
          sg.addColorStop(0, `rgba(16,185,129,${0.9 - t * 0.3})`);
          sg.addColorStop(1, `rgba(5,150,105,${0.7 - t * 0.3})`);
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.roundRect(sx + 2, sy + 2, s.CELL - 4, s.CELL - 4, 4);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
    };

    let timeoutId: any;
    const tick = () => {
      if (gameStateRef.current !== "playing") {
        draw();
        timeoutId = setTimeout(tick, 100);
        return;
      }

      const s = state.current;
      s.dir = s.nextDir;
      const head = {
        x: (s.snake[0].x + s.dir.x + s.COLS) % s.COLS,
        y: (s.snake[0].y + s.dir.y + s.ROWS) % s.ROWS,
      };

      if (
        s.snake.some((seg) => seg.x === head.x && seg.y === head.y) ||
        s.walls.some((w) => w.x === head.x && w.y === head.y)
      ) {
        setGameState("dead");
        if (scoreRef.current > bestScoreRef.current) {
          setBestScore(scoreRef.current);
          localStorage.setItem("snakeBest", scoreRef.current.toString());
        }
        if (onGameOver) onGameOver(scoreRef.current);
        draw();
        timeoutId = setTimeout(tick, 100);
        return;
      }

      s.snake.unshift(head);
      let ate = false;

      if (s.food && head.x === s.food.x && head.y === s.food.y) {
        setScore((sc) => sc + 10);
        s.eatCount++;
        ate = true;
        s.food = null;
      } else if (s.goldFood && head.x === s.goldFood.x && head.y === s.goldFood.y) {
        setScore((sc) => sc + 30);
        s.goldFood = null;
        s.goldTimer = 0;
      }

      if (ate) {
        const lv = Math.floor(s.eatCount / 5) + 1;
        setLevel(lv);
        spawnFood();
      } else {
        s.snake.pop();
      }

      if (s.goldTimer > 0) {
        s.goldTimer--;
        if (s.goldTimer === 0) s.goldFood = null;
      }

      draw();

      const speed = Math.max(70, 150 - levelRef.current * 12);
      timeoutId = setTimeout(tick, speed);
    };

    timeoutId = setTimeout(tick, 100);

    return () => {
      clearTimeout(timeoutId);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onGameOver]);

  return (
    <div className="relative w-full h-full bg-[#0f172a] flex items-center justify-center overflow-hidden touch-none select-none">
      <canvas ref={canvasRef} className="block shadow-[0_0_40px_rgba(16,185,129,0.1)] border border-emerald-500/10 rounded-xl bg-[#0f172a]" />

      {/* Top Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-6 text-sm font-mono tracking-widest text-emerald-500/80 pointer-events-none">
        <span>SCORE: <span className="text-emerald-400 font-bold">{score}</span></span>
        <span>BEST: <span>{bestScore}</span></span>
        <span>LV: <span className="text-amber-400">{level}</span></span>
      </div>

      {/* Overlays */}
      {gameState === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" onClick={startGame}>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-widest drop-shadow-md">SNAKE</h2>
          <p className="text-emerald-400 font-mono tracking-widest">ARROW KEYS / WASD</p>
          <p className="text-emerald-400/50 font-mono text-xs mt-2 animate-pulse">MOBILE: SWIPE TO MOVE / TAP TO START</p>
        </div>
      )}

      {gameState === "dead" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s]">
          <h2 className="text-3xl font-bold text-rose-500 mb-2 drop-shadow-[0_0_12px_rgba(225,29,72,0.5)]">GAME OVER</h2>
          <p className="text-white/80 font-mono mb-4 text-lg">SCORE: {score}</p>
          <p className="text-white/60 font-mono mb-8 text-sm">BEST: {bestScore}</p>
          <button
            onClick={startGame}
            className="px-6 py-3 bg-emerald-500/20 border border-emerald-500 text-emerald-400 rounded-xl font-mono tracking-widest hover:bg-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all"
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
