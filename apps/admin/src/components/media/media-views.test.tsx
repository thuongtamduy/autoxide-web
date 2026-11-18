// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SampleBadge } from "@/components/sample-badge";
import type { MediaItem } from "@/lib/media";
import { renderIntl } from "@/test/render";
import { ToastProvider } from "../ui/toast";
import { MediaGrid, MediaTable } from "./media-list";

// Server Action không chạy được trong jsdom; bảng chỉ cần tham chiếu tới nó.
vi.mock("@/app/(admin)/content/media/actions", () => ({
  bulkMoveMedia: vi.fn(),
  bulkPurgeMedia: vi.fn(),
  bulkRestoreMedia: vi.fn(),
  bulkTrashMedia: vi.fn(),
  purgeMedia: vi.fn(),
  restoreMedia: vi.fn(),
  trashMedia: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/content/media",
}));

afterEach(cleanup);

function item(change: Partial<MediaItem> = {}): MediaItem {
  const id = change.id ?? "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81";
  return {
    id,
    name: "chao-gang.jpg",
    content_type: "image/jpeg",
    alt_ai_assisted: false,
    size: 1843 * 1024,
    sha256: "0".repeat(64),
    alt: "",
    alts: {},
    decorative: false,
    title: "",
    caption: "",
    visibility: "private",
    version_id: "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a82",
    url: `/api/v1/media/${id}/content`,
    width: 2400,
    height: 1600,
    created_at: "2026-11-15T00:00:00Z",
    updated_at: "2026-11-15T00:00:00Z",
    tags: [],
    variants: [],
    ...change,
  };
}

describe("lưới và bảng của thư viện media", () => {
  it("ô của tệp mở khung chi tiết; ảnh qua route của giao diện; nhãn thiếu alt, riêng tư", () => {
    const pdf = item({
      id: "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a99",
      name: "doi-tra.pdf",
      content_type: "application/pdf",
      visibility: "public",
      width: null,
      height: null,
    });
    renderIntl(<MediaGrid items={[item(), pdf]} filters={{ item: pdf.id }} />, "vi");
    const tiles = screen.getAllByRole("link");
    expect(tiles[0]?.getAttribute("href")).toBe(`/content/media?item=${item().id}`);
    expect(tiles[1]?.getAttribute("aria-current")).toBe("true");
    const img = tiles[0]?.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^\/media\/0193a0c4-[^/]+\/content\?v=/);
    expect(within(tiles[0] as HTMLElement).getByText("Thiếu alt")).toBeTruthy();
    expect(within(tiles[0] as HTMLElement).getByText("Riêng tư")).toBeTruthy();
    expect(within(tiles[1] as HTMLElement).getByText("PDF")).toBeTruthy();
    expect(within(tiles[1] as HTMLElement).queryByText("Thiếu alt")).toBeNull();
  });

  it("bảng có nhãn cột cho thẻ điện thoại", () => {
    renderIntl(
      <ToastProvider>
        <MediaTable items={[item({ alt: "Chảo gang" })]} filters={{}} folders={[]} />
      </ToastProvider>,
    );
    const cells = screen.getAllByRole("cell");
    expect(cells.map((c) => c.getAttribute("data-label")).filter(Boolean)).toEqual([
      "Type",
      "Dimensions",
      "Size",
      "Alt",
      "Uploaded",
      "Actions",
    ]);
    expect(screen.getByText("Chảo gang")).toBeTruthy();
    expect(screen.getByText("Root")).toBeTruthy();
    // Chỉ đọc: không ô chọn; sắp theo tên / kích thước / giờ tải lên (mặc định mới trước).
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Uploaded/ }).getAttribute("aria-sort")).toBe(
      "descending",
    );
    expect(
      within(screen.getByRole("columnheader", { name: /Size/ }))
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/content/media?sort=size&dir=desc");
  });

  it("chọn nhiều: chuyển thư mục và thùng rác; trong thùng rác thì khôi phục, xoá hẳn", () => {
    const folder = { id: "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a70", name: "Banner" };
    renderIntl(
      <ToastProvider>
        <MediaTable
          items={[item()]}
          filters={{ view: "table" }}
          folders={[folder as never]}
          can={{ write: true, purge: true }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select chao-gang.jpg" }));
    const bar = within(screen.getByRole("region", { name: "1 selected" }));
    expect(bar.getByRole("button", { name: "Move to folder" })).toBeTruthy();
    expect(bar.getByRole("button", { name: "Move to trash" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More actions for chao-gang.jpg" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "Open details",
      "Move to trash",
    ]);
    cleanup();
    renderIntl(
      <ToastProvider>
        <MediaTable
          items={[item({ trashed_at: "2026-11-16T00:00:00Z" })]}
          filters={{ trash: true, view: "table" }}
          folders={[]}
          can={{ write: true, purge: true }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select chao-gang.jpg" }));
    const trash = within(screen.getByRole("region", { name: "1 selected" }));
    expect(trash.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(trash.getByRole("button", { name: "Delete for good" })).toBeTruthy();
  });
});

describe("nhãn dữ liệu mẫu", () => {
  it("chờ bước N, chờ API mới, chờ module", () => {
    renderIntl(
      <>
        <SampleBadge step="37" endpoint="GET /x" />
        <SampleBadge step="mới" endpoint="GET /y" />
        <SampleBadge step="mới" module="menus" endpoint="GET /z" />
      </>,
      "vi",
    );
    expect(screen.getByText("Dữ liệu mẫu · chờ API bước 37")).toBeTruthy();
    expect(screen.getByText("Dữ liệu mẫu · chờ API mới").getAttribute("title")).toContain("GET /y");
    expect(screen.getByText("Dữ liệu mẫu · chờ module menus")).toBeTruthy();
  });
});
