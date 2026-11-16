import { describe, expect, it } from "vitest";
import {
  adminHref,
  banChoices,
  decoded,
  holdReasons,
  isKnownReason,
  moderationMoves,
  targetHref,
  targetState,
} from "./comments";

describe("kiểm duyệt bình luận", () => {
  it("quyết định có thể đưa ra theo trạng thái", () => {
    expect(moderationMoves("pending")).toEqual(["published", "rejected", "spam"]);
    expect(moderationMoves("published")).toEqual(["pending", "rejected", "spam"]);
    expect(moderationMoves("deleted")).toEqual([]);
  });

  it("lý do giữ lại tách theo dấu phẩy; lý do lạ vẫn giữ để hiện nguyên", () => {
    expect(holdReasons("first_comment, too_many_links,")).toEqual([
      "first_comment",
      "too_many_links",
    ]);
    expect(holdReasons(null)).toEqual([]);
    expect(isKnownReason("too_fast")).toBe(true);
    expect(isKnownReason("new_reason")).toBe(false);
  });

  it("cách cấm lấy từ chi tiết bình luận, bỏ cách không có giá trị", () => {
    expect(
      banChoices({ user_id: null, author_email: "a@example.com", ip_fingerprint: "ip:7c21" }),
    ).toEqual([
      { kind: "email", value: "a@example.com" },
      { kind: "ip", value: "ip:7c21" },
    ]);
  });
});

describe("đích của bình luận", () => {
  it("màn quản trị của đích: chỉ loại có màn trong giao diện", () => {
    const id = "01a1dd85-f609-701b-9e7f-d6e1e13e56d9";
    expect(adminHref("content.entry", id)).toBe(`/content/${id}`);
    expect(adminHref("demo.page", id)).toBeNull();
    expect(adminHref("content.entry", "../x")).toBeNull();
  });

  it("đường dẫn mã hoá được và đọc lại được", () => {
    const href = targetHref("content.entry", "a/b c");
    expect(href).toBe("/marketing/comments/targets/content.entry/a%2Fb%20c");
    expect(decoded("a%2Fb%20c")).toBe("a/b c");
    expect(decoded("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("ẩn thắng đóng / mở", () => {
    expect(targetState({ state: "open", hidden: true })).toBe("hidden");
    expect(targetState({ state: "closed", hidden: false })).toBe("closed");
  });
});
