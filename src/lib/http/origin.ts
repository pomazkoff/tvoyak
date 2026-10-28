export function originFromHeaders(headerList: Headers): string {
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return "";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (process.env.VERCEL ? "https" : "http");
  return `${proto}://${host}`;
}
