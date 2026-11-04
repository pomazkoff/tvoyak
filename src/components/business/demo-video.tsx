"use client";

import { useEffect, useRef, useState } from "react";

const SRC = "/demo/tvoyak-demo-16x9.mp4";
const POSTER = "/demo/tvoyak-demo-poster.jpg";

/**
 * Демо-ролик на /business: грузится, только когда блок рядом с экраном,
 * играет без звука по кругу; звук включается кнопкой или в контролах.
 */
export function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.src = SRC;
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || !visible) return;
    node.load();
    void node.play().catch(() => {});
  }, [visible]);

  function toggleSound() {
    const node = ref.current;
    if (!node) return;
    node.muted = !node.muted;
    setMuted(node.muted);
    if (!node.muted) void node.play().catch(() => {});
  }

  return (
    <figure className="biz-demo">
      <div className="biz-demo-frame sheet">
        <video
          ref={ref}
          className="biz-demo-video"
          poster={POSTER}
          muted
          loop
          playsInline
          controls
          preload="none"
          width={1920}
          height={1080}
          onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
          aria-label="Демо: как проходит игра в Твояк"
        >
          {visible ? <source src={SRC} type="video/mp4" /> : null}
        </video>
        <button type="button" className="biz-demo-sound" onClick={toggleSound}>
          {muted ? "🔊 Включить звук" : "🔇 Без звука"}
        </button>
      </div>
      <figcaption className="biz-note">
        Запись настоящей партии на tvoyak.ru. Музыка: «Neon Snap With Bright
        Punchy Groove» — Alex Morgan, Free Music Archive, CC BY 4.0.
      </figcaption>
    </figure>
  );
}
