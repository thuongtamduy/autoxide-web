import { describe, expect, it } from "vitest";
import { excerpt, hrefWith, isoToLocal, lines, localToIso, one, oneOf, pickText } from "./engage";

describe("đọc địa chỉ của phân hệ Tiếp thị", () => {
  it("one cắt khoảng trắng, bỏ giá trị trống, giới hạn độ dài", () => {
    expect(one({ q: "  thớt  " }, "q")).toBe("thớt");
    expect(one({ q: "   " }, "q")).toBeUndefined();
    expect(one({ q: ["a", "b"] }, "q")).toBe("a");
    expect(one({ q: "x".repeat(300) }, "q", 10)).toHaveLength(10);
  });

  it("oneOf chỉ nhận giá trị trong danh sách", () => {
    expect(oneOf({ s: "new" }, "s", ["new", "read"] as const)).toBe("new");
    expect(oneOf({ s: "drop table" }, "s", ["new", "read"] as const)).toBeUndefined();
  });

  it("hrefWith bỏ tham số trống và mã hoá giá trị", () => {
    expect(hrefWith("/a", { status: undefined, q: "" })).toBe("/a");
    expect(hrefWith("/a", { status: "new", q: "bảo hành" })).toBe(
      "/a?status=new&q=b%E1%BA%A3o+h%C3%A0nh",
    );
  });
});

describe("chữ hai ngôn ngữ và cắt chữ", () => {
  it("pickText theo ngôn ngữ, thiếu thì lấy ngôn ngữ kia", () => {
    expect(pickText({ vi: "Liên hệ", en: "Contact" }, "en")).toBe("Contact");
    expect(pickText({ vi: "Liên hệ" }, "en")).toBe("Liên hệ");
    expect(pickText({ en: "Contact", vi: "" }, "vi")).toBe("Contact");
    expect(pickText(null, "vi")).toBe("");
  });

  it("excerpt gộp khoảng trắng và thêm dấu …", () => {
    expect(excerpt("a\n\n b", 10)).toBe("a b");
    expect(excerpt("một hai ba bốn năm", 8)).toBe("một hai…");
  });

  it("lines tách theo dòng hoặc dấu phẩy, bỏ dòng trống", () => {
    expect(lines("a@example.com\n\n b@example.com, c@example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });
});

describe("giờ của ô datetime-local", () => {
  it("đổi qua lại với ISO theo giờ của máy đang chạy", () => {
    const iso = localToIso("2026-11-21T08:00");
    expect(iso).toMatch(/^2026-11-2\dT\d{2}:00:00\.000Z$/);
    expect(isoToLocal(iso)).toBe("2026-11-21T08:00");
  });

  it("sai định dạng thì null / chuỗi trống", () => {
    expect(localToIso("21/11/2026 08:00")).toBeNull();
    expect(isoToLocal("không phải ngày")).toBe("");
    expect(isoToLocal(null)).toBe("");
  });
});
