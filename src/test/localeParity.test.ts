import { describe, it, expect } from "vitest";

const en = import.meta.glob("@/locales/en/*.json", { eager: true, import: "default" }) as Record<string, object>;
const es = import.meta.glob("@/locales/es/*.json", { eager: true, import: "default" }) as Record<string, object>;

function keys(o: object, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
const byName = (m: Record<string, object>) =>
  Object.fromEntries(Object.entries(m).map(([p, v]) => [p.split("/").pop()!, v]));

describe("locale parity", () => {
  const E = byName(en), S = byName(es);
  it.each(Object.keys(E))("%s has the same keys in en and es", name => {
    expect(S[name]).toBeDefined();
    const ek = new Set(keys(E[name])), sk = new Set(keys(S[name]));
    expect([...ek].filter(k => !sk.has(k))).toEqual([]);
    expect([...sk].filter(k => !ek.has(k))).toEqual([]);
  });
});
