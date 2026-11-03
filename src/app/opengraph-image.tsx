import { ImageResponse } from "next/og";
import { ogFonts } from "./_og/fonts";

export const alt =
  "Твояк — викторина для компании: табло на телевизоре, ответы с телефонов";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Шрифты читаем при загрузке модуля: так картинка собирается при билде.
const fonts = await ogFonts();

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 90px",
        background: "#ECEAE4",
        color: "#141414",
        fontFamily: "GolosLatin, Golos",
      }}
    >
      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          alignItems: "center",
          background: "#F7F6F2",
          padding: "6px 34px 14px",
          transform: "rotate(-3deg)",
          boxShadow: "0 18px 30px -18px rgba(0,0,0,0.45)",
          fontFamily: "SofiaLatin, Sofia",
          fontWeight: 900,
          fontSize: 210,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        <span>ТВО</span>
        <span
          style={{
            background: "#D7261E",
            color: "#FFFFFF",
            padding: "0 14px",
            margin: "0 6px",
            transform: "rotate(6deg)",
          }}
        >
          Я
        </span>
        <span>К</span>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 56,
          fontFamily: "CaveatLatin, Caveat",
          fontWeight: 700,
          fontSize: 64,
          lineHeight: 1.1,
          color: "#2B4A9A",
        }}
      >
        викторина для своих
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 22,
          fontSize: 40,
          fontWeight: 600,
          lineHeight: 1.25,
          maxWidth: 1000,
        }}
      >
        Табло на телевизоре, ответы с телефонов по QR‑коду. Без установки.
      </div>
    </div>,
    { ...size, fonts },
  );
}
