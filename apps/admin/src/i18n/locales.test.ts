import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";
import { pickLocale } from "./locales";

describe("pickLocale", () => {
  it.each([
    ["vi", "en-US,en;q=0.9", "vi"],
    ["fr", "vi-VN,vi;q=0.9", "vi"],
    [undefined, "fr-FR,vi;q=0.5,en;q=0.8", "en"],
    [undefined, "fr-FR,vi;q=0.8,en;q=0.5", "vi"],
    [undefined, "vi;q=0", "en"],
    [undefined, null, "en"],
    [undefined, "de", "en"],
  ])("cookie %s, Accept-Language %s → %s", (cookie, header, expected) => {
    expect(pickLocale(cookie, header)).toBe(expected);
  });
});

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("messages", () => {
  it("tiếng Anh và tiếng Việt có cùng các key", () => {
    expect(keys(vi).sort()).toEqual(keys(en).sort());
  });
});
