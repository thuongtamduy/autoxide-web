import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";
import { localePath, routing } from "./routing";

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

  // Câu là cú pháp ICU: `{…}` là chỗ điền. Câu sai cú pháp chỉ lộ ra lúc hiện trên trang
  // (lỗi INVALID_MESSAGE), nên kiểm mọi câu ở đây.
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
      (t as unknown as (key: string) => string)(key);
    }
    expect(broken).toEqual([]);
  });
});

describe("ngôn ngữ trên địa chỉ", () => {
  it("tiếng Việt ở gốc, tiếng Anh dưới /en", () => {
    expect(routing.defaultLocale).toBe("vi");
    expect(localePath("vi", "/blog")).toBe("/blog");
    expect(localePath("en", "/blog")).toBe("/en/blog");
    expect(localePath("en", "/")).toBe("/en");
    expect(localePath("vi", "blog")).toBe("/blog");
  });
});
