import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Та же буква, что в icon.svg, на красном квадрате. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#D7261E",
      }}
    >
      <svg width="180" height="180" viewBox="0 0 32 32">
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M20.2 4.5h6.3v23H20.2V18.6L10.4 27.5H5.2l10.2-9.4C10.2 16.6 7.4 13.8 7.4 9.6 7.4 6.2 9.8 4.5 13.2 4.5H20.2zm-6.2 4.1c-1.5 0-2.4.9-2.4 2.5s.9 2.6 2.5 2.6h6.1V8.6H14z"
        />
      </svg>
    </div>,
    size,
  );
}
