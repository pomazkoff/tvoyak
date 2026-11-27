"use client";

import { useEffect, useRef } from "react";

type Kind = "dot" | "soft" | "star";

type Flake = {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  phase: number;
  spin: number;
  sprite: HTMLCanvasElement;
};

function flakeCount(width: number): number {
  if (width < 700) return 50;
  return 96;
}

function pixelRatio(width: number): number {
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const cheap = width < 900 || (typeof memory === "number" && memory <= 4);
  if (cheap) return 1;
  return Math.min(window.devicePixelRatio || 1, 1.25);
}

function paintSprite(kind: Kind, radius: number): HTMLCanvasElement {
  const halo = kind === "soft" ? radius * 1.65 : radius + 2;
  const size = Math.max(2, Math.ceil(halo * 2));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const pen = canvas.getContext("2d");
  if (!pen) return canvas;
  const center = size / 2;
  if (kind === "soft") {
    const glow = pen.createRadialGradient(
      center,
      center,
      radius * 0.15,
      center,
      center,
      halo,
    );
    glow.addColorStop(0, "rgba(255,255,255,0.98)");
    glow.addColorStop(0.42, "rgba(255,255,255,0.86)");
    glow.addColorStop(0.72, "rgba(255,255,255,0.42)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    pen.fillStyle = glow;
    pen.beginPath();
    pen.arc(center, center, halo, 0, Math.PI * 2);
    pen.fill();
    return canvas;
  }
  if (kind === "star") {
    pen.translate(center, center);
    pen.strokeStyle = "rgba(255,255,255,0.96)";
    pen.lineWidth = Math.max(1.8, radius * 0.34);
    pen.lineCap = "round";
    pen.beginPath();
    for (let arm = 0; arm < 3; arm += 1) {
      const angle = (Math.PI / 3) * arm;
      pen.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      pen.lineTo(-Math.cos(angle) * radius, -Math.sin(angle) * radius);
    }
    pen.stroke();
    pen.fillStyle = "rgba(255,255,255,0.98)";
    pen.beginPath();
    pen.arc(0, 0, Math.max(1.4, radius * 0.22), 0, Math.PI * 2);
    pen.fill();
    return canvas;
  }
  pen.fillStyle = "rgba(255,255,255,0.97)";
  pen.beginPath();
  pen.arc(center, center, radius, 0, Math.PI * 2);
  pen.fill();
  return canvas;
}

function makeFlakes(width: number, height: number): Flake[] {
  const cache = new Map<string, HTMLCanvasElement>();
  const sprite = (kind: Kind, radius: number) => {
    const key = `${kind}:${Math.round(radius)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const painted = paintSprite(kind, radius);
    cache.set(key, painted);
    return painted;
  };
  return Array.from({ length: flakeCount(width) }, () => {
    const roll = Math.random();
    const kind: Kind = roll < 0.16 ? "soft" : roll < 0.3 ? "star" : "dot";
    const r =
      kind === "soft"
        ? 10 + Math.random() * 6
        : kind === "star"
          ? 5 + Math.random() * 4
          : 3.4 + Math.random() * 4.2;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      r,
      vy: (kind === "soft" ? 0.22 : 0.32) + Math.random() * 0.45,
      drift: 0.2 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.01,
      sprite: sprite(kind, r),
    };
  });
}

/**
 * Снег на весь экран, под содержимым (z-index: -1): буквы, QR и медиа
 * остаются сверху. Хлопья белые и крупные, спрайты кэшируются.
 * На узком экране их меньше, плотность пикселей не выше 1.25.
 * При prefers-reduced-motion кадр один, без requestAnimationFrame.
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
          flake.phase += flake.spin;
          flake.x +=
            Math.sin(flake.phase + flake.y * 0.01) * flake.drift * 0.35;
          const margin = flake.r * 2 + 8;
          if (flake.y > height + margin) {
            flake.y = -margin;
            flake.x = Math.random() * width;
          }
          if (flake.x < -margin) flake.x = width + margin;
          if (flake.x > width + margin) flake.x = -margin;
        }
        const sprite = flake.sprite;
        context.save();
        context.translate(flake.x, flake.y);
        context.rotate(flake.phase);
        context.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
        context.restore();
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
