import { describe, expect, it } from "vitest";
import { NAV } from "@/nav/nav";
import {
  bucketOf,
  collectCounts,
  collectWork,
  compareWork,
  defineSource,
  groupByBucket,
  navCounts,
  snoozeUntil,
  visibleSources,
  withStates,
} from "./registry";
import type { WorkContext, WorkItem } from "./types";

const NOW = Date.parse("2026-11-15T03:00:00Z"); // 10:00 giờ Việt Nam, Chủ nhật

function ctx(permissions: string[], extra: Partial<WorkContext> = {}): WorkContext {
  return {
    can: (wanted) =>
      (typeof wanted === "string" ? [wanted] : wanted).some((p) => permissions.includes(p)),
    modules: ["comments"],
    sample: true,
    now: NOW,
    ...extra,
  };
}

function item(key: string, extra: Partial<WorkItem> = {}): WorkItem {
  return {
    key,
    source: key.split(":")[0] ?? key,
    severity: "info",
    title: { key: "items.x.title" },
    detail: null,
    due_at: null,
    target: { item: "x", href: "/x" },
    count: 1,
    reason: { permission: null, scope: { key: "why.tenant" } },
    ...extra,
  };
}

const source = (id: string, permission: string[] | null, items: WorkItem[], more = {}) =>
  defineSource({
    id,
    group: "sales",
    permission,
    load: async () => ({ count: items.reduce((n, i) => n + i.count, 0), items }),
    ...more,
  });

describe("sổ nguồn việc", () => {
  it("chỉ chạy nguồn người xem có permission; nguồn mẫu theo cờ dữ liệu mẫu; nguồn thật theo module", () => {
    const sources = [
      source("a.one", ["a.read"], []),
      source("b.two", ["b.read"], []),
      source("c.sample", ["a.read"], [], { sample: { step: "45", endpoint: "GET /x" } }),
      source("d.real", ["a.read"], [], { module: "forms" }),
      source("e.self", null, []),
    ];
    expect(visibleSources(sources, ctx(["a.read"])).map((s) => s.id)).toEqual([
      "a.one",
      "c.sample",
      "e.self",
    ]);
    expect(
      visibleSources(sources, ctx(["a.read"], { sample: false, modules: null })).map((s) => s.id),
    ).toEqual(["a.one", "d.real", "e.self"]);
  });

  it("nguồn lỗi hay chậm bị bỏ qua và ghi vào incomplete, không làm hỏng cả hộp", async () => {
    const good = source("a.good", null, [item("a.good:1")]);
    const broken = defineSource({
      id: "b.broken",
      group: "sales",
      permission: null,
      load: async () => {
        throw new Error("core down");
      },
    });
    const slow = defineSource({
      id: "c.slow",
      group: "sales",
      permission: null,
      load: () => new Promise(() => {}),
    });
    const box = await collectWork([good, broken, slow], ctx([]), { timeoutMs: 20 });
    expect(box.data.map((i) => i.key)).toEqual(["a.good:1"]);
    expect(box.incomplete.sort()).toEqual(["b.broken", "c.slow"]);
    const counts = await collectCounts([good, broken, slow], ctx([]), { timeoutMs: 20 });
    expect(counts).toEqual({ data: { "a.good": 1 }, incomplete: ["b.broken", "c.slow"] });
  });

  it("đếm và liệt kê dùng chung một lần đọc cho mỗi ngữ cảnh", async () => {
    let reads = 0;
    const s = defineSource({
      id: "a.once",
      group: "sales",
      permission: null,
      load: async () => {
        reads += 1;
        return { count: 3, items: [item("a.once:q", { count: 3 })] };
      },
    });
    const c = ctx([]);
    await Promise.all([s.count(c), s.items(c, 10), s.count(c)]);
    expect(reads).toBe(1);
    await s.count(ctx([]));
    expect(reads).toBe(2);
  });

  it("sắp theo mức gấp, rồi hạn gần trước, việc không hạn sau cùng", () => {
    const list = [
      item("x:info-late", { due_at: "2026-11-20T00:00:00Z" }),
      item("x:attention-none", { severity: "attention" }),
      item("x:attention-soon", { severity: "attention", due_at: "2026-11-16T00:00:00Z" }),
      item("x:blocking", { severity: "blocking" }),
      item("x:info-early", { due_at: "2026-11-14T00:00:00Z" }),
    ];
    expect([...list].sort(compareWork).map((i) => i.key)).toEqual([
      "x:blocking",
      "x:attention-soon",
      "x:attention-none",
      "x:info-early",
      "x:info-late",
    ]);
  });

  it("nhóm theo hạn: quá hạn, hôm nay (giờ Việt Nam, hay không có hạn), sắp tới", () => {
    expect(bucketOf({ due_at: "2026-11-15T02:00:00Z" }, NOW)).toBe("overdue");
    expect(bucketOf({ due_at: null }, NOW)).toBe("today");
    // 23:00 giờ Việt Nam cùng ngày
    expect(bucketOf({ due_at: "2026-11-15T16:00:00Z" }, NOW)).toBe("today");
    // 0:30 giờ Việt Nam ngày mai
    expect(bucketOf({ due_at: "2026-11-15T17:30:00Z" }, NOW)).toBe("soon");
    const groups = groupByBucket(
      [
        item("x:soon", { due_at: "2026-11-20T00:00:00Z" }),
        item("x:late", { due_at: "2026-11-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["overdue", "soon"]);
  });

  it("gắn trạng thái hoãn / giao; hoãn đã hết hạn thì việc hiện lại", () => {
    const rows = withStates(
      [item("x:1"), item("x:2"), item("x:3"), item("x:4")],
      [
        { key: "x:1", snoozed_until: "2026-11-16T02:00:00Z", assignee: null },
        { key: "x:2", snoozed_until: "2026-11-14T02:00:00Z", assignee: null },
        { key: "x:3", snoozed_until: null, assignee: { id: "u", name: "Ngô Mai" } },
        { key: "gone:9", snoozed_until: "2026-11-30T00:00:00Z", assignee: null },
      ],
      NOW,
    );
    expect(rows.map((r) => r.state)).toEqual(["snoozed", "open", "assigned", "open"]);
    expect(rows[1]?.snoozed_until).toBeNull();
  });

  it("số đếm trên menu: cộng các nguồn của màn; màn Việc đếm số việc đang chờ", () => {
    const counts = navCounts(NAV, { "orders.unconfirmed": 12, "orders.returns_overdue": 2 }, 7);
    expect(counts.orders).toBe(14);
    expect(counts.work).toBe(7);
    expect(counts.shipping).toBeUndefined();
  });

  it("hoãn: 1 giờ, 3 giờ, 9:00 sáng mai, 9:00 thứ Hai tới (giờ Việt Nam)", () => {
    expect(snoozeUntil("1h", NOW)).toBe("2026-11-15T04:00:00.000Z");
    expect(snoozeUntil("3h", NOW)).toBe("2026-11-15T06:00:00.000Z");
    expect(snoozeUntil("tomorrow", NOW)).toBe("2026-11-16T02:00:00.000Z");
    // Chủ nhật 15/11 → thứ Hai 16/11
    expect(snoozeUntil("monday", NOW)).toBe("2026-11-16T02:00:00.000Z");
    // Thứ Hai 16/11 → thứ Hai 23/11
    expect(snoozeUntil("monday", Date.parse("2026-11-16T03:00:00Z"))).toBe(
      "2026-11-23T02:00:00.000Z",
    );
  });
});
