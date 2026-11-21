/** Debug helper: node eval/splits/probe.ts "text 1" "text 2" ... prints level, matches, suppressed. */
import { detectRisk } from "../../src/domain/risk/lexicon.ts";
for (const t of process.argv.slice(2)) {
  const r = detectRisk(t);
  console.log(`${r.level.padEnd(9)} ${t}\n    matches=${JSON.stringify(r.matches)} suppressed=${JSON.stringify(r.suppressed ?? [])}`);
}
