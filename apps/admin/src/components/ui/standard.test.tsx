// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderIntl } from "@/test/render";
import { AutoFilter } from "./auto-filter";
import { EmptyState } from "./empty-state";
import { Field, formatMoneyInput, moneyDigits } from "./form";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/sales/orders",
}));

afterEach(() => {
  cleanup();
  replace.mockReset();
  vi.useRealTimers();
});

describe("ô tiền", () => {
  it("hiện dấu phân cách nghìn, gửi đi chỉ chữ số", () => {
    expect(formatMoneyInput("1500000", "vi")).toBe("1.500.000");
    expect(formatMoneyInput("1500000 ₫", "en")).toBe("1,500,000");
    expect(moneyDigits("1.500.000")).toBe("1500000");
    // Chữ không phải số giữ nguyên để máy chủ báo lỗi đúng chữ người gõ.
    expect(moneyDigits("3k")).toBe("3k");
    expect(moneyDigits("1.000,50")).toBe("1.000,50");
    expect(formatMoneyInput("6,9", "vi")).toBe("6,9");
    // Gõ tiếp sau ô đã định dạng: "1.000" + "5" → "10.005".
    expect(formatMoneyInput("1.0005", "vi")).toBe("10.005");
  });

  it("Field money: ô thấy được không có name, ô ẩn mang số", () => {
    const { container } = renderIntl(
      <form>
        <Field money label="Giá (đồng)" name="price" defaultValue="690000" />
      </form>,
      "vi",
    );
    const visible = screen.getByLabelText("Giá (đồng)") as HTMLInputElement;
    expect(visible.value).toBe("690.000");
    expect(visible.name).toBe("");
    fireEvent.change(visible, { target: { value: "1250000" } });
    expect(visible.value).toBe("1.250.000");
    const hidden = container.querySelector("input[type=hidden][name=price]") as HTMLInputElement;
    expect(hidden.value).toBe("1250000");
  });
});

describe("EmptyState", () => {
  it("có tiêu đề, lời giải thích và nút", () => {
    render(
      <EmptyState title="Chưa có API key" actions={<a href="/new">Tạo</a>}>
        Giải thích
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "Chưa có API key" })).toBeTruthy();
    expect(screen.getByText("Giải thích")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tạo" }).getAttribute("href")).toBe("/new");
  });
});

describe("AutoFilter", () => {
  it("chọn là lọc ngay, gõ thì chờ ngừng gõ; ô trống không vào URL; nút Lọc bị ẩn", () => {
    vi.useFakeTimers();
    render(
      <form action="/sales/orders">
        <AutoFilter />
        <select name="status" aria-label="status" defaultValue="">
          <option value="">Tất cả</option>
          <option value="paid">Đã trả</option>
        </select>
        <input name="q" aria-label="q" type="search" defaultValue="" />
        <button type="submit">Lọc</button>
      </form>,
    );
    expect((screen.getByText("Lọc") as HTMLButtonElement).hidden).toBe(true);
    fireEvent.change(screen.getByLabelText("status"), { target: { value: "paid" } });
    expect(replace).toHaveBeenLastCalledWith("/sales/orders?status=paid", { scroll: false });
    fireEvent.input(screen.getByLabelText("q"), { target: { value: "BM-26" } });
    expect(replace).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(replace).toHaveBeenLastCalledWith("/sales/orders?status=paid&q=BM-26", {
      scroll: false,
    });
  });

  it("gõ rồi bấm ra ngoài form (mở một dòng): không lọc nữa", () => {
    vi.useFakeTimers();
    render(
      <div>
        <form action="/customers">
          <AutoFilter />
          <input name="q" aria-label="q" type="search" defaultValue="" />
        </form>
        <a href="/customers/1">Nguyễn Thị Hoa</a>
      </div>,
    );
    fireEvent.input(screen.getByLabelText("q"), { target: { value: "hoa" } });
    fireEvent.pointerDown(screen.getByText("Nguyễn Thị Hoa"));
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
