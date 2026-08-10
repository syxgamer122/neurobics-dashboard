const c = document.getElementById("c");
const ctx = c.getContext("2d");
const SIZE = Math.min(
  Math.floor(Math.min(window.innerWidth, window.innerHeight - 80) / 20) * 20,
  400,
);
const CELL = 20,
  COLS = SIZE / CELL,
  ROWS = SIZE / CELL;
c.width = SIZE;
c.height = SIZE;

let snake,
  dir,
  nextDir,
  food,
  score,
  best = parseInt(localStorage.getItem("snakeBest")) || 0,
  eatCount,
  gameLoop,
  foodPulse = 0,
  alive = false,
  goldFood = null,
  goldTimer = 0,
  walls = [];

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function initGame() {
  const cx = Math.floor(COLS / 2),
    cy = Math.floor(ROWS / 2);
  snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  eatCount = 0;
  walls = [];
  goldFood = null;
  goldTimer = 0;
  document.getElementById("score").textContent = "0";
  document.getElementById("lv").textContent = "1";
  spawnFood();
}

function isOccupied(pos) {
  return (
    snake.some((s) => s.x === pos.x && s.y === pos.y) ||
    walls.some((w) => w.x === pos.x && w.y === pos.y) ||
    (food && food.x === pos.x && food.y === pos.y) ||
    (goldFood && goldFood.x === pos.x && goldFood.y === pos.y)
  );
}

function spawnFood() {
  let pos;
  do {
    pos = { x: rnd(COLS), y: rnd(ROWS) };
  } while (isOccupied(pos));

  if (Math.random() < 0.15 && !goldFood) {
    goldFood = pos;
    goldTimer = 40; // lasts 40 ticks
    // Still need normal food
    do {
      pos = { x: rnd(COLS), y: rnd(ROWS) };
    } while (isOccupied(pos));
    food = pos;
  } else {
    food = pos;
  }

  // Spawn walls if level >= 3
  const lv = Math.floor(eatCount / 5) + 1;
  if (lv >= 3 && Math.random() < 0.4 && walls.length < lv * 2) {
    let wpos;
    do {
      wpos = { x: rnd(COLS), y: rnd(ROWS) };
    } while (
      isOccupied(wpos) ||
      (Math.abs(wpos.x - snake[0].x) < 3 && Math.abs(wpos.y - snake[0].y) < 3)
    );
    // avoid spawning wall too close to head
    walls.push(wpos);
  }
}

function setDir(dx, dy) {
  if (dx === -dir.x && dy === -dir.y) return;
  nextDir = { x: dx, y: dy };
}

document.addEventListener("keydown", (e) => {
  const map = {
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
    setDir(...map[e.code]);
  }
});

// Touch/swipe
let tx = 0,
  ty = 0;
