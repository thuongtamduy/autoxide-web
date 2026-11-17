// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkInput, BulkResult } from "@/lib/table";
import { renderIntl } from "@/test/render";
import { BulkTable, bulkSummary, SelectAllTh, SelectTd } from "./bulk";
import { Pager } from "./pager";
import { RowMenu } from "./row-menu";
import { SortTh } from "./sort-th";
import { ToastProvider } from "./toast";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/catalog",
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const ROWS = [
  { id: "p1", name: "Chảo gang" },
  { id: "p2", name: "Thớt gỗ" },
  { id: "p3", name: "Dao bếp" },
];

function Products({
  run,
  matching,
}: {
  run: (input: BulkInput) => Promise<BulkResult>;
  matching?: { count: number; query: string };
}) {
  return (
    <ToastProvider>
      <BulkTable
        ids={ROWS.map((r) => r.id)}
        matching={matching}
        actions={[
          { key: "hide", label: "Ngừng bán", run },
          { key: "print", label: "In", href: "/print" },
          {
            key: "delete",
            label: "Xoá",
            tone: "danger",
            run,
            confirm: {
              title: "Xoá các sản phẩm?",
              points: ["Không hoàn tác được."],
              submit: "Xoá hẳn",
            },
          },
        ]}
      >
        <table>
          <thead>
            <tr>
              <SelectAllTh />
              <th>Tên</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.id}>
                <SelectTd id={r.id} name={r.name} />
                <td>{r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </BulkTable>
    </ToastProvider>
  );
}

const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;

