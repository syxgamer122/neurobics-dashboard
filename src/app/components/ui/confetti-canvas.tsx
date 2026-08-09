import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  shape: "rect" | "circle" | "star";
}

const COLORS = [
  "#00d4ff",
  "#a855f7",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#38bdf8",
  "#818cf8",
  "#34d399",
];

function createParticle(canvasW: number, accent: string): Particle {
  const colors = [...COLORS, accent];
  return {
    x: Math.random() * canvasW,
    y: -10,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 3 + 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: Math.random() * 8 + 4,
    opacity: 1,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.2,
    shape: (["rect", "circle", "star"] as const)[Math.floor(Math.random() * 3)],
  };
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const innerAngle = ((i * 4 + 2) * Math.PI) / 5 - Math.PI / 2;
    if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    ctx.lineTo(
      x + (r / 2) * Math.cos(innerAngle),
      y + (r / 2) * Math.sin(innerAngle),
    );
  }
  ctx.closePath();
  ctx.fill();
}

export function ConfettiCanvas({ accent }: { accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];
    let spawned = 0;
    const MAX_PARTICLES = 120;
    let frame = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn burst trong 60 frame đầu
      if (frame < 60 && spawned < MAX_PARTICLES) {
        const batch = frame < 20 ? 5 : 2;
        for (let i = 0; i < batch && spawned < MAX_PARTICLES; i++) {
          particles.push(createParticle(canvas.width, accent));
          spawned++;
        }
      }
      frame++;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.vx *= 0.99; // air drag
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.008;

        if (p.opacity <= 0 || p.y > canvas.height + 20) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          drawStar(ctx, 0, 0, p.size / 2);
        }
        ctx.restore();
      }

      if (particles.length > 0 || frame < 60) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [accent]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[65] pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
