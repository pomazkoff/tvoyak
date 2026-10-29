"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoardCell } from "@/components/game/board";
import { fallbackSrc, youtubeEmbedVars } from "@/lib/media/youtube";

type Provider = "youtube" | "vk" | "rutube";

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getIframe?: () => HTMLIFrameElement;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          host?: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, number | string>;
          events?: {
            onError?: () => void;
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { target: YTPlayer; data: number }) => void;
          };
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApi: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApi) return youtubeApi;
  youtubeApi = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(script);
  });
  return youtubeApi;
}

/** Запас до края фрагмента: YouTube не должен успеть показать заставку конца. */
const END_GUARD_SECONDS = 0.35;
const YT_ENDED = 0;
/** Сколько даём VK/Rutube на буферизацию после загрузки плеера. */
const FALLBACK_LOAD_ALLOWANCE_MS = 1500;

export function MediaPlayer({
  cell,
  autoplay,
  revealed = false,
}: {
  cell: BoardCell;
  autoplay: boolean;
  revealed?: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [provider, setProvider] = useState<Provider>(
    cell.youtube_id ? "youtube" : cell.vk_url ? "vk" : "rutube",
  );
  const [playing, setPlaying] = useState(autoplay);
  const [finished, setFinished] = useState(false);
  const audioOnly = cell.kind === "music" || cell.curtain;

  useEffect(() => {
    if (cell.kind === "image" || provider !== "youtube" || !cell.youtube_id)
      return;
    let stopped = false;
    let timer = 0;
    const start = cell.start_seconds ?? 0;

    function stopAtEnd(player: YTPlayer) {
      player.pauseVideo();
      window.clearInterval(timer);
      setFinished(true);
    }

    void loadYouTubeApi().then(() => {
      if (stopped || !hostRef.current || !window.YT) return;
      playerRef.current?.destroy();
      const mount = document.createElement("div");
      hostRef.current.replaceChildren(mount);
      playerRef.current = new window.YT.Player(mount, {
        videoId: cell.youtube_id ?? "",
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: youtubeEmbedVars({
          start,
          end: cell.end_seconds,
          autoplay: playing,
          origin: window.location.origin,
        }),
        events: {
          onError: () => {
            if (cell.vk_url) setProvider("vk");
            else if (cell.rutube_url) setProvider("rutube");
          },
          onReady: (event) => {
            const frame = event.target.getIframe?.();
            if (frame) {
              frame.setAttribute("tabindex", "-1");
              frame.style.pointerEvents = "none";
            }
            if (playing) event.target.playVideo();
            timer = window.setInterval(() => {
              const player = event.target;
              const end =
                cell.end_seconds && cell.end_seconds > start
                  ? cell.end_seconds
                  : player.getDuration() || 0;
              if (end > 0 && player.getCurrentTime() >= end - END_GUARD_SECONDS)
                stopAtEnd(player);
            }, 200);
          },
          onStateChange: (event) => {
            // Если всё же доехали до конца — откатываемся, чтобы не было
            // экрана с рекомендациями.
            if (event.data === YT_ENDED) {
              event.target.seekTo(
                Math.max(start, (cell.end_seconds ?? 1) - 1),
                true,
              );
              stopAtEnd(event.target);
            }
          },
        },
      });
    });
    return () => {
      stopped = true;
      window.clearInterval(timer);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [
    cell.end_seconds,
    cell.kind,
    cell.rutube_url,
    cell.start_seconds,
    cell.vk_url,
    cell.youtube_id,
    playing,
    provider,
  ]);

  // VK/Rutube из чужого окна не управляются: фрагмент гасим по таймеру
  // от загрузки плеера (с запасом на буферизацию), чтобы ролик не шёл дальше.
  const fallbackTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(fallbackTimer.current), []);
  function stopFallbackLater() {
    const start = cell.start_seconds ?? 0;
    const end = cell.end_seconds ?? 0;
    if (end <= start) return;
    window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = window.setTimeout(
      () => setFinished(true),
      (end - start) * 1000 + FALLBACK_LOAD_ALLOWANCE_MS,
    );
  }

  if (cell.kind === "image" && cell.image_url) {
    return (
      <div className="polaroid inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cell.image_url}
          alt=""
          className="max-h-[50vh] w-full object-contain"
        />
      </div>
    );
  }

  if (cell.kind !== "video" && cell.kind !== "music") return null;

  const fallback =
    provider === "vk"
      ? cell.vk_url
      : provider === "rutube"
        ? cell.rutube_url
        : null;

  return (
    <div className="media-block">
      {!autoplay && !playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="action media-start"
        >
          {audioOnly ? "Включить трек" : "Включить видео"}
        </button>
      ) : null}
      <div
        className={`media-frame${audioOnly ? " is-audio" : ""}${revealed ? " is-revealed" : ""}`}
      >
        {provider === "youtube" ? (
          <div ref={hostRef} id={`yt-${reactId}`} className="media-embed" />
        ) : fallback && finished ? (
          <p className="media-missing hand">Фрагмент закончился.</p>
        ) : fallback && playing ? (
          <iframe
            title="Видео вопроса"
            src={fallbackSrc(
              fallback,
              provider === "vk" ? "vk" : "rutube",
              cell.start_seconds,
              cell.end_seconds,
            )}
            className="media-embed"
            tabIndex={-1}
            allow="autoplay; encrypted-media; picture-in-picture"
            onLoad={stopFallbackLater}
          />
        ) : fallback ? (
          <div className="media-embed" />
        ) : (
          <p className="media-missing hand">Ролик не открылся.</p>
        )}
        {!revealed && !audioOnly ? (
          <>
            <span className="media-strip is-top" aria-hidden="true" />
            <span className="media-strip is-bottom" aria-hidden="true" />
          </>
        ) : null}
        {audioOnly && !revealed ? (
          <div className="media-audio">
            <span className="media-disc" aria-hidden="true" />
            <p className="media-audio-label hand">
              {finished ? "Трек закончился" : "Слушаем"}
            </p>
            <p className="media-audio-note poster">
              {cell.kind === "music" ? "музыкальный вопрос" : "только звук"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
