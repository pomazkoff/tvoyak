export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    const leftCode = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = leftCode === b.charCodeAt(j - 1) ? 0 : 1;
      const insert = current[j - 1] + 1;
      const remove = previous[j] + 1;
      const replace = previous[j - 1] + cost;
      current[j] = Math.min(insert, remove, replace);
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length] ?? 0;
}

export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

export function containsAsWords(haystack: string, needle: string): boolean {
  if (needle.length < 4 || haystack.length === 0) return false;
  const haystackWords = haystack.split(" ");
  const needleWords = needle.split(" ");
  if (needleWords.length > haystackWords.length) return false;

  for (
    let start = 0;
    start <= haystackWords.length - needleWords.length;
    start += 1
  ) {
    const matches = needleWords.every(
      (word, offset) => haystackWords[start + offset] === word,
    );
    if (matches) return true;
  }

  return false;
}
