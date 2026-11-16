import { beforeEach, describe, expect, it } from "vitest";
import {
  assignWork,
  getNotificationPrefs,
  listPins,
  listWorkStates,
  MAX_SNOOZE_MS,
  resetSampleWork,
  restorePin,
  saveNotificationPrefs,
  snoozeWork,
  unpin,
  unsnoozeWork,
} from "./work";

const NOW = Date.parse("2026-11-15T03:00:00Z");
const KEY = "orders.unconfirmed:queue";

beforeEach(() => resetSampleWork());

describe("trạng thái việc theo người (hoãn, giao)", () => {
  it("hoãn tới một thời điểm trong 30 ngày; Hoàn tác đặt lại đúng giá trị cũ", async () => {
    const first = await snoozeWork("u1", KEY, "2026-11-16T02:00:00Z", NOW);
    expect(first.ok && first.data.previous).toBeNull();
    const again = await snoozeWork("u1", KEY, "2026-11-17T02:00:00Z", NOW);
    expect(again.ok && again.data.previous).toBe("2026-11-16T02:00:00.000Z");
    const undo = await unsnoozeWork("u1", KEY, "2026-11-16T02:00:00.000Z");
    expect(undo.ok && undo.data.state.snoozed_until).toBe("2026-11-16T02:00:00.000Z");
    // Trạng thái là của từng người.
    expect((await listWorkStates("u2")).data).toEqual([]);
  });

  it("từ chối hoãn vào quá khứ hay quá 30 ngày, và khoá việc sai dạng", async () => {
    const past = await snoozeWork("u1", KEY, "2026-11-15T02:00:00Z", NOW);
    expect(!past.ok && past.problem.errors?.[0]?.code).toBe("work_snooze_invalid");
    const far = await snoozeWork("u1", KEY, new Date(NOW + MAX_SNOOZE_MS + 1).toISOString(), NOW);
    expect(far.ok).toBe(false);
    const bad = await snoozeWork("u1", "không có", "2026-11-16T02:00:00Z", NOW);
    expect(!bad.ok && bad.problem.code).toBe("kernel.work_not_found");
  });

  it("chỉ giao cho người có quyền xử lý; bỏ giao trả người cũ để Hoàn tác", async () => {
    const denied = await assignWork("u1", KEY, { id: "u9", name: "Khách" }, false);
    expect(!denied.ok && denied.problem.errors?.[0]).toMatchObject({
      field: "user_id",
      code: "work_assignee_forbidden",
    });
    const given = await assignWork("u1", KEY, { id: "u2", name: "Ngô Mai" }, true);
    expect(given.ok && given.data.previous).toBeNull();
    const cleared = await assignWork("u1", KEY, null, false);
    expect(cleared.ok && cleared.data.previous).toEqual({ id: "u2", name: "Ngô Mai" });
  });
});

describe("ghim và tuỳ chọn thông báo", () => {
  it("bỏ ghim rồi Hoàn tác ghim lại đúng mục cũ", async () => {
    const before = (await listPins("u1")).data;
    expect(before.length).toBe(3);
    const first = before[0];
    if (!first) throw new Error("no pin");
    expect((await unpin("u1", first.id)).ok).toBe(true);
    expect((await listPins("u1")).data.map((p) => p.id)).not.toContain(first.id);
    expect((await unpin("u1", first.id)).ok).toBe(false);
    expect((await restorePin("u1", first.id)).ok).toBe(true);
    expect((await listPins("u1")).data.map((p) => p.id)).toEqual(before.map((p) => p.id));
  });

  it("tuỳ chọn thông báo mặc định và lưu theo người", async () => {
    expect((await getNotificationPrefs("u1")).data).toEqual({
      mention: true,
      assigned: true,
      approval: true,
      digest: false,
    });
    await saveNotificationPrefs("u1", {
      mention: false,
      assigned: true,
      approval: true,
      digest: true,
    });
    expect((await getNotificationPrefs("u1")).data.digest).toBe(true);
    expect((await getNotificationPrefs("u2")).data.digest).toBe(false);
  });
});
