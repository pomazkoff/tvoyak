"use client";

import { useState } from "react";
import { trackGoal, type ShareFormat } from "@/lib/analytics/goals";
import { inviteCaption } from "@/lib/share/host-label";
import {
  absoluteUrl,
  hostEveningUrl,
  playPath,
  resultCardPath,
  resultFileName,
  resultPath,
} from "@/lib/share/links";
import { StyledQr } from "@/components/styled-qr";
import { InviteShare, useClientOrigin } from "@/components/game/invite-share";

type Variant = "board" | "phone";

function usePlayUrl(code: string, given?: string): string {
  const origin = useClientOrigin();
  if (given) return given;
  return origin ? absoluteUrl(playPath(code), origin) : "";
}

export function FinaleLoop({
  code,
  playUrl,
  roomId,
  hostLabel,
  variant,
}: {
  code: string;
  playUrl?: string;
  roomId: string | null;
  hostLabel?: string | null;
  variant: Variant;
}) {
  const url = usePlayUrl(code, playUrl);
  const caption = inviteCaption(hostLabel);
  return (
    <section className={`finale-loop is-${variant}`} aria-label="После партии">
      <EveningCall roomId={roomId} caption={caption} />
      <InviteShare url={url} code={code} />
      <ResultShare code={code} />
    </section>
  );
}

export function EveningCall({
  roomId,
  caption,
}: {
  roomId: string | null;
  caption: string | null;
}) {
  const href = hostEveningUrl(roomId);
  return (
    <div className="finale-evening">
      <a
        className="finale-qr-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Проведи свой вечер — открыть Твояк"
        onClick={() => trackGoal("final_qr_click")}
      >
        <StyledQr value={href} label="QR-код: провести свой вечер" />
      </a>
      {caption ? <p className="finale-invite-caption">{caption}</p> : null}
      <a
        className="action finale-host-btn"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackGoal("final_qr_click")}
      >
        Проведи свой вечер
      </a>
    </div>
  );
}

export function ResultShare({ code }: { code: string }) {
  const [format, setFormat] = useState<"stories" | "square">("stories");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function fileFor(kind: "stories" | "square"): Promise<File | null> {
    const response = await fetch(resultCardPath(code, kind));
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], resultFileName(kind), {
      type: blob.type || "image/png",
    });
  }

  function pageUrl(): string {
    return absoluteUrl(resultPath(code), window.location.origin);
  }

  async function shareLink(): Promise<"shared" | "copied"> {
    const url = pageUrl();
    if (typeof navigator.share === "function") {
      await navigator.share({
        title: "Твояк",
        text: "Наш итог в Твояке",
        url,
      });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  }

  async function share() {
    if (pending) return;
    setPending(true);
    setNote(null);
    let goal: ShareFormat = "link";
    try {
      const file = await fileFor(format);
      const canFile =
        file != null &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (file && canFile) {
        await navigator.share({
          files: [file],
          title: "Твояк",
          text: "Наш итог в Твояке",
        });
        goal = format;
      } else {
        const how = await shareLink();
        goal = "link";
        setNote(
          how === "copied"
            ? "Ссылка на итог скопирована"
            : "Отправили ссылку на итог",
        );
      }
      trackGoal("share_click", { format: goal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNote("Не удалось поделиться. Можно скачать картинку.");
    } finally {
      setPending(false);
    }
  }

  async function download() {
    if (pending) return;
    setPending(true);
    setNote(null);
    try {
      const response = await fetch(resultCardPath(code, format));
      if (!response.ok) {
        setNote("Картинка ещё не собралась.");
        return;
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = resultFileName(format);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      trackGoal("share_click", { format: "download" });
    } catch {
      setNote("Не удалось скачать картинку.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="result-share">
      <p className="hand result-share-title">Картинка итога</p>
      <div className="share-formats" role="group" aria-label="Формат картинки">
        <button
          type="button"
          className={`share-format${format === "stories" ? " is-on" : ""}`}
          aria-pressed={format === "stories"}
          onClick={() => setFormat("stories")}
        >
          Сторис
        </button>
        <button
          type="button"
          className={`share-format${format === "square" ? " is-on" : ""}`}
          aria-pressed={format === "square"}
          onClick={() => setFormat("square")}
        >
          Квадрат
        </button>
      </div>
      <div className="share-actions">
        <button
          type="button"
          className="action"
          disabled={pending}
          onClick={() => void share()}
        >
          Поделиться
        </button>
        <button
          type="button"
          className="action is-ink"
          disabled={pending}
          onClick={() => void download()}
        >
          Скачать картинку
        </button>
      </div>
      {note ? (
        <p className="share-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
