import type { Metadata } from "next";
import { Suspense } from "react";
import { EveningCall, ResultShare } from "@/components/game/finale-loop";
import { SeasonalLine } from "@/components/seasonal/seasonal-line";
import { Opening, Panel, Shell } from "@/components/shell";
import { loadShareResult } from "@/lib/share/load-result";
import { resultPath } from "@/lib/share/links";
import { leadersOf, resultMeta } from "@/lib/share/result";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const result = await loadShareResult(code);
  const share = resultMeta(result);
  return {
    title: share.title,
    description: share.description,
    openGraph: {
      title: share.title,
      description: share.description,
      url: result.state === "missing" ? "/itog" : resultPath(result.code),
    },
  };
}

export default function ItogPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <Suspense fallback={<Opening label="Собираем итог…" />}>
      <ItogBody params={params} />
    </Suspense>
  );
}

async function ItogBody({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await loadShareResult(code);
  return (
    <Shell width="max-w-xl">
      <SeasonalLine className="seasonal-greet">С наступающим!</SeasonalLine>
      {result.state === "missing" ? (
        <Panel className="mt-6">
          <h1 className="text-3xl font-semibold">Такого итога нет</h1>
          <p className="mt-2 text-muted">
            Проверьте код комнаты. Если партия ещё не закончилась, итог появится
            в конце.
          </p>
        </Panel>
      ) : null}
      {result.state === "playing" ? (
        <Panel className="mt-6">
          <p className="hand text-3xl text-pen">Комната {result.code}</p>
          <h1 className="mt-2 text-3xl font-semibold">Партия ещё идёт</h1>
          <p className="mt-2 text-muted">
            Итог откроется, когда вечер закончится. Пока можно просто зайти
            играть.
          </p>
        </Panel>
      ) : null}
      {result.state === "finished" ? (
        <Finished result={result} />
      ) : (
        <div className="mt-6">
          <EveningCall
            roomId={result.state === "playing" ? result.roomId : null}
            caption={null}
          />
        </div>
      )}
    </Shell>
  );
}

function Finished({
  result,
}: {
  result: Extract<
    Awaited<ReturnType<typeof loadShareResult>>,
    { state: "finished" }
  >;
}) {
  const leaders = leadersOf(result.players);
  return (
    <div className="mt-6 grid gap-4">
      <Panel>
        {result.mode === "together" ? (
          <>
            <p className="hand text-2xl text-pen">вместе</p>
            <h1 className="text-3xl font-semibold">Общий счёт</h1>
            <p className="poster team-finale-score">
              {result.team?.score ?? 0}
            </p>
            <p>
              {(result.team?.bestStreak ?? 0) > 0
                ? `Лучшая серия ${result.team?.bestStreak}`
                : "Серия не собралась"}
            </p>
          </>
        ) : (
          <>
            <p className="hand text-2xl text-pen">
              {leaders.length > 1 ? "ничья" : "победитель"}
            </p>
            <h1 className="text-3xl font-semibold">
              {leaders.length
                ? leaders.map((player) => player.nickname).join(" и ")
                : "Партия сыграна"}
            </h1>
          </>
        )}
        {result.nomination ? (
          <p className="hand mt-3 text-2xl text-pen">
            {result.nomination.title} — {result.nomination.nickname}
          </p>
        ) : null}
        {result.players.length > 0 ? (
          result.mode === "together" ? (
            <>
              <h2 className="hand mt-4 text-2xl">Кто принёс</h2>
              <ul className="mt-2 grid gap-2">
                {result.players.map((player, index) => (
                  <li
                    key={`${player.nickname}-${index}`}
                    className="flex justify-between"
                  >
                    <span>{player.nickname}</span>
                    <span className="text-gold">{player.score}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <ol className="mt-4 grid gap-2">
              {result.players.map((player, index) => (
                <li
                  key={`${player.nickname}-${index}`}
                  className="flex justify-between"
                >
                  <span>
                    {index + 1}. {player.nickname}
                  </span>
                  <span
                    className={player.score < 0 ? "text-danger" : "text-gold"}
                  >
                    {player.score}
                  </span>
                </li>
              ))}
            </ol>
          )
        ) : null}
      </Panel>
      <EveningCall roomId={result.roomId} caption={null} />
      <ResultShare code={result.code} />
    </div>
  );
}
