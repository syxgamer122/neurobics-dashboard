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

const dino = {
  x: 80,
  y: GND,
  w: 40,
  h: 50,
  normalH: 50,
  duckH: 25,
  vy: 0,
  onGround: true,
  ducking: false,
};
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
    if (dino.ducking) {
      dino.ducking = false;
      dino.h = dino.normalH;
    }
    jump();
  }
  if (e.code === "ArrowDown") {
    e.preventDefault();
    if (dino.onGround && !dino.ducking && started && alive) {
      dino.ducking = true;
      dino.h = dino.duckH;
    }
  }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown") {
    if (dino.ducking) {
      dino.ducking = false;
      dino.h = dino.normalH;
    }
  }
});
document.addEventListener(
  "touchstart",
  (e) => {
    if (e.target.id === "restart" || e.target.id === "exit") return;
    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  (e) => {
    if (e.target.id === "restart" || e.target.id === "exit") return;
    const dy = e.changedTouches[0].clientY - ty;
    if (dy > 30) {
      // swipe down -> duck
      if (dino.onGround && started && alive) {
        dino.ducking = true;
        dino.h = dino.duckH;
        setTimeout(() => {
          if (dino.ducking) {
            dino.ducking = false;
            dino.h = dino.normalH;
          }
        }, 500);
      }
    } else {
      if (dino.ducking) {
        dino.ducking = false;
        dino.h = dino.normalH;
      }
      jump();
    }
  },
  { passive: true },
);
const restartBtn = document.getElementById("restart");
restartBtn.addEventListener("click", reset);
restartBtn.addEventListener("touchstart", (e) => {
  e.stopPropagation();
  reset();
});

function spawnObstacle() {
  const isBird = score > 100 && Math.random() < 0.3;
  if (isBird) {
    const heights = [30, 50, 70]; // low, mid, high
    const h = heights[Math.floor(Math.random() * heights.length)];
    obstacles.push({
      x: W + 20,
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
    obstacles.push({
      x: W + 20,
      w: s[0] * count + (count > 1 ? 8 : 0),
      h: s[1],
      type: "cactus",
      yOffset: 0,
    });
  }
}

function reset() {
  score = 0;
  speed = 4;
  frame = 0;
  alive = true;
  started = false;
  dino.y = GND;
  dino.vy = 0;
  dino.h = dino.normalH;
  dino.ducking = false;
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
  if (dino.ducking) {
    ctx.fillRect(dino.x - 16, y + dino.h - 10, 18, 10);
  } else {
    ctx.fillRect(dino.x - 12, y + dino.h - 16, 14, 10);
  }
  // Legs
  const legY = y + dino.h;
  const legOff = frame % 20 < 10 ? 0 : 6;
  if (!dino.onGround) {
    ctx.fillRect(dino.x + 6, legY - 6, 10, 12);
    ctx.fillRect(dino.x + 22, legY - 6, 10, 12);
  } else {
    ctx.fillRect(dino.x + 6, legY - legOff, 10, 12 + legOff);
    ctx.fillRect(dino.x + 22, legY - (6 - legOff), 10, 12 + (6 - legOff));
  }
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
  if (o.type === "bird") {
    const by = GND - o.yOffset;
    ctx.fillStyle = "#f43f5e"; // Red bird
    ctx.fillRect(o.x, by, o.w, o.h);
    // Wings flap
    const wingY = (frame + o.frameOffset) % 20 < 10 ? -10 : 10;
    ctx.fillStyle = "#e11d48";
    ctx.beginPath();
    ctx.moveTo(o.x + 10, by + 10);
    ctx.lineTo(o.x + 20, by + 10 + wingY);
    ctx.lineTo(o.x + 30, by + 10);
    ctx.fill();
    // Beak
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(o.x - 8, by + 4, 8, 6);
  } else {
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
}

function collides(a, b) {
  const by = b.type === "bird" ? GND - b.yOffset : GND - b.h;
  return (
    a.x + 8 < b.x + b.w &&
    a.x + a.w - 8 > b.x &&
    a.y - a.h + 8 < by + b.h &&
    a.y > by + 4
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
  speed = 4 + score / 200;

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
  if (frame % Math.max(50, 90 - Math.floor(score / 150)) === 0) spawnObstacle();
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
