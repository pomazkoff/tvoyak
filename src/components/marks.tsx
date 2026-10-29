export function RoughDefs() {
  return (
    <svg className="rough-defs" aria-hidden>
      <filter id="rough" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.04"
          numOctaves="2"
          seed="3"
          result="noise"
        />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
      </filter>
    </svg>
  );
}

export function Logo({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const variant = compact ? "logo-compact" : "";
  return (
    <span className={`logo-lockup ${variant} ${className}`.trim()}>
      <span className="tape" aria-hidden />
      <span className={`logo ${variant}`.trim()}>
        ТВО<span className="logo-ya">Я</span>К
      </span>
    </span>
  );
}

export function HandRing() {
  return (
    <svg
      className="hand-ring"
      viewBox="0 0 220 90"
      preserveAspectRatio="none"
      aria-hidden
    >
      <ellipse cx="110" cy="46" rx="96" ry="32" />
    </svg>
  );
}

export function Strike() {
  return (
    <svg
      className="strike"
      viewBox="0 0 120 36"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d="M4 26C24 6 48 34 116 8" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg className="arrow" viewBox="0 0 140 48" aria-hidden>
      <path d="M6 28C36 8 78 40 118 16" />
      <path d="M104 8l16 8-18 12" />
    </svg>
  );
}

/* Иконки режима: линия одной толщины, круглые концы, чуть «от руки». */
export function HostSketch() {
  return (
    <svg viewBox="0 0 96 72" className="sketch" aria-hidden>
      {/* ведущий в пиджаке с бабочкой, микрофон у рта */}
      <g transform="translate(8 0)">
        <path d="M26.4 15.2c-.1-5.3 4-9.6 9.3-9.7 5.2-.1 9.5 4 9.7 9.2.1 5.3-4 9.6-9.3 9.8-5.2.1-9.6-4-9.7-9.3z" />
        <path d="M27.8 10.6c2.6-3.2 7-4.4 11.2-3 1.8.6 3.4 1.6 4.6 3" />
        <path className="dot" d="M32.6 14.8v.4M39.4 14.6v.4" />
        <path d="M33 19c1.8 1.5 4.3 1.5 6.1 0" />
        <path d="M33.2 24.6v3M38.8 24.4v3" />
        <path d="M33.2 27.6c-6 .5-10.8 2-13.4 4.8-2 2.2-2.6 5-2.8 8.4l-.6 19.8c-.1 2.2 1.6 3.8 3.8 3.8h31.4c2.2 0 3.9-1.7 3.8-3.9l-.4-19.8c-.1-3.4-.8-6.2-2.8-8.4-2.6-2.8-7.2-4.2-13.2-4.7" />
        <path d="M53.2 36.2c4.4 3.4 8.6 7.4 12.4 12" />
        <path d="M65.6 48.2c-.6-5.4-1.6-10.8-3-15.8" />
        <path d="M59.2 26.4l3.4-.4c1-.1 1.8.5 1.9 1.5l.3 2.4c.1 1-.5 1.8-1.5 1.9l-3.4.4c-1 .1-1.8-.5-1.9-1.5l-.3-2.4c-.1-1 .5-1.8 1.5-1.9z" />
        <path d="M59.4 26.2 55.8 22.4" />
        <path d="M48.4 18.6c.6-2.2 2.8-3.4 5-2.8 2.2.6 3.4 2.8 2.8 5-.6 2.2-2.8 3.4-5 2.8-2.2-.6-3.4-2.8-2.8-5z" />
        <path d="M50.4 17.2l4.4 4.6" />
        <path d="M32.8 28l3.2 2 3.2-2v4.2l-3.2-2-3.2 2z" />
        <path d="M32.2 32.4 36 43.4l3.8-11" />
        <path className="dot" d="M36 49v.4M36 55.6v.4" />
        <path d="M59.4 11.6c1.8 1.6 2.4 3.8 1.6 5.8" />
        <path d="M63.8 8c3 2.6 3.8 6.8 2 10.2" />
      </g>
    </svg>
  );
}

export function BotSketch() {
  return (
    <svg viewBox="0 0 96 72" className="sketch" aria-hidden>
      {/* антенна */}
      <path d="M48.2 13.6c-.3-2.4 0-4.6.6-6.6" />
      <path d="M46.6 4.9c.4-1.4 1.9-2.2 3.3-1.8 1.4.4 2.2 1.9 1.8 3.3-.4 1.4-1.9 2.2-3.3 1.8-1.4-.4-2.2-1.9-1.8-3.3z" />
      {/* голова */}
      <path d="M39.2 13.8h18.6c5 0 8.8 3.9 8.8 8.9v9.6c0 5-3.9 8.9-8.9 8.8l-18.8-.2c-4.9 0-8.7-4-8.6-8.9l.1-9.4c0-4.9 3.9-8.8 8.8-8.8z" />
      <path d="M30.4 24.4h-3.2c-.9 0-1.6.7-1.6 1.6v5.4c0 .9.7 1.6 1.6 1.6h3.2" />
      <path d="M66.6 24.2h3.2c.9 0 1.6.7 1.6 1.6v5.4c0 .9-.7 1.6-1.6 1.6h-3.2" />
      <path className="dot" d="M41.4 26v.6M55.4 26v.6" />
      <path d="M43.6 33.2c2.8 2.2 7 2.2 9.8-.1" />
      {/* туловище и машущая рука */}
      <path d="M44 41.4v4M53 41.4v4" />
      <path d="M40.6 45.6h15.8c3.4 0 6 2.6 6 6v9.6c0 3.3-2.7 5.9-6 5.9H40.4c-3.3 0-5.9-2.7-5.8-6l.1-9.6c0-3.3 2.6-5.9 5.9-5.9z" />
      <path d="M45.4 56.4c1.6-1.8 4.6-1.8 6.1.1" />
      <path d="M62.6 53.4c4.4-.4 7.6-3.6 8.6-8.4" />
      <path d="M69.4 42.2l2.1 2.9 3.2-1.6" />
      <path d="M34.6 54c-3.6 1-5.8 4.2-6.2 8.4" />
    </svg>
  );
}
