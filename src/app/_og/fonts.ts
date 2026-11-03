import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Шрифты для ImageResponse (satori не умеет woff2 и variable-шрифты).
 * Статические woff из @fontsource, лицензия SIL OFL 1.1.
 */
const DIR = join(process.cwd(), "src/app/_og/fonts");

type OgFont = {
  name: string;
  data: Buffer;
  weight: 600 | 700 | 900;
  style: "normal";
};

async function load(
  name: string,
  file: string,
  weight: OgFont["weight"],
): Promise<OgFont[]> {
  return Promise.all(
    ["cyrillic", "latin"].map(async (subset) => ({
      // Отдельное имя на подмножество: в fontFamily латиница идёт первой, кириллица — запасной.
      name: subset === "latin" ? `${name}Latin` : name,
      data: await readFile(join(DIR, `${file}-${subset}-${weight}.woff`)),
      weight,
      style: "normal" as const,
    })),
  );
}

export async function ogFonts(): Promise<OgFont[]> {
  const groups = await Promise.all([
    load("Sofia", "sofia-sans-extra-condensed", 900),
    load("Golos", "golos-text", 600),
    load("Caveat", "caveat", 700),
  ]);
  return groups.flat();
}
