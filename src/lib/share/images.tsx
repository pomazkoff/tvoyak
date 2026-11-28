import type { ReactElement } from "react";
import type { FinishedShare, SharePlayer } from "./result";
import { leadersOf, seatTable } from "./result";

export const CARD_SIZE = {
  stories: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  og: { width: 1200, height: 630 },
} as const;

export type CardKind = keyof typeof CARD_SIZE;

const PAPER = "#ECEAE4";
const INK = "#141414";
const SHEET = "#F7F6F2";
const RED = "#D7261E";
const PEN = "#2B4A9A";
const TAPE = "#FFF6CF";

function LogoMark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-start",
        background: SHEET,
        padding: "4px 22px 10px",
        transform: "rotate(-3deg)",
        fontFamily: "SofiaLatin, Sofia",
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color: INK,
      }}
    >
      <span>ТВО</span>
      <span
        style={{
          display: "flex",
          background: RED,
          color: "#FFFFFF",
          padding: "0 8px",
          margin: "0 4px",
          transform: "rotate(6deg)",
        }}
      >
        Я
      </span>
      <span>К</span>
    </div>
  );
}

function titleSize(text: string, kind: CardKind): number {
  const base = kind === "stories" ? 92 : kind === "square" ? 68 : 58;
  const length = Array.from(text).length;
  if (length > 22) return Math.round(base * 0.55);
  if (length > 14) return Math.round(base * 0.72);
  return base;
}

type Headline = {
  kicker: string;
  title: string;
  score: string;
  sub: string;
};

function headline(result: FinishedShare): Headline {
  if (result.mode === "together") {
    const best = result.team?.bestStreak ?? 0;
    const played = result.team?.played ?? 0;
    const correct = result.team?.correct ?? 0;
    const streak = best > 0 ? `Лучшая серия ${best}` : "Серия не собралась";
    const guessed = played > 0 ? `Угадано ${correct} из ${played}` : "";
    return {
      kicker: "вместе",
      title: "Общий счёт",
      score: String(result.team?.score ?? 0),
      sub: [streak, guessed].filter(Boolean).join(" · "),
    };
  }
  const leaders = leadersOf(result.players);
  if (leaders.length === 1 && leaders[0]) {
    return {
      kicker: "победитель",
      title: leaders[0].nickname,
      score: String(leaders[0].score),
      sub: "",
    };
  }
  if (leaders.length > 1) {
    const names = leaders
      .slice(0, 3)
      .map((player) => player.nickname)
      .join(" и ");
    const more = leaders.length > 3 ? ` и ещё ${leaders.length - 3}` : "";
    return {
      kicker: "ничья",
      title: `${names}${more}`,
      score: String(leaders[0]?.score ?? 0),
      sub: "",
    };
  }
  return { kicker: "итог", title: "Партия сыграна", score: "", sub: "" };
}

function rowLimit(kind: CardKind, together: boolean): number {
  if (kind === "og") return together ? 3 : 4;
  if (kind === "square") return together ? 4 : 5;
  return together ? 6 : 8;
}

