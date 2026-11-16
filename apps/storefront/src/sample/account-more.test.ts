import { describe, expect, it } from "vitest";
import {
  DISPUTE,
  disputeActions,
  disputeAfter,
  downloadsLeft,
  SAMPLE_WARRANTIES,
  warrantyActive,
} from "./account-more";
import { emptyAccountMore, parseAccountMore, serializeAccountMore } from "./account-more-state";

describe("hàng số", () => {
  it("mỗi file 5 lượt, trừ lượt đã dùng, không âm", () => {
    expect(downloadsLeft("pdf", {})).toBe(5);
    expect(downloadsLeft("v1", {})).toBe(2);
    expect(downloadsLeft("v1", { v1: 9 })).toBe(0);
  });
});

describe("bảo hành", () => {
  it("còn hạn tới hết ngày hết hạn", () => {
    const knives = SAMPLE_WARRANTIES.find((w) => w.sku === "dao-3-mon");
    expect(knives && warrantyActive(knives, "2026-10-20")).toBe(true);
    expect(knives && warrantyActive(knives, "2026-11-16")).toBe(false);
  });
});

describe("tranh chấp", () => {
  it("người bán đã trả lời: đồng ý, nhờ sàn, hay rút", () => {
    expect(disputeActions("seller_responded")).toEqual(["accept_offer", "escalate", "withdraw"]);
    expect(disputeAfter("seller_responded", "accept_offer")).toEqual({
      status: "resolved",
      refund: DISPUTE.offered,
    });
    expect(disputeAfter("seller_responded", "escalate")?.status).toBe("escalated");
  });

  it("đã đóng thì không làm gì được nữa; thao tác sai trạng thái bị từ chối", () => {
    expect(disputeActions("resolved")).toEqual([]);
    expect(disputeAfter("withdrawn", "escalate")).toBeNull();
    expect(disputeAfter("seller_responded", "platform_decides")).toBeNull();
    expect(disputeAfter("escalated", "platform_decides")).toEqual({
      status: "resolved",
      refund: DISPUTE.asked,
    });
  });
});

describe("cookie trạng thái", () => {
  it("ghi rồi đọc lại như cũ", () => {
    const state = emptyAccountMore();
    state.used.pdf = 2;
    state.claims["chao-gang-26"] = "2026-11-16T03:00:00.000Z";
    state.dispute = {
      status: "escalated",
      refund: null,
      added: [{ at: "2026-11-16T03:00:00.000Z", body: "Thêm ảnh", photos: ["IMG_1.jpg"] }],
    };
    expect(parseAccountMore(serializeAccountMore(state))).toEqual(state);
  });

  it("giá trị hỏng hay lạ thì về trạng thái đầu", () => {
    expect(parseAccountMore("%%%")).toEqual(emptyAccountMore());
    expect(
      parseAccountMore(encodeURIComponent('{"dispute":{"status":"hacked"}}')).dispute.status,
    ).toBe("seller_responded");
    expect(parseAccountMore(encodeURIComponent('{"used":{"pdf":-3,"epub":"x"}}')).used).toEqual({});
  });
});