describe("BulkTable", () => {
  it("chọn tất cả / lửng; thanh hàng loạt hiện số đã chọn; Bỏ chọn", () => {
    renderIntl(<Products run={vi.fn()} />);
    const all = box("Select every row on this page");
    expect(screen.queryByRole("region")).toBeNull();
    fireEvent.click(box("Select Chảo gang"));
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
    expect(screen.getByText("1 selected")).toBeTruthy();
    fireEvent.click(all);
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    expect(ROWS.every((r) => box(`Select ${r.name}`).checked)).toBe(true);
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.click(all);
    expect(ROWS.some((r) => box(`Select ${r.name}`).checked)).toBe(false);
    fireEvent.click(box("Select Thớt gỗ"));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(box("Select Thớt gỗ").checked).toBe(false);
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it("Shift + bấm chọn cả dải; Esc trong thanh bỏ chọn", () => {
    renderIntl(<Products run={vi.fn()} />);
    fireEvent.click(box("Select Chảo gang"));
    fireEvent.click(box("Select Dao bếp"), { shiftKey: true });
    expect(box("Select Thớt gỗ").checked).toBe(true);
    expect(screen.getByText("3 selected")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Ngừng bán" }), { key: "Escape" });
    expect(screen.queryByText("3 selected")).toBeNull();
  });

  it("gửi danh sách id; gom lỗi “Xong 1/2”, dòng hỏng vẫn được chọn", async () => {
    const run = vi.fn(
      async (input: BulkInput): Promise<BulkResult> => ({
        total: input.ids.length,
        done: 1,
        errors: [{ id: "p2", name: "Thớt gỗ", detail: "Đang có đơn chờ" }],
      }),
    );
    renderIntl(<Products run={run} />);
    fireEvent.click(box("Select Chảo gang"));
    fireEvent.click(box("Select Thớt gỗ"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ngừng bán" }));
    });
    expect(run).toHaveBeenCalledWith({ ids: ["p1", "p2"] });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Done 1/2, 1 error"),
    );
    expect(screen.getByRole("alert").textContent).toContain("Thớt gỗ: Đang có đơn chờ");
    expect(box("Select Thớt gỗ").checked).toBe(true);
    expect(box("Select Chảo gang").checked).toBe(false);
  });

  it("thao tác cần hỏi lại mở hộp thoại, Huỷ nhận con trỏ; link mở kèm ?ids=", async () => {
    const run = vi.fn(async (input: BulkInput) => ({
      total: input.ids.length,
      done: 1,
      errors: [],
    }));
    renderIntl(<Products run={run} />);
    fireEvent.click(box("Select Dao bếp"));
    fireEvent.click(screen.getByRole("button", { name: "In" }));
    expect(push).toHaveBeenCalledWith("/print?ids=p3");
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    const dialog = screen.getByRole("dialog", { name: "Xoá các sản phẩm?" });
    expect(within(dialog).getByText("Không hoàn tác được.")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(run).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Xoá hẳn" }));
    });
    expect(run).toHaveBeenCalledWith({ ids: ["p3"] });
  });

  it("chọn cả trang thì mời chọn mọi dòng khớp bộ lọc; gửi kèm bộ lọc", async () => {
    const run = vi.fn(async () => ({ total: 40, done: 40, errors: [] }));
    renderIntl(<Products run={run} matching={{ count: 40, query: "status=draft" }} />);
    fireEvent.click(box("Select every row on this page"));
    fireEvent.click(screen.getByRole("button", { name: "Select all 40 matching rows" }));
    expect(screen.getByText("All 40 matching rows selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "In" }));
    expect(push).toHaveBeenCalledWith("/print?status=draft&all=1");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ngừng bán" }));
    });
    expect(run).toHaveBeenCalledWith({ ids: ["p1", "p2", "p3"], all: true, query: "status=draft" });
  });

  it("câu tóm tắt: câu riêng của thao tác thắng câu chung", () => {
    const t = (key: string, v?: Record<string, string | number>) => `${key}:${JSON.stringify(v)}`;
    expect(bulkSummary({ total: 2, done: 2, errors: [] }, t)).toBe('done:{"done":2,"total":2}');
    expect(bulkSummary({ total: 2, done: 2, errors: [], message: "Đã xác nhận 2 đơn" }, t)).toBe(
      "Đã xác nhận 2 đơn",
    );
  });
});

describe("RowMenu", () => {
  it("role menu; phím ↓ mở và vào mục đầu, ↑ ↓ Home End đi giữa các mục, Esc đóng và trả con trỏ", () => {
    renderIntl(
      <ToastProvider>
        <RowMenu
          label="More actions for Chảo gang"
          items={[
            { label: "Sửa", href: "/catalog/products/p1" },
            { label: "Chép mã", copy: "CG26", done: "Đã chép" },
            { label: "Xem đơn", href: "/sales/orders?q=CG26" },
          ]}
        />
      </ToastProvider>,
    );
    const trigger = screen.getByRole("button", { name: "More actions for Chảo gang" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = screen.getByRole("menu", { name: "More actions for Chảo gang" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Sửa", "Chép mã", "Xem đơn"]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe("Xem đơn");
    // Bấm ra ngoài thì đóng.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("mục mở hộp thoại: menu đóng, hộp thoại vẫn hiện (dựng ngoài popover)", async () => {
    const { Dialog } = await import("./dialog");
    renderIntl(
      <ToastProvider>
        <RowMenu
          label="More actions for Thớt gỗ"
          items={[
            {
              label: "Lưu trữ",
              dialog: (
                <Dialog label="Lưu trữ" title="Lưu trữ “Thớt gỗ”?">
                  {() => <p>Nội dung hộp thoại</p>}
                </Dialog>
              ),
            },
          ]}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions for Thớt gỗ" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Lưu trữ" }));
    expect(screen.queryByRole("menu")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Lưu trữ “Thớt gỗ”?" });
    expect(within(dialog).getByText("Nội dung hộp thoại")).toBeTruthy();
    // Nút mở riêng của hộp thoại bị ẩn: chỉ có mục trong menu.
    expect(screen.queryByRole("button", { name: "Lưu trữ" })).toBeNull();
  });
});

describe("SortTh", () => {
  it("link đổi chiều, aria-sort ở cột đang sắp, giữ bộ lọc", () => {
    renderIntl(
      <table>
        <thead>
          <tr>
            <SortTh
              field="name"
              sort={{ field: "name", dir: "asc" }}
              base="/catalog"
              keep={{ q: "chao" }}
            >
              Tên
            </SortTh>
            <SortTh
              field="price"
              sort={{ field: "name", dir: "asc" }}
              base="/catalog"
              keep={{ q: "chao" }}
              first="desc"
            >
              Giá
            </SortTh>
          </tr>
        </thead>
      </table>,
    );
    const name = screen.getByRole("columnheader", { name: /Tên/ });
    expect(name.getAttribute("aria-sort")).toBe("ascending");
    expect(within(name).getByRole("link").getAttribute("href")).toBe(
      "/catalog?q=chao&sort=name&dir=desc",
    );
    const price = screen.getByRole("columnheader", { name: /Giá/ });
    expect(price.getAttribute("aria-sort")).toBeNull();
    expect(within(price).getByRole("link").getAttribute("href")).toBe(
      "/catalog?q=chao&sort=price&dir=desc",
    );
  });
});

describe("Pager", () => {
  it("có tổng: “26–50 of 312”, Trước / Sau giữ bộ lọc và số dòng mỗi trang", () => {
    renderIntl(
      <Pager total={312} page={2} per={25} base="/catalog" keep={{ q: "chao", sort: "name" }} />,
    );
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(nav.textContent).toContain("26–50 of 312");
    expect(within(nav).getByRole("link", { name: "Previous" }).getAttribute("href")).toBe(
      "/catalog?q=chao&sort=name",
    );
    expect(within(nav).getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      "/catalog?q=chao&sort=name&page=3",
    );
    expect(screen.getByLabelText("Rows per page")).toBeTruthy();
  });

  it("trang cuối không có Sau; ít dòng thì không có chọn số dòng", () => {
    renderIntl(<Pager total={30} page={2} per={25} base="/x" keep={{}} />);
    expect(screen.getByText("26–30 of 30")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    cleanup();
    renderIntl(<Pager total={3} page={1} per={25} base="/x" keep={{}} />);
    expect(screen.queryByLabelText("Rows per page")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("theo con trỏ: không bịa tổng, chỉ Trang đầu / Trang sau", () => {
    renderIntl(<Pager first="/c" next="/c?cursor=abc" />);
    expect(screen.getByRole("link", { name: "First page" }).getAttribute("href")).toBe("/c");
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe(
      "/c?cursor=abc",
    );
    expect(screen.queryByText(/of/)).toBeNull();
  });
});
