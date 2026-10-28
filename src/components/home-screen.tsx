"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Panel, Shell } from "@/components/shell";
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
    <Shell width="max-w-xl">
      <div className="mb-8">
        <h1 className="text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
          Твояк
        </h1>
        <p className="mt-4 max-w-md text-lg leading-7 text-muted">
          Своя игра для компании. Ведущий на телевизоре, игроки с телефонов. Без
          установки и без аккаунтов.
        </p>
      </div>

      <Panel>
        <h2 className="text-xl font-semibold">Новая комната</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Ведущий не играет. На экране будет код и QR, за стол сядут до десяти
          человек.
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm text-muted">Кто ведёт</legend>
          <div className="mt-3 grid gap-2">
            <ModeOption
              checked={hostMode === "human"}
              label="Живой ведущий"
              hint="Вы за ноутбуком или у телевизора."
              onSelect={() => setHostMode("human")}
            />
            <ModeOption
              checked={hostMode === "bot"}
              label="Ведущий-бот"
              hint="Браузер читает вопросы вслух и сам засчитывает ответы."
              onSelect={() => setHostMode("bot")}
            />
          </div>
        </fieldset>

        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void createRoom()}
          disabled={pending}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-gold px-6 font-semibold text-navy transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Создаём…" : "Создать комнату"}
        </button>
      </Panel>

      <Panel className="mt-4">
        <h2 className="text-xl font-semibold">Уже есть код</h2>
        <label className="mt-4 block text-sm text-muted" htmlFor="room-code">
          Четыре латинские буквы
        </label>
        <input
          id="room-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ABCD"
          className="mt-2 w-full rounded-2xl border border-line bg-navy px-4 py-3 font-mono text-2xl tracking-[0.3em] text-gold uppercase outline-none focus:border-gold"
        />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <a
            href={normalizedCode ? `/play/${normalizedCode}` : undefined}
            aria-disabled={!normalizedCode}
            className={`inline-flex h-12 flex-1 items-center justify-center rounded-full bg-gold font-semibold text-navy ${normalizedCode ? "" : "pointer-events-none opacity-40"}`}
          >
            Войти как игрок
          </a>
          <a
            href={normalizedCode ? `/host/${normalizedCode}` : undefined}
            aria-disabled={!normalizedCode}
            className={`inline-flex h-12 flex-1 items-center justify-center rounded-full border border-line font-semibold text-ink ${normalizedCode ? "hover:border-gold" : "pointer-events-none opacity-40"}`}
          >
            Экран ведущего
          </a>
        </div>
      </Panel>
    </Shell>
  );
}

function ModeOption({
  checked,
  label,
  hint,
  onSelect,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`cursor-pointer rounded-2xl border px-4 py-3 ${checked ? "border-gold bg-navy" : "border-line"}`}
    >
      <input
        type="radio"
        name="hostMode"
        checked={checked}
        onChange={onSelect}
        className="mr-2 accent-[#f0c75e]"
      />
      <span className="font-medium">{label}</span>
      <span className="mt-1 block pl-6 text-sm text-muted">{hint}</span>
    </label>
  );
}
