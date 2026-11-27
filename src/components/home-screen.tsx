"use client";

import { vkGoal } from "@/lib/analytics/vk-pixel";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useBackgroundMusic } from "@/components/game/background-music";
import { armSpeechUnlock } from "@/components/game/speech";
import { MusicToggle } from "@/components/game/music-toggle";
import {
  Arrow,
  BotSketch,
  HostSketch,
  Logo,
  TogetherSketch,
  VersusSketch,
} from "@/components/marks";
import { SeasonalLine } from "@/components/seasonal/seasonal-line";
import { ThemePicker } from "@/components/theme-picker";
import { authHeader, deviceId } from "@/lib/billing/client";
import { isPaywallError } from "@/lib/billing/products";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { messageFor, themeBoardMessage } from "@/lib/rooms/messages";
import { companyId } from "@/lib/rooms/company";
import { hostPath } from "@/lib/rooms/host-link";
import { clearPickedThemes, savePickedThemes } from "@/lib/rooms/picked-themes";
import { saveHostSecret } from "@/lib/rooms/storage";
import type { HostMode, PlayMode } from "@/lib/supabase/types";

export function HomeScreen() {
  const router = useRouter();
  const [hostMode, setHostMode] = useState<HostMode>("human");
  const [playMode, setPlayMode] = useState<PlayMode>("versus");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const normalizedCode = normalizeRoomCode(code);
  // Тихий фон и на главной: браузер включит его с первого клика или
  // клавиши, а после «Создать комнату» музыка продолжится на экране ведущего.
  useBackgroundMusic({ suppressed: false });
  // Тот же первый клик разблокирует и голос ведущего для /host.
  useEffect(() => {
    armSpeechUnlock();
  }, []);

  async function createRoom(categories?: string[]) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({
          deviceId: deviceId() ?? undefined,
          hostMode,
          playMode,
          companyId: companyId(safeStorage()) ?? undefined,
          ...(categories ? { categories } : {}),
        }),
      });
      const payload = (await response.json()) as {
        code?: string;
        hostSecret?: string;
        error?: string;
        themes?: string[];
      };
      if (response.status === 402 && isPaywallError(payload.error)) {
        router.push(`/pay?need=${payload.error}&mode=${hostMode}`);
        return;
      }
      if (!response.ok || !payload.code || !payload.hostSecret) {
        setError(
          categories
            ? themeBoardMessage(payload.error, payload.themes)
            : messageFor(payload.error),
        );
        return;
      }
      vkGoal("room_created");
      if (payload.themes?.length === 12) {
        savePickedThemes(sessionStorageSafe(), payload.code, payload.themes);
      } else {
        clearPickedThemes(sessionStorageSafe());
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
    <>
      <div className="home-grid">
        <div className="home-brand">
          <Logo />
          <p className="logo-caption hand">викторина для своих</p>
          <SeasonalLine className="seasonal-greet">С наступающим!</SeasonalLine>
          <div className="home-lead">
            <h1 className="torn-line hand">
              Викторина для компании.
              <br />
              Табло на телевизоре, ответы с телефонов.
            </h1>
            <Arrow />
          </div>
          <ol className="home-steps">
            <li>
              <b>1</b> Создай комнату на телефоне
            </li>
            <li>
              <b>2</b> На телевизоре открой tvoyak.ru/tv и введи код
            </li>
            <li>
              <b>3</b> Друзья заходят по QR. Первая игра бесплатно
            </li>
          </ol>
        </div>
        <div className="home-stack">
          <section className="sheet home-sheet">
            <span className="tape hand" style={{ transform: "rotate(-3deg)" }}>
              Новая комната
            </span>
            <p className="mt-3 max-w-[34ch] text-[17px] leading-6 text-muted">
              {playMode === "together"
                ? "Один счёт на всех. Кто-то угадал — очки ваши. Можно и в одного, с этого же телефона."
                : "Ведущий не играет. На экране будет код и QR, за стол сядут до десяти человек."}
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
            <p className="play-mode-caption hand">Как играем</p>
            <div className="mode-row" data-play-mode={playMode}>
              <ModeCard
                name="playMode"
                checked={playMode === "versus"}
                label="Против друг друга"
                onSelect={() => setPlayMode("versus")}
                sketch={<VersusSketch />}
              />
              <ModeCard
                name="playMode"
                checked={playMode === "together"}
                label="Вместе"
                onSelect={() => setPlayMode("together")}
                sketch={<TogetherSketch />}
              />
            </div>
            {playMode === "together" ? (
              <p className="mt-3 text-sm text-muted">
                Одному телевизор не нужен: после создания сядь за стол на этом
                же экране. Друзей можно позвать по QR — ответ любого идёт в
                общий котёл.
              </p>
            ) : null}
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
              {pending && !picking ? "Создаём…" : "Создать комнату — бесплатно"}
            </button>
            <button
              type="button"
              className="theme-open"
              disabled={pending}
              onClick={() => {
                setError(null);
                setPicking(true);
              }}
            >
              Выбрать темы
            </button>
            <a href="/tv" className="action is-ink home-tv-btn">
              Это телевизор — ввести код
            </a>
            <p className="home-phone-note">
              После создания комнаты на экране будет код из шести цифр. На
              телевизоре открой tvoyak.ru/tv и введи его — вход там не нужен.
            </p>
            <a href="#room-code" className="home-code-link">
              У меня есть код
            </a>
          </section>
          <section className="ticket home-ticket" id="have-code">
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
                  setCode(
                    event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                  )
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
      </div>
      {picking ? (
        <ThemePicker
          pending={pending}
          error={error}
          onClose={() => {
            if (pending) return;
            setPicking(false);
            setError(null);
          }}
          onCreate={(categories) => void createRoom(categories)}
        />
      ) : null}
    </>
  );
}

function ModeCard({
  checked,
  label,
  onSelect,
  sketch,
  name = "hostMode",
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
  sketch: ReactNode;
  name?: string;
}) {
  return (
    <label className={`mode-card ${checked ? "is-picked" : ""}`}>
      <input
        type="radio"
        name={name}
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

function sessionStorageSafe(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
