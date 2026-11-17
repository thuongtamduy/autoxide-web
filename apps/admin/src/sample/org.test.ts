import { afterEach, describe, expect, it } from "vitest";
import { samplePage } from "./index";
import { resetSampleOrg } from "./org";

afterEach(resetSampleOrg);

describe("samplePage", () => {
  const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

  it("cắt trang theo con trỏ như fetch_page của core", () => {
    const first = samplePage(items, { limit: 2 });
    expect(first.data.map((i) => i.id)).toEqual(["a", "b"]);
    expect(first.pagination).toEqual({ limit: 2, next_cursor: "b" });
    const last = samplePage(items, { limit: 2, cursor: "d" });
    expect(last.data.map((i) => i.id)).toEqual(["e"]);
    expect(last.pagination.next_cursor).toBeNull();
  });
});
