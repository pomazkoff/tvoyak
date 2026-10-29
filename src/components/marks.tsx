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

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 820 240"
      role="img"
      aria-label="Твояк"
    >
      <text
        x="8"
        y="190"
        fill="#141414"
        fontFamily="var(--font-marker), cursive"
        fontSize="190"
      >
        Твояк
      </text>
    </svg>
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

export function HostSketch() {
  return (
    <svg viewBox="0 0 80 64" className="sketch" aria-hidden>
      <circle cx="40" cy="16" r="8" />
      <path d="M24 58c2-16 8-22 16-22s14 6 16 22" />
      <path d="M18 40h10M52 40h10" />
    </svg>
  );
}

export function BotSketch() {
  return (
    <svg viewBox="0 0 80 64" className="sketch" aria-hidden>
      <rect x="22" y="16" width="36" height="28" rx="4" />
      <path d="M40 8v8M30 28h6M44 28h6M30 38h20" />
      <path d="M22 30H12M58 30h10" />
    </svg>
  );
}
