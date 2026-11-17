import { describe, expect, it } from "vitest";
import {
  ariaSort,
  cleanIds,
  eachId,
  pageWindow,
  readPage,
  readSort,
  slicePage,
  sortHref,
  sortRows,
  withQuery,
} from "./table";

describe("sắp theo cột", () => {
  it("chỉ nhận cột trong danh sách; chiều sai về mặc định", () => {
    const fallback = { field: "updated", dir: "desc" } as const;
    expect(readSort({ sort: "name", dir: "asc" }, ["name", "updated"], fallback)).toEqual({
      field: "name",
      dir: "asc",
    });
    expect(readSort({ sort: "name", dir: "x" }, ["name"], fallback)).toEqual({
      field: "name",
      dir: "desc",
    });
    expect(readSort({ sort: "password" }, ["name"], fallback)).toBe(fallback);
  });

  it("bấm cột đang sắp thì đảo chiều, cột khác bắt đầu bằng chiều đầu; về trang đầu, giữ bộ lọc", () => {
    const current = { field: "name", dir: "asc" } as const;
    expect(sortHref("/catalog", { q: "chảo", page: 3 }, current, "name")).toBe(
      "/catalog?q=ch%E1%BA%A3o&sort=name&dir=desc",
    );
    expect(sortHref("/catalog", { cursor: "abc" }, current, "price", "desc")).toBe(
      "/catalog?sort=price&dir=desc",
    );
    expect(ariaSort(current, "name")).toBe("ascending");
    expect(ariaSort({ field: "name", dir: "desc" }, "name")).toBe("descending");
    expect(ariaSort(current, "price")).toBe("none");
  });

  it("sắp chữ theo tiếng Việt, số theo số, ô trống ở cuối, bằng nhau giữ thứ tự", () => {
    const rows = [
      { id: "a", name: "Đĩa", price: 10 as number | null },
      { id: "b", name: "chảo", price: null },
      { id: "c", name: "Bát", price: 9 },
      { id: "d", name: "bát", price: 100 },
    ];
    expect(sortRows(rows, (r) => r.name, "asc").map((r) => r.id)).toEqual(["c", "d", "b", "a"]);
    expect(sortRows(rows, (r) => r.price, "desc").map((r) => r.id)).toEqual(["d", "a", "c", "b"]);
    expect(sortRows(rows, (r) => r.price, "asc").map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });
});

describe("phân trang", () => {
  it("đọc trang và số dòng; số lạ về mặc định", () => {
    expect(readPage({ page: "3", per: "50" })).toEqual({ page: 3, per: 50 });
    expect(readPage({ page: "-1", per: "7" })).toEqual({ page: 1, per: 25 });
    expect(readPage({})).toEqual({ page: 1, per: 25 });
  });

  it("cửa sổ trang: 1–25 trong 312, trang cuối, trang quá xa kẹp lại", () => {
    expect(pageWindow(1, 25, 312)).toEqual({
      from: 1,
      to: 25,
      last: 13,
      page: 1,
      prev: null,
      next: 2,
    });
    expect(pageWindow(13, 25, 312)).toMatchObject({ from: 301, to: 312, prev: 12, next: null });
    expect(pageWindow(99, 25, 30)).toMatchObject({ page: 2, from: 26, to: 30 });
    expect(pageWindow(1, 25, 0)).toMatchObject({ from: 0, to: 0, last: 1, next: null });
    const rows = Array.from({ length: 30 }, (_, i) => i);
    expect(slicePage(rows, 2, 25)).toEqual({ data: [25, 26, 27, 28, 29], total: 30, page: 2 });
  });

  it("địa chỉ bỏ tham số rỗng", () => {
    expect(withQuery("/x", { q: "", a: null, b: undefined, c: 0, d: "1" }, { d: null })).toBe(
      "/x?c=0",
    );
  });
});

describe("hàng loạt", () => {
  it("id sạch: bỏ trùng, bỏ rỗng, không phải mảng thì rỗng", () => {
    expect(cleanIds(["a", " a ", "", 3, "b"])).toEqual(["a", "b"]);
    expect(cleanIds("a,b")).toEqual([]);
  });

  it("chạy lần lượt từng id, gom lỗi kèm tên dễ đọc", async () => {
    const seen: string[] = [];
    const result = await eachId(
      ["1", "2", "3"],
      async (id) => {
        seen.push(id);
        if (id === "2") return "Thiếu thuộc tính bắt buộc";
        if (id === "3") throw new Error("Mất kết nối");
        return null;
      },
      (id) => `SP-${id}`,
    );
    expect(seen).toEqual(["1", "2", "3"]);
    expect(result).toEqual({
      total: 3,
      done: 1,
      errors: [
        { id: "2", name: "SP-2", detail: "Thiếu thuộc tính bắt buộc" },
        { id: "3", name: "SP-3", detail: "Mất kết nối" },
      ],
    });
  });
});
