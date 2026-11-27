"use client";

import { useEffect, useRef } from "react";

type Flake = {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  phase: number;
  light: boolean;
};

function flakeCount(width: number): number {
  if (width < 700) return 28;
  return 52;
}

function pixelRatio(width: number): number {
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const cheap = width < 900 || (typeof memory === "number" && memory <= 4);
  if (cheap) return 1;
  return Math.min(window.devicePixelRatio || 1, 1.25);
}

function makeFlakes(width: number, height: number): Flake[] {
  const count = flakeCount(width);
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: 1.3 + Math.random() * 2.3,
    vy: 0.16 + Math.random() * 0.38,
    drift: 0.12 + Math.random() * 0.35,
    phase: Math.random() * Math.PI * 2,
    light: Math.random() > 0.4,
  }));
}

/**
 * Редкий снег на весь экран. Холст под содержимым (z-index: -1),
 * поэтому хлопья не перекрывают буквы, QR и медиа. На дешёвых экранах
 * меньше хлопьев и плотность пикселей 1. При prefers-reduced-motion
 * кадр один, без requestAnimationFrame.
 */
export function Snow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let flakes: Flake[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let resizeFrame = 0;
    let running = !document.hidden;

    const draw = (still: boolean) => {
      context.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        if (!still) {
          flake.y += flake.vy;
          flake.x +=
            Math.sin(flake.phase + flake.y * 0.012) * flake.drift * 0.3;
          if (flake.y > height + 6) {
            flake.y = -6;
            flake.x = Math.random() * width;
          }
          if (flake.x < -8) flake.x = width + 8;
          if (flake.x > width + 8) flake.x = -8;
        }
        context.strokeStyle = flake.light
          ? "rgba(255,255,255,0.92)"
          : "rgba(150, 182, 206, 0.9)";
        context.fillStyle = context.strokeStyle;
        if (flake.r > 2.5) {
          context.save();
          context.translate(flake.x, flake.y);
          context.rotate(flake.phase);
          context.lineWidth = 1.1;
          context.beginPath();
          context.moveTo(-flake.r, 0);
          context.lineTo(flake.r, 0);
          context.moveTo(0, -flake.r);
          context.lineTo(0, flake.r);
          context.moveTo(-flake.r * 0.7, -flake.r * 0.7);
          context.lineTo(flake.r * 0.7, flake.r * 0.7);
          context.moveTo(flake.r * 0.7, -flake.r * 0.7);
          context.lineTo(-flake.r * 0.7, flake.r * 0.7);
          context.stroke();
          context.restore();
        } else {
          context.beginPath();
          context.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "rgba(96, 124, 148, 0.4)";
          context.lineWidth = 0.6;
          context.stroke();
        }
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = pixelRatio(width);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      flakes = makeFlakes(width, height);
      draw(true);
    };

    const loop = () => {
      if (!running || motion.matches) return;
      draw(false);
      frame = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (!running || motion.matches) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(loop);
    };

    const onResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(resize);
    };

    const onMotion = () => {
      window.cancelAnimationFrame(frame);
      if (motion.matches) draw(true);
      else start();
    };

    const onVis = () => {
      running = !document.hidden;
      if (running) start();
      else window.cancelAnimationFrame(frame);
    };

    resize();
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);
    motion.addEventListener("change", onMotion);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  return <canvas ref={ref} className="seasonal-snow" aria-hidden="true" />;
}
