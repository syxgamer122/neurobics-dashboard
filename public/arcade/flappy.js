const c = document.getElementById("c");
const ctx = c.getContext("2d");
const W = Math.min(window.innerWidth, 420);
const H = Math.min(window.innerHeight, 620);
c.width = W;
c.height = H;

const PIPE_W = 52,
  GAP = 160,
  GRAV = 0.45,
  FLAP = -8;
let state = "idle"; // idle | playing | dead
let bird,
  pipes,
  score,
  bestScore = parseInt(localStorage.getItem("flappyBest")) || 0,
  frame,
  particles;

function initGame() {
  bird = { x: W * 0.28, y: H / 2, vy: 0, r: 18, rot: 0 };
  pipes = [];
  particles = [];
  score = 0;
  frame = 0;
  document.getElementById("score-val").textContent = "0";
}

function flap() {
  if (state === "dead") return;
  if (state === "idle") {
    state = "playing";
    document.getElementById("overlay").style.display = "none";
  }
  bird.vy = FLAP;
  // Spawn particles
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
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    flap();
  }
});
document.addEventListener(
  "touchstart",
  (e) => {
    if (e.target.id === "restart") return;
    e.preventDefault();
    flap();
  },
  { passive: false },
);
const restartBtn = document.getElementById("restart");
restartBtn.addEventListener("click", restart);
restartBtn.addEventListener("touchstart", (e) => {
  e.stopPropagation();
  restart();
});

function restart() {
  state = "idle";
  initGame();
  document.getElementById("title").textContent = "FLAPPY BIRD";
  document.getElementById("sub").textContent = "TAP / SPACE TO START";
  document.getElementById("final").style.display = "none";
  document.getElementById("restart").style.display = "none";
  document.getElementById("exit").style.display = "none";
  document.getElementById("overlay").style.display = "block";
}

function spawnPipe() {
  const minY = 80,
    maxY = H - GAP - 80;
  const topH = Math.random() * (maxY - minY) + minY;
  pipes.push({ x: W + PIPE_W, topH, passed: false });
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);

  // Body glow
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, bird.r + 8);
  glow.addColorStop(0, "rgba(245,158,11,0.3)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, bird.r + 8, 0, Math.PI * 2);
  ctx.fill();

  // Body gradient
  const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, bird.r);
  grad.addColorStop(0, "#fde68a");
  grad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
  ctx.fill();

  // Wing
  ctx.fillStyle = "#d97706";
  ctx.beginPath();
  ctx.ellipse(-4, 4, 12, 6, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(8, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(9, -6, 2, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.moveTo(bird.r - 2, -2);
  ctx.lineTo(bird.r + 10, 0);
  ctx.lineTo(bird.r - 2, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawPipe(p) {
  const accentColor = "#10b981";
  const bodyColor = "#059669";

  // Top pipe body
  const tg = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
  tg.addColorStop(0, "#065f46");
  tg.addColorStop(0.5, bodyColor);
  tg.addColorStop(1, "#064e3b");
  ctx.fillStyle = tg;
  ctx.fillRect(p.x, 0, PIPE_W, p.topH);
  // Top cap
  ctx.fillStyle = accentColor;
  ctx.fillRect(p.x - 5, p.topH - 20, PIPE_W + 10, 20);
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - 5, p.topH - 20, PIPE_W + 10, 20);

  const botY = p.topH + GAP;
  // Bottom pipe body
  ctx.fillStyle = tg;
  ctx.fillRect(p.x, botY, PIPE_W, H - botY);
  // Bottom cap
  ctx.fillStyle = accentColor;
  ctx.fillRect(p.x - 5, botY, PIPE_W + 10, 20);
  ctx.strokeStyle = "#34d399";
  ctx.strokeRect(p.x - 5, botY, PIPE_W + 10, 20);
}

function drawBg() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#0f0a1e");
  grad.addColorStop(0.5, "#1e1b4b");
  grad.addColorStop(1, "#0c0a1a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = "rgba(196,181,253,0.5)";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137 + frame * 0.05) % W;
    const sy = (i * 73) % (H * 0.6);
    const ss = 0.5 + (i % 3) * 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, ss, 0, Math.PI * 2);
    ctx.fill();
  }
}

function checkCollision() {
  if (bird.y - bird.r <= 0 || bird.y + bird.r >= H) return true;
  for (const p of pipes) {
    if (bird.x + bird.r - 8 > p.x && bird.x - bird.r + 8 < p.x + PIPE_W) {
      if (bird.y - bird.r + 8 < p.topH || bird.y + bird.r - 8 > p.topH + GAP)
        return true;
    }
  }
  return false;
}

function loop() {
  drawBg();

  if (state === "playing") {
    frame++;
    bird.vy += GRAV;
    bird.y += bird.vy;
    bird.rot = Math.max(-0.5, Math.min(1.2, bird.vy * 0.06));

    if (frame % 90 === 0) spawnPipe();

    for (let i = pipes.length - 1; i >= 0; i--) {
      pipes[i].x -= 3;
      drawPipe(pipes[i]);
      if (!pipes[i].passed && pipes[i].x + PIPE_W < bird.x) {
        pipes[i].passed = true;
        score++;
        document.getElementById("score-val").textContent = score;
      }
      if (pipes[i].x + PIPE_W < 0) pipes.splice(i, 1);
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.06;
      if (p.life <= 0) {
        particles.splice(i, 1);
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
      state = "dead";
      if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("flappyBest", bestScore);
      }
      const ov = document.getElementById("overlay");
      document.getElementById("title").textContent = "GAME OVER";
      document.getElementById("sub").textContent = `BEST: ${bestScore}`;
      document.getElementById("final").textContent = `SCORE: ${score}`;
      document.getElementById("final").style.display = "block";
      document.getElementById("restart").style.display = "inline-block";
      document.getElementById("exit").style.display = "inline-block";
      ov.style.display = "block";
      window.parent.postMessage({ type: "GAME_OVER", score }, "*");
    }
  } else {
    // Idle floating
    bird.y = H / 2 + Math.sin(Date.now() / 500) * 8;
    bird.rot = 0;
    pipes.forEach((p) => drawPipe(p));
  }

  drawBird();
  requestAnimationFrame(loop);
}

initGame();
loop();
