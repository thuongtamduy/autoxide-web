import { describe, expect, it } from "vitest";
import {
  banChoices,
  decoded,
  holdReasons,
  isKnownReason,
  moderationMoves,
  targetHref,
  targetState,
  uniqueTargets,
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
  it("đích khác nhau, giữ thứ tự", () => {
    expect(
      uniqueTargets([
        { target_type: "content.entry", target_id: "1" },
        { target_type: "content.entry", target_id: "2" },
        { target_type: "content.entry", target_id: "1" },
        { target_type: "demo.page", target_id: "1" },
      ]),
    ).toEqual([
      { type: "content.entry", id: "1" },
      { type: "content.entry", id: "2" },
      { type: "demo.page", id: "1" },
    ]);
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
