"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Arrow, BotSketch, HostSketch, Logo } from "@/components/marks";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { messageFor } from "@/lib/rooms/messages";
import { saveHostSecret } from "@/lib/rooms/storage";
import type { HostMode } from "@/lib/supabase/types";

export function HomeScreen() {
  const router = useRouter();
  const [hostMode, setHostMode] = useState<HostMode>("human");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedCode = normalizeRoomCode(code);

  async function createRoom() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostMode }),
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
      router.push(`/host/${payload.code}`);
    } catch {
      setError(messageFor("network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="home-grid">
      <div>
        <Logo className="home-logo" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="torn-line hand">
            Своя игра для компании. Ведущий на телевизоре, игроки с телефонов.
          </p>
          <Arrow />
        </div>
      </div>
      <div>
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
          <p className="hand text-2xl">Уже есть код</p>
          <label className="sr-only" htmlFor="room-code">
            Четыре латинские буквы
          </label>
          <div className="code-cells mono mt-2">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index}>{code[index] ?? ""}</span>
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
          <div className="mt-3 flex gap-2">
            <a
              href={normalizedCode ? `/play/${normalizedCode}` : undefined}
              aria-disabled={!normalizedCode}
              className={`action flex-1 ${normalizedCode ? "" : "pointer-events-none opacity-40"}`}
            >
              Игрок
            </a>
            <a
              href={normalizedCode ? `/host/${normalizedCode}` : undefined}
              aria-disabled={!normalizedCode}
              className={`action flex-1 bg-ink ${normalizedCode ? "" : "pointer-events-none opacity-40"}`}
            >
              Ведущий
            </a>
          </div>
        </section>
      </div>
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
    <label className="mode-card">
      <input
        type="radio"
        name="hostMode"
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {sketch}
      <span className="hand mt-1 block text-center text-2xl">{label}</span>
      {checked ? (
        <svg
          className="hand-ring"
          viewBox="0 0 200 120"
          preserveAspectRatio="none"
          aria-hidden
        >
          <ellipse cx="100" cy="60" rx="92" ry="50" />
        </svg>
      ) : null}
    </label>
  );
}
