import { describe, expect, it } from "vitest";
import { z } from "zod";
import { nextDone, parseForm, problemState } from "./form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const Schema = z.object({
  current_password: z.string().min(1),
  new_email: z.string().trim().min(1),
});

describe("parseForm", () => {
  it("gom mọi ô trống trong một lần, mỗi ô một câu", () => {
    const result = parseForm(Schema, form({ current_password: "", new_email: "  " }), "Fill in.", {
      current_password: "Enter your password.",
    });

    expect(result).toEqual({
      ok: false,
      fields: { current_password: "Enter your password.", new_email: "Fill in." },
    });
  });

  it("đủ ô thì trả dữ liệu đã làm sạch", () => {
    const result = parseForm(Schema, form({ current_password: " p ", new_email: " a@b.c " }), "x");

    expect(result).toEqual({ ok: true, data: { current_password: " p ", new_email: "a@b.c" } });
  });
});

describe("problemState", () => {
  const base = { type: "about:blank", title: "Error", status: 422 };

  it("lỗi theo ô của core nằm dưới ô; không có lỗi chung", () => {
    const state = problemState(
      {
        ...base,
        code: "validation_failed",
        detail: "The request has invalid fields.",
        errors: [{ field: "new_password", code: "length", detail: "12 to 128 characters" }],
      },
      ["current_password", "new_password"],
    );

    expect(state).toEqual({
      code: "validation_failed",
      fields: { new_password: "12 to 128 characters" },
    });
  });

  it("mã đã biết thuộc ô nào thì gắn vào ô đó", () => {
    const state = problemState(
      { ...base, status: 400, code: "auth.wrong_password", detail: "Wrong password." },
      ["current_password"],
      { "auth.wrong_password": "current_password" },
    );

    expect(state.fields).toEqual({ current_password: "Wrong password." });
    expect(state.error).toBeUndefined();
  });

  it("lỗi không gắn được vào ô nào thành lỗi chung", () => {
    const state = problemState(
      {
        ...base,
        status: 429,
        code: "auth.login_throttled",
        detail: "Wait 60 seconds.",
        errors: [{ field: "other", code: "x", detail: "y" }],
      },
      ["current_password"],
    );

    expect(state).toEqual({ code: "auth.login_throttled", error: "Wait 60 seconds." });
  });
});

describe("nextDone", () => {
  it("tăng từ trạng thái trước", () => {
    expect(nextDone({})).toBe(1);
    expect(nextDone({ done: 4 })).toBe(5);
  });
});
