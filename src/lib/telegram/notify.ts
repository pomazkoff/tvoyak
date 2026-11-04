import "server-only";

/** Сообщение в группу заявок (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). */
export async function notifyTelegram(
  text: string,
  tag = "telegram_notify",
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) console.error(tag, response.status);
    return response.ok;
  } catch {
    console.error(tag, "network");
    return false;
  }
}
