import { describe, expect, it } from "vitest";
import { activityLines, activityOf } from "./activity";

const base = {
  module: "content",
  actor_kind: "user",
  actor_user_id: "u1",
  occurred_at: "2026-11-15T03:00:00Z",
};

describe("hoạt động gần đây từ nhật ký audit", () => {
  it("dựng câu cho event có câu hoạt động, kèm tên bản ghi và link", () => {
    const line = activityOf({
      ...base,
      id: "a1",
      action: "content.entry_published",
      subject: "content.entry:e1",
      after: { title: "Vệ sinh thớt gỗ đúng cách" },
    });
    expect(line).toMatchObject({
      key: "actions.content_entry_published",
      actor: { kind: "user", id: "u1" },
      what: "Vệ sinh thớt gỗ đúng cách",
      href: "/content/e1",
      group: "content",
    });
  });

  it("bỏ event riêng tư (đăng nhập) và event không có câu", () => {
    const lines = activityLines(
      [
        { ...base, id: "1", module: "auth", action: "auth.signed_in", subject: "auth.user:u1" },
        { ...base, id: "2", action: "content.unknown_thing" },
        {
          ...base,
          id: "3",
          module: "auth",
          action: "auth.role_created",
          subject: "auth.role:r1",
          after: { name: "editor" },
        },
      ],
      10,
    );
    expect(lines.map((l) => l.id)).toEqual(["3"]);
    expect(lines[0]?.href).toBe("/org/access/roles/r1");
  });

  it("người làm là hệ thống, khách truy cập hay API key", () => {
    const system = activityOf({
      ...base,
      id: "s",
      actor_user_id: null,
      actor_kind: "system",
      module: "newsletter",
      action: "newsletter.campaign_sent",
    });
    expect(system?.actor).toEqual({ kind: "system" });
    const visitor = activityOf({
      ...base,
      id: "p",
      actor_user_id: null,
      actor_kind: "public",
      module: "forms",
      action: "forms.submission_received",
    });
    expect(visitor?.actor).toEqual({ kind: "public" });
    expect(visitor?.what).toBe("");
  });

  it("giữ thứ tự và dừng ở giới hạn", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      ...base,
      id: String(i),
      action: "media.item_uploaded",
      subject: `media.item:m${i}`,
    }));
    expect(activityLines(entries, 2).map((l) => l.id)).toEqual(["0", "1"]);
  });
});
