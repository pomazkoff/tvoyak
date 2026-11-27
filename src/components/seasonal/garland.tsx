const BULBS = 18;

/** Гирлянда над экраном ведущего. Видимость — в seasonal.css, по data-season и :has(.stage, .lobby, .tv-page). */
export function Garland() {
  return (
    <div className="seasonal-garland" aria-hidden="true">
      <svg
        className="seasonal-wire"
        viewBox="0 0 1600 36"
        preserveAspectRatio="none"
      >
        <path
          d="M0 8 C 70 26, 130 6, 200 14 S 330 28, 400 10 S 530 4, 600 16 S 730 30, 800 10 S 930 4, 1000 16 S 1130 30, 1200 10 S 1330 4, 1400 16 S 1530 28, 1600 8"
          fill="none"
          stroke="#141414"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
      <span className="seasonal-bulbs">
        {Array.from({ length: BULBS }, (_, index) => (
          <span
            key={index}
            className="seasonal-bulb"
            data-c={index % 4}
            style={{ animationDelay: `${(index % 6) * 0.32}s` }}
          />
        ))}
      </span>
    </div>
  );
}
