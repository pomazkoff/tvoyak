"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BoardCell } from "@/components/game/board";
import {
  parseVkVideo,
  VK_PLAYER_API,
  vkPlayerSrc,
  vkSegment,
} from "@/lib/media/vk";
import { fallbackSrc, youtubeEmbedVars } from "@/lib/media/youtube";

type Provider = "youtube" | "vk" | "rutube" | "none";

type VkPlayer = {
  on: (event: string, cb: (data?: unknown) => void) => void;
  off?: (event: string, cb: (data?: unknown) => void) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  unmute?: () => void;
  setVolume?: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy?: () => void;
};

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
    VK?: { VideoPlayer?: (iframe: HTMLIFrameElement) => VkPlayer };
  }
}

let vkApi: Promise<void> | null = null;

function loadVkApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.VK?.VideoPlayer) return Promise.resolve();
  if (vkApi) return vkApi;
  vkApi = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = VK_PLAYER_API;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      vkApi = null;
      reject(new Error("vk api"));
    };
    document.body.appendChild(script);
  });
  return vkApi;
}

/** VK с хешем — основной источник; без хеша встраивание не откроется. */
function hasVk(cell: BoardCell): boolean {
  return Boolean(cell.vk_url && parseVkVideo(cell.vk_url)?.hash);
}

/** Куда уходить, если источник не открылся: VK → YouTube → Rutube. */
function nextProvider(cell: BoardCell, failed: Provider): Provider {
  const order: Provider[] = ["vk", "youtube", "rutube"];
  const has = (p: Provider) =>
    p === "vk"
      ? hasVk(cell)
      : p === "youtube"
        ? Boolean(cell.youtube_id)
        : p === "rutube"
          ? Boolean(cell.rutube_url)
          : false;
  for (const p of order.slice(order.indexOf(failed) + 1)) if (has(p)) return p;
  return "none";
}

function firstProvider(cell: BoardCell): Provider {
  if (hasVk(cell)) return "vk";
  if (cell.youtube_id) return "youtube";
  return cell.rutube_url ? "rutube" : "none";
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
/** Сколько даём Rutube на буферизацию после загрузки плеера. */
const FALLBACK_LOAD_ALLOWANCE_MS = 1500;
/** Через сколько VK-плееру разрешаем клики (VK может спросить «вы не робот?»). */
const VK_CHALLENGE_MS = 6000;
/** Если VK так и не заиграл — переходим на YouTube. */
const VK_GIVE_UP_MS = 15000;

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
  const vkFrameRef = useRef<HTMLIFrameElement>(null);
  const [provider, setProvider] = useState<Provider>(() => firstProvider(cell));
  const [vkClickable, setVkClickable] = useState(false);
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
          onError: () => setProvider(nextProvider(cell, "youtube")),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // VK Видео: iframe с js_api=1 и VK.VideoPlayer — старт с нужной секунды
  // (t= в ссылке и seek после inited), стоп по таймкоду, как у YouTube.
  useEffect(() => {
    if (provider !== "vk" || !playing || !cell.vk_url) return;
    const frame = vkFrameRef.current;
    if (!frame) return;
    const { start, end } = vkSegment(cell);
    let disposed = false;
    let started = false;
    let poll = 0;
    let player: VkPlayer | null = null;
    const fail = () => {
      if (disposed) return;
      disposed = true;
      setProvider(nextProvider(cell, "vk"));
    };
    const clickable = window.setTimeout(() => {
      if (!started) setVkClickable(true);
    }, VK_CHALLENGE_MS);
    const giveUp = window.setTimeout(() => {
      if (!started) fail();
    }, VK_GIVE_UP_MS);

    const finish = () => {
      try {
        player?.pause();
      } catch {}
      window.clearInterval(poll);
      setFinished(true);
    };
    const onTime = () => {
      if (!player || disposed) return;
      let now = 0;
      try {
        now = player.getCurrentTime();
      } catch {
        return;
      }
      if (now > 0) {
        if (!started) {
          started = true;
          setVkClickable(false);
        }
      }
      const stopAt = end ?? player.getDuration() ?? 0;
      if (stopAt > 0 && now >= stopAt - END_GUARD_SECONDS) finish();
    };

    loadVkApi()
      .then(() => {
        if (disposed || !window.VK?.VideoPlayer) return;
        player = window.VK.VideoPlayer(frame);
        player.on("inited", () => {
          try {
            player?.unmute?.();
            player?.setVolume?.(1);
            if (
              start &&
              Math.abs((player?.getCurrentTime() ?? 0) - start) > 1.5
            )
              player?.seek(start);
            player?.play();
          } catch {}
        });
        player.on("timeupdate", onTime);
        player.on("started", onTime);
        player.on("ended", finish);
        player.on("error", fail);
        poll = window.setInterval(onTime, 250);
      })
      .catch(fail);

    return () => {
      disposed = true;
      window.clearTimeout(clickable);
      window.clearTimeout(giveUp);
      window.clearInterval(poll);
      try {
        player?.pause();
        player?.destroy?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.vk_url, playing, provider]);

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

  if (cell.audio_url && provider === "none") {
    return (
      <AudioPreview
        src={cell.audio_url}
        start={cell.start_seconds ?? 0}
        end={cell.end_seconds}
        autoplay={autoplay}
        revealed={revealed}
      />
    );
  }

  const fallback = provider === "rutube" ? cell.rutube_url : null;
  const vkSrc =
    provider === "vk" && cell.vk_url
      ? vkPlayerSrc(cell.vk_url, vkSegment(cell).start)
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
        ) : vkSrc && playing ? (
          <iframe
            ref={vkFrameRef}
            title="Видео вопроса"
            src={vkSrc}
            className="media-embed"
            data-provider="vk"
            tabIndex={-1}
            style={vkClickable ? { pointerEvents: "auto" } : undefined}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock"
          />
        ) : vkSrc ? (
          <div className="media-embed" />
        ) : fallback && finished ? (
          <p className="media-missing hand">Фрагмент закончился.</p>
        ) : fallback && playing ? (
          <iframe
            title="Видео вопроса"
            src={fallbackSrc(
              fallback,
              "rutube",
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

/**
 * Музыкальный вопрос по 30-секундному превью (iTunes): только звук под
 * «пластинкой», название трека не показываем до ответа.
 */
function AudioPreview({
  src,
  start,
  end,
  autoplay,
  revealed,
}: {
  src: string;
  start: number;
  end: number | null;
  autoplay: boolean;
  revealed: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [needsTap, setNeedsTap] = useState(!autoplay);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);

  function play() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime < start) audio.currentTime = start;
    setNeedsTap(false);
    // Браузер может запретить автозапуск — тогда остаётся кнопка.
    audio.play().catch(() => setNeedsTap(true));
  }

  useEffect(() => {
    if (autoplay) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div className="media-block">
      {needsTap && !finished ? (
        <button type="button" onClick={play} className="action media-start">
          Включить трек
        </button>
      ) : null}
      <div className={`media-frame is-audio${revealed ? " is-revealed" : ""}`}>
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onError={() => setFailed(true)}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            if (end && end > start && audio.currentTime >= end) {
              audio.pause();
              setFinished(true);
            }
          }}
          onEnded={() => setFinished(true)}
        />
        <div className="media-audio">
          <span className="media-disc" aria-hidden="true" />
          <p className="media-audio-label hand">
            {failed
              ? "Трек не открылся"
              : finished
                ? "Трек закончился"
                : "Слушаем"}
          </p>
          <p className="media-audio-note poster">музыкальный вопрос</p>
        </div>
      </div>
    </div>
  );
}
