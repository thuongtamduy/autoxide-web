import { describe, expect, it } from "vitest";
import {
  extOf,
  formatBytes,
  isUuid,
  kindOf,
  type MediaItem,
  mediaHref,
  mediaQuery,
  mediaSrc,
  missingAlt,
  parseMediaFilters,
  publicMediaSrc,
  safeFileName,
  uploadBlock,
  uploadErrorKey,
} from "./media";

const ID = "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81";

function item(change: Partial<MediaItem> = {}): MediaItem {
  return {
    id: ID,
    name: "chao-gang.jpg",
    content_type: "image/jpeg",
    size: 1843 * 1024,
    sha256: "0".repeat(64),
    alt: "",
    alts: {},
    decorative: false,
    title: "",
    caption: "",
    visibility: "private",
    version_id: "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a82",
    url: `/api/v1/media/${ID}/content?v=x`,
    created_at: "2026-11-15T00:00:00Z",
    updated_at: "2026-11-15T00:00:00Z",
    tags: [],
    variants: [
      { width: 320, height: 200, content_type: "image/jpeg", size: 18000, url: "a" },
      { width: 640, height: 400, content_type: "image/jpeg", size: 72000, url: "b" },
    ],
    ...change,
  };
}

describe("bộ lọc của thư viện media", () => {
  it("đọc bộ lọc từ địa chỉ, bỏ qua giá trị lạ", () => {
    expect(
      parseMediaFilters({
        folder: "root",
        kind: "video",
        q: "  chảo ",
        alt: "missing",
        visibility: "private",
        trash: "1",
        view: "table",
        item: ID,
        cursor: "abc",
      }),
    ).toEqual({
      folder: "root",
      kind: "video",
      q: "chảo",
      noAlt: true,
      visibility: "private",
      trash: true,
      view: "table",
      item: ID,
      cursor: "abc",
    });
    expect(
      parseMediaFilters({ folder: "../x", kind: "exe", item: "1", visibility: "all" }),
    ).toEqual({});
  });

  it("đổi bộ lọc thì về trang đầu; chỉ mở tệp khác thì giữ trang", () => {
    const filters = parseMediaFilters({ kind: "image", cursor: "c1" });
    expect(mediaHref(filters, { q: "logo" })).toBe("/content/media?kind=image&q=logo");
    expect(mediaHref(filters, { item: ID })).toBe(`/content/media?kind=image&cursor=c1&item=${ID}`);
    expect(mediaHref({}, {})).toBe("/content/media");
    expect(mediaHref({ trash: true, item: ID }, { trash: false, item: undefined })).toBe(
      "/content/media",
    );
  });

  it("tham số gửi core theo đúng tên của openapi.json", () => {
    expect(mediaQuery({ folder: "root", kind: "pdf", tag: "brand", trash: true })).toEqual({
      limit: 48,
      sort: "created_at",
      order: "desc",
      include: "uploader",
      folder_id: "root",
      type: "application/pdf",
      tag: "brand",
      trashed: true,
    });
    // "Thiếu alt" là bộ lọc của core (cả thư viện), không lọc trên trang đang xem.
    expect(mediaQuery({ noAlt: true })).toMatchObject({ alt_missing: true });
  });
});

describe("hiện một tệp", () => {
  it("địa chỉ ảnh qua route của giao diện, chọn bản nhỏ vừa đủ rộng", () => {
    expect(mediaSrc(item(), 300)).toBe(`/media/${ID}/content?v=${item().version_id}&w=320`);
    expect(mediaSrc(item(), 1000)).toBe(`/media/${ID}/content?v=${item().version_id}&w=640`);
    expect(mediaSrc(item({ variants: [] }), 320)).toBe(
      `/media/${ID}/content?v=${item().version_id}`,
    );
  });

  it("thiếu alt chỉ tính với ảnh", () => {
    expect(missingAlt(item())).toBe(true);
    expect(missingAlt(item({ alt: "Chảo gang" }))).toBe(false);
    expect(missingAlt(item({ content_type: "application/pdf" }))).toBe(false);
    expect(missingAlt(item({ content_type: "image/svg+xml", alt: "  " }))).toBe(true);
    // Ảnh trang trí: alt trống có chủ ý, không tính là thiếu (như `alt_missing` của core).
    expect(missingAlt(item({ decorative: true }))).toBe(false);
  });

  it("địa chỉ ảnh công khai của core thành route của giao diện", () => {
    expect(publicMediaSrc(`/api/v1/media/${ID}/content?v=abc&w=640`)).toBe(
      `/media/${ID}/content?v=abc&w=640`,
    );
    expect(publicMediaSrc("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(publicMediaSrc("javascript:alert(1)")).toBe("");
    expect(publicMediaSrc("/api/v1/media/x/content")).toBe("");
  });

  it("tệp chắc chắn bị từ chối thì báo trước khi gửi", () => {
    const limits = { maxBytes: 1000, allowedTypes: ["image/png", "audio/*"] };
    expect(uploadBlock({ size: 2000, type: "image/png" }, limits)).toBe("tooLarge");
    expect(uploadBlock({ size: 10, type: "image/png" }, limits)).toBeNull();
    expect(uploadBlock({ size: 10, type: "audio/mpeg" }, limits)).toBeNull();
    expect(uploadBlock({ size: 10, type: "video/mp4" }, limits)).toBe("typeNotAllowed");
    // Trình duyệt không biết loại: để core nhận diện từ nội dung.
    expect(uploadBlock({ size: 10, type: "" }, limits)).toBeNull();
    expect(uploadBlock({ size: 10 ** 9, type: "video/mp4" }, null)).toBeNull();
  });

  it("loại, đuôi tệp, kích thước", () => {
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("application/zip")).toBe("other");
    expect(extOf(item())).toBe("JPG");
    expect(extOf(item({ name: "logo", content_type: "image/svg+xml" }))).toBe("SVG+XML");
    expect(formatBytes(1843 * 1024, "en")).toBe("1.8 MB");
    expect(formatBytes(1843 * 1024, "vi")).toBe("1,8 MB");
    expect(formatBytes(512, "en")).toBe("512 B");
  });

  it("tên tệp core nhận, mã lỗi tải lên", () => {
    expect(safeFileName("a/b\\c.jpg")).toBe("a-b-c.jpg");
    expect(safeFileName("   ")).toBe("file");
    expect(uploadErrorKey("media.too_large")).toBe("tooLarge");
    expect(uploadErrorKey("payload_too_large")).toBe("tooLarge");
    expect(uploadErrorKey("media.content_mismatch")).toBe("contentMismatch");
    expect(uploadErrorKey("something.new")).toBe("other");
    expect(isUuid(ID)).toBe(true);
    expect(isUuid(`${ID}x`)).toBe(false);
  });
});
