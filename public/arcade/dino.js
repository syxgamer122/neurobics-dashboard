const c = document.getElementById("c");
const ctx = c.getContext("2d");
const W = Math.min(window.innerWidth, 800);
const H = Math.min(window.innerHeight * 0.75, 300);
c.width = W;
c.height = H;

const GND = H - 60;
let score = 0,
  best = parseInt(localStorage.getItem("dinoBest")) || 0,
  speed = 4,
  frame = 0,
  alive = true,
  started = false;
let raf;

const dino = { x: 80, y: GND, w: 40, h: 50, vy: 0, onGround: true };
const obstacles = [];
const clouds = [
  { x: W * 0.3, y: 40, w: 80 },
  { x: W * 0.7, y: 25, w: 60 },
];

function jump() {
  if (!alive) return;
  if (!started) {
    started = true;
    return;
  }
  if (dino.onGround) {
    dino.vy = -14;
    dino.onGround = false;
  }
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});
document.addEventListener(
  "touchstart",
  (e) => {
    if (e.target.id === "restart") return;
    e.preventDefault();
    jump();
  },
  { passive: false },
);
const restartBtn = document.getElementById("restart");
restartBtn.addEventListener("click", reset);
restartBtn.addEventListener("touchstart", (e) => {
  e.stopPropagation();
  reset();
});

function spawnObstacle() {
  const sizes = [
    [20, 40],
    [25, 55],
    [30, 45],
    [20, 65],
  ];
  const s = sizes[Math.floor(Math.random() * sizes.length)];
  const count = Math.random() < 0.3 ? 2 : 1;
  obstacles.push({
    x: W + 20,
    w: s[0] * count + (count > 1 ? 8 : 0),
    h: s[1],
  });
}

function reset() {
  score = 0;
  speed = 4;
  frame = 0;
  alive = true;
  started = false;
  dino.y = GND;
  dino.vy = 0;
  dino.onGround = true;
  obstacles.length = 0;
  document.getElementById("msg").style.display = "none";
  if (raf) cancelAnimationFrame(raf);
  loop();
}

function drawDino() {
  const y = dino.y - dino.h;
  // Body
  ctx.fillStyle = "#10b981";
  ctx.fillRect(dino.x, y, dino.w, dino.h);
  // Eye
  ctx.fillStyle = "#111827";
  ctx.fillRect(dino.x + dino.w - 10, y + 8, 8, 8);
  // Tail
  ctx.fillStyle = "#059669";
  ctx.fillRect(dino.x - 12, y + dino.h - 16, 14, 10);
  // Legs
  const legY = y + dino.h;
  const legOff = frame % 20 < 10 ? 0 : 6;
  ctx.fillRect(dino.x + 6, legY - legOff, 10, 12 + legOff);
  ctx.fillRect(dino.x + 22, legY - (6 - legOff), 10, 12 + (6 - legOff));
}

function drawGround() {
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GND + 2);
  ctx.lineTo(W, GND + 2);
  ctx.stroke();
  // dots
  ctx.fillStyle = "#374151";
  for (let i = 0; i < W; i += 30) {
    const x = (((i - frame * speed * 0.5) % W) + W) % W;
    ctx.fillRect(x, GND + 6, 4, 2);
  }
}

function drawCloud(cl) {
  ctx.fillStyle = "rgba(55,65,81,0.6)";
  ctx.beginPath();
  ctx.ellipse(cl.x, cl.y, cl.w / 2, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cl.x - cl.w * 0.2, cl.y + 4, cl.w * 0.3, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cl.x + cl.w * 0.2, cl.y + 2, cl.w * 0.25, 9, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawObstacle(o) {
  ctx.fillStyle = "#34d399";
  ctx.fillRect(o.x, GND - o.h, o.w, o.h);
  ctx.fillStyle = "#6ee7b7";
  ctx.fillRect(o.x - 4, GND - o.h - 6, o.w + 8, 10);
  // spikes
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

function collides(a, b) {
  return (
    a.x + 8 < b.x + b.w &&
    a.x + a.w - 8 > b.x &&
    a.y - a.h + 8 < GND - b.h + b.h &&
    a.y > GND - b.h + 4
  );
}

function loop() {
  ctx.clearRect(0, 0, W, H);

  // Clouds
  clouds.forEach((cl) => {
    cl.x -= speed * 0.3;
    if (cl.x + cl.w / 2 < 0) cl.x = W + cl.w;
    drawCloud(cl);
  });

  drawGround();

  if (!started) {
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 13px Courier New";
    ctx.textAlign = "center";
    ctx.fillText("PRESS SPACE / TAP TO START", W / 2, GND - 90);
    ctx.textAlign = "left";
    drawDino();
    raf = requestAnimationFrame(loop);
    return;
  }

  frame++;
  score++;
  speed = 4 + score / 300;

  document.getElementById("score").textContent = score;

  // Dino physics
  dino.vy += 0.7;
  dino.y += dino.vy;
  if (dino.y >= GND) {
    dino.y = GND;
    dino.vy = 0;
    dino.onGround = true;
  }

  // Obstacles
  if (frame % Math.max(60, 90 - Math.floor(score / 100)) === 0) spawnObstacle();
  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= speed;
    drawObstacle(obstacles[i]);
    if (obstacles[i].x + obstacles[i].w < 0) {
      obstacles.splice(i, 1);
      continue;
    }
    if (collides(dino, obstacles[i])) {
      alive = false;
      if (score > best) {
        best = score;
        localStorage.setItem("dinoBest", best);
      }
      document.getElementById("best").textContent = best;
      document.getElementById("final").textContent = score;
      document.getElementById("msg").style.display = "block";
      window.parent.postMessage({ type: "GAME_OVER", score }, "*");
      drawDino();
      return;
    }
  }

  drawDino();
  raf = requestAnimationFrame(loop);
}

loop();
