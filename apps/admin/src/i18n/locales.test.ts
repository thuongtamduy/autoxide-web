import { createTranslator } from "next-intl";
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

  // Câu là cú pháp ICU: `<…>` là thẻ, `{…}` là chỗ điền. Câu viết sai cú pháp chỉ lộ ra lúc
  // hiện trên màn (lỗi INVALID_MESSAGE), nên kiểm mọi câu ở đây.
  it.each([
    ["en", en],
    ["vi", vi],
  ])("mọi câu %s đúng cú pháp ICU", (locale, messages) => {
    const broken: string[] = [];
    const t = createTranslator({
      locale,
      messages,
      onError: (error) => {
        if (error.code === "INVALID_MESSAGE") broken.push(error.message);
      },
    });
    for (const key of keys(messages)) {
      // Thiếu giá trị để điền là lỗi khác (FORMATTING_ERROR), không tính ở đây.
      (t as unknown as (key: string) => string)(key);
    }
    expect(broken).toEqual([]);
  });
});
