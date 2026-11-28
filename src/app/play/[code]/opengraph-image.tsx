import { ImageResponse } from "next/og";
import { ogFonts } from "@/app/_og/fonts";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { inviteImage } from "@/lib/share/images";

export const alt = "Вас зовут в Твояк";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const room = normalizeRoomCode(code);
  return new ImageResponse(inviteImage(room), {
    ...size,
    fonts: await ogFonts(),
  });
}
