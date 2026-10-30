import { readFileSync } from "node:fs";
import { leakCheck } from "@/lib/packs/review";
const file = process.argv[2] ?? "scripts/new-categories/text.json";
const items = JSON.parse(readFileSync(file, "utf8"));
let bad = 0;
for (const q of items) {
  const leak = leakCheck(q);
  if (leak.notes) {
    console.log(
      leak.blocking ? "BLOCK" : "part ",
      q.category,
      "|",
      q.prompt.slice(0, 60),
      "|",
      leak.notes,
    );
    if (leak.blocking) bad++;
  }
  if (q.value < 100 || q.value > 500) console.log("VALUE", q.prompt);
}
console.log("blocking:", bad, "of", items.length);
