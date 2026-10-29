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
      {/* голова и вихор */}
      <path d="M29.6 23.4c-.3-6.6 4.7-11.8 11-12 6.5-.2 11.4 4.7 11.5 11 .1 6.4-4.7 11.6-11.1 11.7-6.2.1-11.2-4.6-11.4-10.7z" />
      <path d="M37.4 11.4c1.6-2.9 5.2-3.7 7.6-1.6" />
      <path className="dot" d="M36.6 21.6v.4M45 21.4v.4" />
      <path d="M36.9 27c2.3 2 5.6 2.1 8 .1" />
      {/* плечи */}
      <path d="M19.4 67c.7-12.6 9.4-21.4 21.2-21.6 7.2-.1 13.2 3 16.9 8.4" />
      {/* рука с микрофоном */}
      <path d="M58.4 64.6c-.2-6.4 1.6-12.4 5.3-18.4" />
      <path d="M63.2 47.4 58 35.6" />
      <path d="M53.4 30.9c-.8-2.6.7-5.3 3.3-6.1 2.6-.8 5.3.7 6.1 3.3.8 2.6-.7 5.2-3.3 6-2.6.8-5.3-.6-6.1-3.2z" />
      {/* звук */}
      <path d="M68.4 22.6c2.4 2.6 2.6 6.4.5 9.2" />
      <path d="M73.6 17.8c4.6 4.9 5 12.4.9 17.8" />
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
