import { describe, expect, it } from "vitest";
import {
  campaignActions,
  IMPORT_MAX,
  inboxSnippet,
  type NewsletterList,
  parseSubscriberCsv,
  progressPercent,
  subjectAsSent,
  sumSubscriptions,
  textPreviewDoc,
} from "./newsletter";

const progress = {
  total: 10,
  sent: 0,
  failed: 0,
  skipped: 0,
  pending: 10,
  bounced: 0,
  unsubscribed: 0,
};

describe("thao tác theo trạng thái chiến dịch", () => {
  it("theo mô tả của từng endpoint trong openapi.json", () => {
    expect(campaignActions({ status: "draft", progress })).toEqual([
      "edit",
      "test",
      "schedule",
      "send",
      "delete",
    ]);
    expect(campaignActions({ status: "sending", progress })).toEqual(["pause", "cancel"]);
    expect(campaignActions({ status: "paused", progress })).toEqual(["resume", "cancel"]);
    expect(campaignActions({ status: "sent", progress })).toEqual([]);
  });

  it("chiến dịch đã huỷ chỉ xoá được khi chưa gửi thư nào", () => {
    expect(campaignActions({ status: "cancelled", progress })).toEqual(["delete"]);
    expect(campaignActions({ status: "cancelled", progress: { ...progress, sent: 3 } })).toEqual(
      [],
    );
  });

  it("phần trăm đã xử lý", () => {
    expect(progressPercent(progress)).toBe(0);
    expect(
      progressPercent({
        total: 3,
        sent: 1,
        failed: 0,
        skipped: 1,
        pending: 1,
        bounced: 0,
        unsubscribed: 0,
      }),
    ).toBe(67);
    expect(
      progressPercent({
        total: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        bounced: 0,
        unsubscribed: 0,
      }),
    ).toBe(0);
  });

  it("cộng số đăng ký của các danh sách", () => {
    const list = (confirmed: number, unconfirmed: number, unsubscribed: number) =>
      ({ subscriptions: { confirmed, unconfirmed, unsubscribed } }) as NewsletterList;
    expect(sumSubscriptions([list(3, 1, 0), list(2, 0, 5)])).toEqual({
      confirmed: 5,
      unconfirmed: 1,
      unsubscribed: 5,
    });
  });
});

describe("đọc CSV người đăng ký", () => {
  it("có dòng tiêu đề: email, tên, ngôn ngữ; ô trong ngoặc kép", () => {
    const parsed = parseSubscriberCsv(
      '﻿Email,Họ tên,locale\r\nLan@Example.com,"Phạm, Lan",vi\r\nan@example.com,An,fr\r\n',
    );
    expect(parsed.people).toEqual([
      { email: "lan@example.com", name: "Phạm, Lan", locale: "vi" },
      { email: "an@example.com", name: "An" },
    ]);
    expect(parsed.skipped).toEqual([]);
  });

  it("không tiêu đề: cột 1 là email, cột 2 là tên; chấm phẩy cũng được", () => {
    expect(parseSubscriberCsv("a@example.com;Anh\nb@example.com").people).toEqual([
      { email: "a@example.com", name: "Anh" },
      { email: "b@example.com" },
    ]);
  });

  it("bỏ email sai và email lặp, kèm số dòng", () => {
    const parsed = parseSubscriberCsv("email\na@example.com\nkhong-hop-le\nA@example.com\n");
    expect(parsed.people).toHaveLength(1);
    expect(parsed.skipped).toEqual([
      { line: 3, reason: "email" },
      { line: 4, reason: "duplicate" },
    ]);
  });

  it(`quá ${IMPORT_MAX} người thì báo`, () => {
    const text = Array.from({ length: IMPORT_MAX + 1 }, (_, i) => `p${i}@example.com`).join("\n");
    expect(parseSubscriberCsv(text).tooMany).toBe(true);
  });
});

describe("xem trước khi soạn chiến dịch", () => {
  it("tiêu đề khi gửi: nhãn quảng cáo đứng đầu, chỉ với thư quảng cáo", () => {
    expect(subjectAsSent(" Ưu đãi ", true, "[QC]")).toBe("[QC] Ưu đãi");
    expect(subjectAsSent("Ưu đãi", false, "[QC]")).toBe("Ưu đãi");
    expect(subjectAsSent("Ưu đãi", true, "")).toBe("Ưu đãi");
  });

  it("dòng mờ trong hộp thư: preheader trước, không có thì đầu thân thư, gộp khoảng trắng và cắt", () => {
    expect(inboxSnippet("Chỉ tuần này", "Thân thư")).toBe("Chỉ tuần này");
    expect(inboxSnippet("  ", "Xin chào,\n\n  Giảm 10%")).toBe("Xin chào, Giảm 10%");
    expect(inboxSnippet("", "a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
    expect(inboxSnippet("", "")).toBe("");
  });

  it("bản chữ thành trang xem trước: thoát hết thẻ, không thể chèn script", () => {
    const doc = textPreviewDoc("<script>alert(1)</script>\nA & B \"x\" 'y'", "vi");
    expect(doc).not.toContain("<script>");
    expect(doc).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;\nA &amp; B &quot;x&quot; &#39;y&#39;",
    );
    expect(doc).toContain('lang="vi"');
    expect(textPreviewDoc("", "en")).toContain('lang="en"');
  });
});