function ScoreRows({
  players,
  limit,
  font,
  together,
}: {
  players: SharePlayer[];
  limit: number;
  font: number;
  together: boolean;
}) {
  const table = seatTable(players);
  const shown = table.slice(0, limit);
  const rest = table.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {together ? (
        <div
          style={{
            display: "flex",
            fontFamily: "CaveatLatin, Caveat",
            fontWeight: 700,
            fontSize: font + 6,
            color: PEN,
            marginBottom: 6,
          }}
        >
          Кто принёс
        </div>
      ) : null}
      {shown.map((player, index) => (
        <div
          key={`${player.nickname}-${index}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottom: `2px solid ${INK}`,
            padding: "8px 0",
            fontFamily: "GolosLatin, Golos",
            fontWeight: 600,
            fontSize: font,
          }}
        >
          <span>
            {together ? player.nickname : `${index + 1}. ${player.nickname}`}
          </span>
          <span
            style={{
              display: "flex",
              marginLeft: 16,
              color: player.score < 0 ? RED : INK,
              fontFamily: "SofiaLatin, Sofia",
              fontWeight: 900,
              fontSize: font + 8,
            }}
          >
            {player.score}
          </span>
        </div>
      ))}
      {rest > 0 ? (
        <div
          style={{
            display: "flex",
            marginTop: 8,
            fontFamily: "GolosLatin, Golos",
            fontWeight: 600,
            fontSize: font - 4,
            color: "#55534E",
          }}
        >
          и ещё {rest}
        </div>
      ) : null}
    </div>
  );
}

export function resultImage(
  result: FinishedShare,
  kind: CardKind,
): ReactElement {
  const face = headline(result);
  const stories = kind === "stories";
  const portrait = kind !== "og";
  const font = stories ? 40 : kind === "square" ? 32 : 28;
  const pad = stories
    ? "76px 72px"
    : kind === "square"
      ? "52px 56px"
      : "44px 56px";
  const rows = (
    <ScoreRows
      players={result.players}
      limit={rowLimit(kind, result.mode === "together")}
      font={font}
      together={result.mode === "together"}
    />
  );
  const nomination = result.nomination ? (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        marginTop: 22,
        background: TAPE,
        color: PEN,
        fontFamily: "CaveatLatin, Caveat",
        fontWeight: 700,
        fontSize: stories ? 52 : 40,
        lineHeight: 1,
        padding: "8px 18px 12px",
        transform: "rotate(-2deg)",
      }}
    >
      {result.nomination.title} — {result.nomination.nickname}
    </div>
  ) : null;
  const season = result.seasonal ? (
    <div
      style={{
        display: "flex",
        marginTop: 16,
        fontFamily: "CaveatLatin, Caveat",
        fontWeight: 700,
        fontSize: stories ? 48 : 36,
        color: PEN,
      }}
    >
      С наступающим!
    </div>
  ) : null;

  if (!portrait) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          color: INK,
          padding: pad,
        }}
      >
        <div style={{ display: "flex", flex: 1 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 560,
              paddingRight: 28,
            }}
          >
            <LogoMark size={86} />
            {season}
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontFamily: "CaveatLatin, Caveat",
                fontWeight: 700,
                fontSize: 42,
                color: PEN,
              }}
            >
              {face.kicker}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "SofiaLatin, Sofia",
                fontWeight: 900,
                fontSize: titleSize(face.title, kind),
                lineHeight: 0.95,
              }}
            >
              {face.title}
            </div>
            {face.score ? (
              <div
                style={{
                  display: "flex",
                  fontFamily: "SofiaLatin, Sofia",
                  fontWeight: 900,
                  fontSize: 92,
                  lineHeight: 0.9,
                  color: RED,
                }}
              >
                {face.score}
              </div>
            ) : null}
            {face.sub ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 8,
                  fontFamily: "GolosLatin, Golos",
                  fontWeight: 600,
                  fontSize: 28,
                }}
              >
                {face.sub}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", flex: 1, paddingTop: 12 }}>{rows}</div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          {nomination ?? <div style={{ display: "flex" }} />}
          <div
            style={{
              display: "flex",
              fontFamily: "GolosLatin, Golos",
              fontWeight: 600,
              fontSize: 32,
            }}
          >
            tvoyak.ru
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: PAPER,
        color: INK,
        padding: pad,
      }}
    >
      <LogoMark size={stories ? 112 : 84} />
      {season}
      <div
        style={{
          display: "flex",
          marginTop: stories ? 36 : 18,
          fontFamily: "CaveatLatin, Caveat",
          fontWeight: 700,
          fontSize: stories ? 56 : 40,
          color: PEN,
        }}
      >
        {face.kicker}
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "SofiaLatin, Sofia",
          fontWeight: 900,
          fontSize: titleSize(face.title, kind),
          lineHeight: 0.95,
        }}
      >
        {face.title}
      </div>
      {face.score ? (
        <div
          style={{
            display: "flex",
            fontFamily: "SofiaLatin, Sofia",
            fontWeight: 900,
            fontSize: stories ? 168 : 112,
            lineHeight: 0.9,
            color: RED,
          }}
        >
          {face.score}
        </div>
      ) : null}
      {face.sub ? (
        <div
          style={{
            display: "flex",
            marginTop: 8,
            fontFamily: "GolosLatin, Golos",
            fontWeight: 600,
            fontSize: stories ? 36 : 28,
          }}
        >
          {face.sub}
        </div>
      ) : null}
      <div style={{ display: "flex", marginTop: stories ? 36 : 20 }}>
        {rows}
      </div>
      {nomination}
      <div style={{ display: "flex", flex: 1 }} />
      <div
        style={{
          display: "flex",
          marginTop: 24,
          fontFamily: "GolosLatin, Golos",
          fontWeight: 600,
          fontSize: stories ? 40 : 32,
        }}
      >
        tvoyak.ru
      </div>
    </div>
  );
}

export function inviteImage(code: string | null): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: PAPER,
        color: INK,
        padding: "0 80px",
      }}
    >
      <LogoMark size={132} />
      <div
        style={{
          display: "flex",
          marginTop: 36,
          fontFamily: "CaveatLatin, Caveat",
          fontWeight: 700,
          fontSize: 58,
          color: PEN,
        }}
      >
        вас зовут играть
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: "SofiaLatin, Sofia",
          fontWeight: 900,
          fontSize: code ? 140 : 92,
          lineHeight: 0.95,
          letterSpacing: code ? "0.08em" : "-0.02em",
        }}
      >
        {code ?? "Твояк"}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 18,
          maxWidth: 980,
          fontFamily: "GolosLatin, Golos",
          fontWeight: 600,
          fontSize: 36,
          lineHeight: 1.25,
        }}
      >
        Первая партия бесплатно. Табло на экране, ответы с телефонов.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontFamily: "GolosLatin, Golos",
          fontWeight: 600,
          fontSize: 32,
        }}
      >
        tvoyak.ru
      </div>
    </div>
  );
}

export function pendingResultImage(): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: PAPER,
        color: INK,
        padding: "0 80px",
      }}
    >
      <LogoMark size={132} />
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontFamily: "CaveatLatin, Caveat",
          fontWeight: 700,
          fontSize: 64,
          color: PEN,
        }}
      >
        итог вечера
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 16,
          fontFamily: "GolosLatin, Golos",
          fontWeight: 600,
          fontSize: 40,
        }}
      >
        Появится, когда партия закончится.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 28,
          fontFamily: "GolosLatin, Golos",
          fontWeight: 600,
          fontSize: 32,
        }}
      >
        tvoyak.ru
      </div>
    </div>
  );
}