document.addEventListener(
  "touchstart",
  (e) => {
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  (e) => {
    const dx = e.changedTouches[0].clientX - tx;
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
  },
  { passive: true },
);

const restartBtn = document.getElementById("restart");
restartBtn.addEventListener("click", startGame);
restartBtn.addEventListener("touchstart", (e) => {
  e.stopPropagation();
  startGame();
});

function startGame() {
  initGame();
  alive = true;
  document.getElementById("overlay").style.display = "none";
  document.getElementById("title").textContent = "SNAKE";
  document.getElementById("inst").style.display = "block";
  document.getElementById("hint").style.display = "block";
  document.getElementById("final").style.display = "none";
  document.getElementById("final-best").style.display = "none";
  if (gameLoop) clearInterval(gameLoop);
  const speed = 150;
  gameLoop = setInterval(tick, speed);
}

function tick() {
  dir = nextDir;
  const head = {
    x: (snake[0].x + dir.x + COLS) % COLS,
    y: (snake[0].y + dir.y + ROWS) % ROWS,
  };

  // Self or Wall collision
  if (
    snake.some((s) => s.x === head.x && s.y === head.y) ||
    walls.some((w) => w.x === head.x && w.y === head.y)
  ) {
    alive = false;
    clearInterval(gameLoop);
    if (score > best) {
      best = score;
      localStorage.setItem("snakeBest", best);
    }
    document.getElementById("best").textContent = best;
    const ov = document.getElementById("overlay");
    document.getElementById("title").textContent = "GAME OVER";
    document.getElementById("inst").style.display = "none";
    document.getElementById("hint").style.display = "none";
    document.getElementById("final").textContent = `SCORE: ${score}`;
    document.getElementById("final").style.display = "block";
    document.getElementById("final-best").textContent = `BEST: ${best}`;
    document.getElementById("final-best").style.display = "block";
    document.getElementById("restart").textContent = "PLAY AGAIN";
    document.getElementById("exit").style.display = "inline-block";
    ov.style.display = "flex";
    window.parent.postMessage({ type: "GAME_OVER", score }, "*");
    return;
  }

  snake.unshift(head);
  let ate = false;

  if (food && head.x === food.x && head.y === food.y) {
    score += 10;
    eatCount++;
    ate = true;
    food = null;
  } else if (goldFood && head.x === goldFood.x && head.y === goldFood.y) {
    score += 30;
    goldFood = null;
    goldTimer = 0;
    // Don't increase eatCount for speedup, but maybe increase score
    // And don't grow snake. Wait, `ate` is false, so it will pop tail. That's perfect for gold!
  }

  if (ate) {
    document.getElementById("score").textContent = score;
    const lv = Math.floor(eatCount / 5) + 1;
    document.getElementById("lv").textContent = lv;
    spawnFood();
    // Speed up
    if (eatCount % 5 === 0 && eatCount > 0) {
      clearInterval(gameLoop);
      gameLoop = setInterval(tick, Math.max(70, 150 - lv * 12));
    }
  } else {
    snake.pop();
  }

  if (goldTimer > 0) {
    goldTimer--;
    if (goldTimer === 0) goldFood = null;
  }
  draw();
}

function draw() {
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Grid
  ctx.strokeStyle = "rgba(16,185,129,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= SIZE; i += CELL) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i, SIZE);
    ctx.moveTo(0, i);
    ctx.lineTo(SIZE, i);
  }
  ctx.stroke();

  // Walls
  ctx.fillStyle = "#64748b"; // slate
  walls.forEach((w) => {
    ctx.fillRect(w.x * CELL + 1, w.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = "#475569";
    ctx.strokeRect(w.x * CELL + 1, w.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.beginPath();
    ctx.moveTo(w.x * CELL + 1, w.y * CELL + CELL / 2);
    ctx.lineTo(w.x * CELL + CELL - 1, w.y * CELL + CELL / 2);
    ctx.stroke();
  });

  // Food
  if (food) {
    const fx = food.x * CELL + CELL / 2;
    const fy = food.y * CELL + CELL / 2;
    foodPulse = (foodPulse + 0.1) % (Math.PI * 2);
    const pulse = 1 + Math.sin(foodPulse) * 0.1;

    ctx.fillStyle = "#ef4444";
    ctx.shadowColor = "#ef4444";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(fx, fy, (CELL / 2 - 2) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Golden Food
  if (goldFood) {
    const gfx = goldFood.x * CELL + CELL / 2;
    const gfy = goldFood.y * CELL + CELL / 2;
    const pulse = 1 + Math.cos(foodPulse * 2) * 0.2;

    ctx.fillStyle = "#fbbf24";
    ctx.shadowColor = "#fbbf24";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(gfx, gfy, (CELL / 2 - 2) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Snake
  snake.forEach((seg, i) => {
    const sx = seg.x * CELL,
      sy = seg.y * CELL;
    const t = i / snake.length;
    const r = Math.max(2, 16 * (1 - t * 0.4));
    const alpha = 1 - t * 0.3;
    ctx.globalAlpha = alpha;

    if (i === 0) {
      // Head glow
      const hg = ctx.createRadialGradient(
        sx + CELL / 2,
        sy + CELL / 2,
        0,
        sx + CELL / 2,
        sy + CELL / 2,
        CELL,
      );
      hg.addColorStop(0, "rgba(52,211,153,0.4)");
      hg.addColorStop(1, "transparent");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(sx + CELL / 2, sy + CELL / 2, CELL, 0, Math.PI * 2);
      ctx.fill();

      // Head
      const hgrad = ctx.createLinearGradient(sx, sy, sx + CELL, sy + CELL);
      hgrad.addColorStop(0, "#34d399");
      hgrad.addColorStop(1, "#10b981");
      ctx.fillStyle = hgrad;
      ctx.beginPath();
      ctx.roundRect(sx + 1, sy + 1, CELL - 2, CELL - 2, 5);
      ctx.fill();

      // Eyes
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0f172a";
      if (dir.x === 1) {
        ctx.fillRect(sx + 13, sy + 4, 4, 4);
        ctx.fillRect(sx + 13, sy + 12, 4, 4);
      } else if (dir.x === -1) {
        ctx.fillRect(sx + 3, sy + 4, 4, 4);
        ctx.fillRect(sx + 3, sy + 12, 4, 4);
      } else if (dir.y === -1) {
        ctx.fillRect(sx + 4, sy + 3, 4, 4);
        ctx.fillRect(sx + 12, sy + 3, 4, 4);
      } else {
        ctx.fillRect(sx + 4, sy + 13, 4, 4);
        ctx.fillRect(sx + 12, sy + 13, 4, 4);
      }
    } else {
      const sg = ctx.createLinearGradient(sx, sy, sx + CELL, sy + CELL);
      sg.addColorStop(0, `rgba(16,185,129,${0.9 - t * 0.3})`);
      sg.addColorStop(1, `rgba(5,150,105,${0.7 - t * 0.3})`);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.roundRect(sx + 2, sy + 2, CELL - 4, CELL - 4, 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

// Initial draw
ctx.fillStyle = "#0f172a";
ctx.fillRect(0, 0, SIZE, SIZE);
