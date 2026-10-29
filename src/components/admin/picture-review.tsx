"use client";

import { useMemo, useState } from "react";
import { PictureTask } from "@/components/game/picture-task";
import type { BoardCell } from "@/components/game/board";
import {
  PICTURE_CATEGORY,
  PICTURE_FORMATS,
  type PictureFormat,
} from "@/lib/pictures/types";
import { TWEMOJI_CREDIT } from "@/lib/pictures/twemoji";

export type ReviewItem = {
  id: string;
  category: string;
  prompt: string;
  answer: string;
  variants: string[];
  picture: PictureFormat;
  fx: Record<string, unknown> | null;
  reveal_seconds: number | null;
  image_credit: string | null;
  image_license: string | null;
  image_page: string | null;
  enabled: boolean;
};

type Filter = PictureFormat | "all";

const imageSrc = (id: string) => `/api/admin/pictures/image/${id}`;

async function save(ids: string[], enabled: boolean): Promise<boolean> {
  const response = await fetch("/api/admin/pictures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, enabled }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

export function PictureReview({ initial }: { initial: ReviewItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<Filter, { total: number; on: number }>();
    map.set("all", { total: 0, on: 0 });
    for (const format of PICTURE_FORMATS) map.set(format, { total: 0, on: 0 });
    for (const item of items) {
      for (const key of ["all", item.picture] as Filter[]) {
        const entry = map.get(key)!;
        entry.total += 1;
        if (item.enabled) entry.on += 1;
      }
    }
    return map;
  }, [items]);

  const visible = items.filter(
    (item) => filter === "all" || item.picture === filter,
  );

  async function apply(ids: string[], enabled: boolean) {
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    const before = items;
    const set = new Set(ids);
    setItems((list) =>
      list.map((item) => (set.has(item.id) ? { ...item, enabled } : item)),
    );
    const ok = await save(ids, enabled);
    if (!ok) {
      setItems(before);
      setError("Не сохранилось — попробуйте ещё раз.");
    }
    setBusy(false);
  }

  const groups = PICTURE_FORMATS.filter(
    (format) => filter === "all" || filter === format,
  );
  const total = counts.get("all")!;

  return (
    <div className="picture-review">
      <h1 className="text-3xl font-semibold">Картиночные задания</h1>
      <p className="mt-1 text-sm text-muted">
        В игру попадут {total.on} из {total.total}. Убранные задания не выпадают
        в новых комнатах; в теме должно остаться хотя бы 10, иначе тема не
        выпадет совсем.
      </p>

      <div className="review-toolbar" role="toolbar">
        <div className="review-filters">
          {(["all", ...PICTURE_FORMATS] as Filter[]).map((key) => {
            const entry = counts.get(key)!;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                className={`review-chip ${filter === key ? "is-active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {key === "all" ? "Все" : PICTURE_CATEGORY[key]}{" "}
                <span className="review-count">
                  {entry.on}/{entry.total}
                </span>
              </button>
            );
          })}
        </div>
        <div className="review-bulk">
          <button
            type="button"
            className="review-action"
            disabled={busy}
            onClick={() =>
              void apply(
                visible.filter((item) => !item.enabled).map((item) => item.id),
                true,
              )
            }
          >
            Выбрать все
          </button>
          <button
            type="button"
            className="review-action is-ghost"
            disabled={busy}
            onClick={() =>
              void apply(
                visible.filter((item) => item.enabled).map((item) => item.id),
                false,
              )
            }
          >
            Снять все
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {groups.map((format) => {
        const list = visible.filter((item) => item.picture === format);
        if (!list.length) return null;
        const entry = counts.get(format)!;
        return (
          <section key={format} className="review-group" id={format}>
            <h2 className="text-xl font-semibold">
              {PICTURE_CATEGORY[format]}{" "}
              <span className="review-count">
                {entry.on}/{entry.total}
              </span>
            </h2>
            <div className="review-grid">
              {list.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  onToggle={(enabled) => void apply([item.id], enabled)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ReviewCard({
  item,
  busy,
  onToggle,
}: {
  item: ReviewItem;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const credit =
    item.image_credit ??
    (item.picture === "rebus" ||
    item.picture === "emoji" ||
    item.picture === "hidden"
      ? TWEMOJI_CREDIT
      : item.image_license);
  const cell = {
    id: item.id,
    picture: item.picture,
    picture_fx: item.fx,
    reveal_seconds: item.reveal_seconds,
    opened_at: preview,
    image_url: imageSrc(item.id),
    image_license: item.image_license,
    image_credit: null,
    image_page: null,
  } as unknown as BoardCell;

  return (
    <article
      className={`review-card ${item.enabled ? "" : "is-off"}`}
      data-id={item.id}
      data-enabled={item.enabled ? "1" : "0"}
    >
      <div className="review-image">
        {preview ? (
          <PictureTask key={preview} cell={cell} revealed={false} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSrc(item.id)} alt={item.answer} loading="lazy" />
        )}
      </div>
      <p className="mt-2 font-semibold">{item.prompt}</p>
      <p className="mt-1 text-sm">
        Ответ: <b>{item.answer}</b>
      </p>
      {item.variants.length ? (
        <p className="text-sm text-muted">
          Засчитываем: {item.variants.join(", ")}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted">
        {credit}
        {item.image_page ? (
          <>
            {" · "}
            <a
              href={item.image_page}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              страница файла
            </a>
          </>
        ) : null}
      </p>
      <div className="review-card-actions">
        <label className="review-switch">
          <input
            type="checkbox"
            checked={item.enabled}
            disabled={busy}
            onChange={(event) => onToggle(event.target.checked)}
          />
          <span>{item.enabled ? "Оставить" : "Убрано"}</span>
        </label>
        {item.reveal_seconds ? (
          <button
            type="button"
            className="review-link"
            onClick={() =>
              setPreview(preview ? null : new Date().toISOString())
            }
          >
            {preview ? "Картинка целиком" : `Эффект (${item.reveal_seconds} с)`}
          </button>
        ) : null}
      </div>
    </article>
  );
}
