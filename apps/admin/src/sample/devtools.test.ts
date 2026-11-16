import { describe, expect, it } from "vitest";
import { listRecordEvents, listRequests, requestKeys, SAMPLE_RECORD } from "./devtools";

describe("nhật ký request mẫu", () => {
  it("lọc theo nhóm mã trạng thái và API key", async () => {
    expect((await listRequests({ status_class: "5xx" })).data.map((r) => r.status)).toEqual([502]);
    expect(
      (await listRequests({ status_class: "4xx" })).data.every(
        (r) => r.status >= 400 && r.status < 500,
      ),
    ).toBe(true);
    const key = requestKeys().find((k) => k.name === "cskh-bot");
    const mine = await listRequests({ api_key_id: key?.id ?? "" });
    expect(mine.data.every((r) => r.actor?.name === "cskh-bot")).toBe(true);
    expect(mine.data.length).toBeGreaterThan(0);
  });

  it("đường dẫn là đường dẫn mẫu, không có ID thật", async () => {
    const { data } = await listRequests();
    expect(data.every((r) => !/[0-9a-f]{8}-[0-9a-f]{4}/.test(r.route))).toBe(true);
  });
});

describe("event theo bản ghi mẫu", () => {
  it("bản ghi mẫu có event, mới nhất trước; bản ghi khác rỗng", async () => {
    const { data } = await listRecordEvents(SAMPLE_RECORD.kind, ` ${SAMPLE_RECORD.id} `);
    expect(data[0]?.name).toBe("orders.fulfillment_requested");
    expect((await listRecordEvents("orders.order", "khac")).data).toEqual([]);
  });
});
