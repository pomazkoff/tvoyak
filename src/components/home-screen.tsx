"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useBackgroundMusic } from "@/components/game/background-music";
import { armSpeechUnlock } from "@/components/game/speech";
import { MusicToggle } from "@/components/game/music-toggle";
import { Arrow, BotSketch, HostSketch, Logo } from "@/components/marks";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { messageFor } from "@/lib/rooms/messages";
import { companyId } from "@/lib/rooms/company";
import { hostPath } from "@/lib/rooms/host-link";
import { saveHostSecret } from "@/lib/rooms/storage";
import type { HostMode } from "@/lib/supabase/types";

export function HomeScreen() {
  const router = useRouter();
  const [hostMode, setHostMode] = useState<HostMode>("human");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedCode = normalizeRoomCode(code);
  // Тихий фон и на главной: браузер включит его с первого клика или
  // клавиши, а после «Создать комнату» музыка продолжится на экране ведущего.
  useBackgroundMusic({ suppressed: false });
  // Тот же первый клик разблокирует и голос ведущего для /host.
  useEffect(() => {
    armSpeechUnlock();
  }, []);

  async function createRoom() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostMode,
          companyId: companyId(safeStorage()) ?? undefined,
        }),
      });
      const payload = (await response.json()) as {
        code?: string;
        hostSecret?: string;
        error?: string;
      };
      if (!response.ok || !payload.code || !payload.hostSecret) {
        setError(messageFor(payload.error));
        return;
      }
      const saved = saveHostSecret(payload.code, payload.hostSecret);
      if (!saved) {
        setError(
          "Браузер не сохранил ключ ведущего. Экран комнаты всё равно откроется.",
        );
      }
      // Ключ и в адресе: страница ведущего сохранит его сама и уберёт из
      // строки, даже если localStorage здесь недоступен.
      router.push(hostPath(payload.code, payload.hostSecret));
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="home-grid">
      <div className="home-brand">
        <Logo />
        <p className="logo-caption hand">своя игра для своих</p>
        <div className="home-lead">
          <p className="torn-line hand">
            Своя игра для компании.
            <br />
            Ведущий на телевизоре, игроки с телефонов.
          </p>
          <Arrow />
        </div>
      </div>
      <div className="home-stack">
        <section className="sheet home-sheet">
          <span className="tape hand" style={{ transform: "rotate(-3deg)" }}>
            Новая комната
          </span>
          <p className="mt-3 max-w-[34ch] text-[17px] leading-6 text-muted">
            Ведущий не играет. На экране будет код и QR, за стол сядут до десяти
            человек.
          </p>
          <div className="mode-row">
            <ModeCard
              checked={hostMode === "human"}
              label="Живой ведущий"
              onSelect={() => setHostMode("human")}
              sketch={<HostSketch />}
            />
            <ModeCard
              checked={hostMode === "bot"}
              label="Ведущий-бот"
              onSelect={() => setHostMode("bot")}
              sketch={<BotSketch />}
            />
          </div>
          {error ? (
            <p className="mt-3 text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void createRoom()}
            disabled={pending}
            className="action mt-4 w-full"
          >
            {pending ? "Создаём…" : "Создать комнату"}
          </button>
        </section>
        <section className="ticket home-ticket">
          <span className="tape ticket-tape" aria-hidden />
          <p className="hand home-ticket-title">Уже есть код</p>
          <label className="sr-only" htmlFor="room-code">
            Четыре латинские буквы
          </label>
          <div className="code-cells mono mt-2">
            {Array.from({ length: 4 }, (_, index) => (
              <span
                key={index}
                className={
                  index === Math.min(code.length, 3) ? "is-next" : undefined
                }
              >
                {code[index] ?? ""}
              </span>
            ))}
            <input
              id="room-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
              }
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Код комнаты"
            />
          </div>
          <p className="code-hint">Четыре буквы с экрана ведущего</p>
          <div className="code-actions">
            <a
              href={normalizedCode ? `/play/${normalizedCode}` : undefined}
              aria-disabled={!normalizedCode}
              className="action"
            >
              Игрок
            </a>
            <a
              href={normalizedCode ? `/host/${normalizedCode}` : undefined}
              aria-disabled={!normalizedCode}
              className="action is-ink"
            >
              Ведущий
            </a>
          </div>
        </section>
      </div>
      <MusicToggle credits />
    </main>
  );
}

function ModeCard({
  checked,
  label,
  onSelect,
  sketch,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
  sketch: ReactNode;
}) {
  return (
    <label className={`mode-card ${checked ? "is-picked" : ""}`}>
      <input
        type="radio"
        name="hostMode"
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {sketch}
      <span className="hand mode-label">{label}</span>
      {checked ? <span className="pick-ring" aria-hidden /> : null}
    </label>
  );
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
