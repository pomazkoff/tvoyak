"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Sway = {
  rot: string;
  dx?: string;
  dy?: string;
  className: string;
  children: ReactNode;
};

function swayStyle(rot: string, dx = "10px", dy = "7px"): CSSProperties {
  return { "--rot": rot, "--dx": dx, "--dy": dy } as CSSProperties;
}

function Pin({ rot, dx, dy, className, children }: Sway) {
  return (
    <div className={`pin obj sway ${className}`} style={swayStyle(rot, dx, dy)}>
      <span className="pin-tape" />
      <div className="pin-art">{children}</div>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function MarginDecor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;
    let frame = 0;
    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth - 0.5;
        const y = event.clientY / window.innerHeight - 0.5;
        node.style.setProperty("--px", x.toFixed(3));
        node.style.setProperty("--py", y.toFixed(3));
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div className="margin-decor" ref={ref} aria-hidden>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
      <span className="cross tl" />
      <span className="cross tr" />
      <span className="cross bl" />
      <span className="cross br" />
      <p className="slate round">
        Round
        <br />
        01
      </p>
      <p className="slate scene">
        Scene
        <br />
        Take
      </p>
      <svg
        className="ruler obj sway"
        style={swayStyle("0deg", "4px", "3px")}
        viewBox="0 0 120 16"
      >
        <path d="M1 13h118" stroke="currentColor" strokeWidth="1" />
        {Array.from({ length: 13 }, (_, index) => (
          <path
            key={index}
            d={`M${4 + index * 9} 13v-${index % 5 === 0 ? 8 : 4}`}
            stroke="currentColor"
            strokeWidth="1"
          />
        ))}
      </svg>
      <span
        className="loose-tape a obj sway"
        style={swayStyle("-8deg", "6px", "4px")}
      />
      <span
        className="loose-tape b obj sway"
        style={swayStyle("6deg", "6px", "4px")}
      />
      <div
        className="sticker obj sway"
        style={swayStyle("-6deg", "8px", "6px")}
      >
        500
        <span>НОМИНАЛ</span>
      </div>
      <div className="stamp obj sway" style={swayStyle("-14deg", "7px", "5px")}>
        <span>
          ТВОЯК
          <small>TAKE</small>
        </span>
      </div>
      <Pin className="note" rot="-6deg" dx="12px" dy="8px">
        <Icon>
          <path d="M16 36V12l18-3v24" />
          <circle cx="13" cy="36" r="3.2" />
          <circle cx="31" cy="33" r="3.2" />
        </Icon>
      </Pin>
      <Pin className="mic" rot="5deg" dx="11px" dy="9px">
        <Icon>
          <rect x="18" y="6" width="12" height="18" rx="6" />
          <path d="M14 20a10 10 0 0 0 20 0M24 30v8M17 38h14" />
        </Icon>
      </Pin>
      <Pin className="clap" rot="6deg" dx="12px" dy="8px">
        <Icon>
          <path d="M8 18h32v18H8z" />
          <path d="M8 18l7-8h7l-7 8h6l7-8h8l-7 8" />
        </Icon>
      </Pin>
      <Pin className="pad" rot="-4deg" dx="9px" dy="11px">
        <Icon>
          <rect x="7" y="16" width="34" height="18" rx="8" />
          <path d="M16 21v8M12 25h8" />
          <circle cx="31" cy="23" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="35" cy="27" r="1.3" fill="currentColor" stroke="none" />
        </Icon>
      </Pin>
      <Pin className="play" rot="8deg" dx="8px" dy="6px">
        <Icon>
          <rect x="8" y="14" width="32" height="20" rx="5" />
          <path d="M21 19l9 5-9 5z" />
        </Icon>
      </Pin>
    </div>
  );
}
