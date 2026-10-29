// Ключ ведущего живёт в localStorage, а он у каждого адреса свой: у каждого
// превью Vercel новый хост, у телевизора — свой браузер. Поэтому ключ можно
// передать ссылкой. Он во фрагменте (#k=…): фрагмент не уходит на сервер и
// не пишется в логи, а страница ведущего сразу убирает его из адресной строки.

const SECRET = /^[A-Za-z0-9_-]{16,128}$/;

export function hostLink(origin: string, code: string, secret: string): string {
  return `${origin.replace(/\/$/, "")}/host/${code}#k=${encodeURIComponent(secret)}`;
}

export function hostPath(code: string, secret: string): string {
  return `/host/${code}#k=${encodeURIComponent(secret)}`;
}

export function secretFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const raw = params.get("k");
  if (!raw) return null;
  return SECRET.test(raw) ? raw : null;
}

/** Хеш без ключа: остальные параметры фрагмента (если будут) сохраняем. */
export function hashWithoutSecret(hash: string): string {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  params.delete("k");
  const rest = params.toString();
  return rest ? `#${rest}` : "";
}
