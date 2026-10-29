"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoardCell } from "@/components/game/board";

type Provider = "youtube" | "vk" | "rutube";

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  getCurrentTime: () => number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onError?: () => void;
            onReady?: (event: { target: YTPlayer }) => void;
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

export function MediaPlayer({
  cell,
  autoplay,
}: {
  cell: BoardCell;
  autoplay: boolean;
}) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [provider, setProvider] = useState<Provider>(
    cell.youtube_id ? "youtube" : cell.vk_url ? "vk" : "rutube",
  );
  const [playing, setPlaying] = useState(autoplay);

  useEffect(() => {
    if (cell.kind === "image" || provider !== "youtube" || !cell.youtube_id)
      return;
    let stopped = false;
    let timer = 0;
    void loadYouTubeApi().then(() => {
      if (stopped || !hostRef.current || !window.YT) return;
      playerRef.current?.destroy();
      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId: cell.youtube_id ?? "",
        playerVars: {
          start: cell.start_seconds ?? 0,
          end: cell.end_seconds ?? 0,
          autoplay: playing ? 1 : 0,
          controls: cell.curtain ? 0 : 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onError: () => {
            if (cell.vk_url) setProvider("vk");
            else if (cell.rutube_url) setProvider("rutube");
          },
          onReady: (event) => {
            if (playing) event.target.playVideo();
            if (cell.end_seconds) {
              timer = window.setInterval(() => {
                if (event.target.getCurrentTime() >= (cell.end_seconds ?? 0)) {
                  event.target.pauseVideo();
                  window.clearInterval(timer);
                }
              }, 400);
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
    cell.curtain,
    cell.end_seconds,
    cell.kind,
    cell.rutube_url,
    cell.start_seconds,
    cell.vk_url,
    cell.youtube_id,
    playing,
    provider,
  ]);

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
    <div className="grid gap-3">
      {!autoplay && !playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="h-12 bg-gold font-semibold text-navy"
        >
          Включить трек
        </button>
      ) : null}
      <div className="polaroid">
        <div className="relative aspect-video bg-black">
          {provider === "youtube" ? (
            <div ref={hostRef} id={`yt-${reactId}`} className="h-full w-full" />
          ) : fallback ? (
            <iframe
              title="Видео вопроса"
              src={withTimecode(fallback, provider, cell.start_seconds)}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <p className="p-6 text-sm text-muted">Ролик не открылся.</p>
          )}
          {cell.curtain ? (
            <div className="absolute inset-0 bg-[#1a1916]" aria-hidden="true" />
          ) : null}
        </div>
      </div>
      {cell.curtain ? (
        <p className="text-sm text-muted">
          Шторка: картинки не видно, только звук.
        </p>
      ) : null}
    </div>
  );
}

function withTimecode(
  url: string,
  provider: Provider,
  start: number | null,
): string {
  if (!start) return url;
  const glue = url.includes("?") ? "&" : "?";
  if (provider === "rutube") return `${url}${glue}t=${start}`;
  return `${url}${glue}t=${start}s`;
}
