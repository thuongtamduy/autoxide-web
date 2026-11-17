// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderIntl } from "@/test/render";
import { type PosStore, PosTerminal } from "./pos";

// Server Action không chạy được trong jsdom: tạm tính trả "không giảm", tìm khách trả rỗng.
vi.mock("@/app/(admin)/sales/orders/actions", () => ({
  posSaleAction: vi.fn(async () => ({})),
  posQuoteAction: vi.fn(async () => ({ discount: 0, applied: [], rejected: [], gifts: [] })),
  posCustomersAction: vi.fn(async () => []),
}));

afterEach(cleanup);

const STORES: PosStore[] = [
  {
    id: "q3",
    name: "CN Quận 3",
    shift: { id: "s1", register: "Quầy 1", cashier: "Trần Lan", since: "2026-11-17T01:02:00Z" },
    items: [
      {
        sku: "CG26",
        name: "Chảo gang 26 cm",
        barcode: "8930000000026",
        category: { id: "c1", name: "Nồi chảo" },
        price: 690_000,
        vat: 8,
        available: 2,
      },
      {
        sku: "CG28",
        name: "Chảo gang 28 cm",
        barcode: null,
        category: { id: "c1", name: "Nồi chảo" },
        price: 760_000,
        vat: 8,
        available: 0,
      },
      {
        sku: "KB4",
        name: "Khăn bếp cotton",
        barcode: null,
        category: { id: "c2", name: "Khăn" },
        price: 99_000,
        vat: 8,
        available: 9,
      },
    ],
  },
  { id: "cg", name: "CN Cầu Giấy", shift: null, items: [] },
];

const total = () => screen.getByTestId("pos-total").textContent;

describe("PosTerminal", () => {
  it("chạm sản phẩm thêm vào giỏ; hàng hết không bấm được; không vượt tồn", () => {
    renderIntl(<PosTerminal stores={STORES} />);
    const charge = screen.getByRole("button", { name: /^Charge/ });
    expect((charge as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Add Chảo gang 28 cm/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const pan = screen.getByRole("button", { name: /^Add Chảo gang 26 cm/ });
    fireEvent.click(pan);
    fireEvent.click(pan);
    fireEvent.click(pan);
    expect(screen.getByText("Only 2 of Chảo gang 26 cm left at this store.")).toBeTruthy();
    expect(screen.getByLabelText("Quantity of Chảo gang 26 cm")?.textContent).toContain("2");
    expect(total()).toContain("1,380,000");
    expect((charge as HTMLButtonElement).disabled).toBe(false);
  });

  it("máy quét gõ mã vạch rồi Enter: thêm đúng hàng, xoá ô tìm; mã lạ báo lỗi", () => {
    renderIntl(<PosTerminal stores={STORES} />);
    const search = screen.getByLabelText("Find a product");
    fireEvent.change(search, { target: { value: "8930000000026" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByLabelText("Quantity of Chảo gang 26 cm")?.textContent).toContain("1");
    expect((search as HTMLInputElement).value).toBe("");
    fireEvent.change(search, { target: { value: "zzz" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByText("No product has the code zzz.")).toBeTruthy();
  });

  it("tiền mặt: khách đưa thiếu thì chặn thanh toán; đủ thì hiện tiền thối", () => {
    renderIntl(<PosTerminal stores={STORES} />);
    fireEvent.click(screen.getByRole("button", { name: /^Add Khăn bếp cotton/ }));
    const given = screen.getByLabelText("Cash received");
    fireEvent.change(given, { target: { value: "50000" } });
    expect(screen.getByText(/49,000.*short/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Charge/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const quick = screen.getByRole("group", { name: "Quick amounts" });
    fireEvent.click(within(quick).getByRole("button", { name: /100,000/ }));
    expect(screen.getByText("Change").nextSibling?.textContent).toContain("1,000");
    expect((screen.getByRole("button", { name: /^Charge/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("lọc theo nhóm; cửa hàng chưa mở ca thì không thanh toán được", () => {
    renderIntl(<PosTerminal stores={STORES} />);
    const groups = screen.getByRole("group", { name: "Product groups" });
    fireEvent.click(within(groups).getByRole("button", { name: /^Khăn/ }));
    expect(screen.queryByRole("button", { name: /^Add Chảo gang 26 cm/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Store"), { target: { value: "cg" } });
    expect(screen.getByText("No shift is open at this store.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open a shift" })).toBeTruthy();
  });

  it("giữ đơn rồi mở lại: giỏ trống khi giữ, quay về khi mở", () => {
    renderIntl(<PosTerminal stores={STORES} />);
    fireEvent.click(screen.getByRole("button", { name: /^Add Khăn bếp cotton/ }));
    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    expect(
      screen.getByText("Scan a barcode or tap a product to add it to the order."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Held orders/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Held at/ }));
    expect(screen.getByLabelText("Quantity of Khăn bếp cotton")?.textContent).toContain("1");
  });
});
