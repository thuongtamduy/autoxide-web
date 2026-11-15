// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { buildQuote } from "@/sample/checkout";
import { sampleBuyerOrders } from "@/sample/orders";
import en from "../../../messages/en.json";
import vi from "../../../messages/vi.json";
import { OrderView } from "./order-view";
import { QuoteSummary } from "./quote-summary";

const NOW = new Date("2026-11-13T03:00:00Z");

function withIntl(locale: "vi" | "en", node: React.ReactNode) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "vi" ? vi : en}
      timeZone="Asia/Ho_Chi_Minh"
    >
      {node}
    </NextIntlClientProvider>
  );
}

describe("OrderView", () => {
  it("đơn đang giao: trạng thái, mốc hiện tại, vận đơn, tổng không bẻ dòng", () => {
    const order = sampleBuyerOrders(NOW).find((o) => o.number === "BM-2611-0421");
    if (!order) throw new Error("thiếu đơn mẫu");
    render(withIntl("vi", <OrderView order={order} locale="vi" siteName="Bếp Mộc" />));
    expect(screen.getByText("Đang giao", { selector: ".badge" })).toBeTruthy();
    const current = document.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Đang giao");
    expect(screen.getByText("VTBM-26110421")).toBeTruthy();
    expect(screen.getByText("680.000 ₫").className).toContain("price");
  });

  it("nhận tại cửa hàng, tiếng Anh", () => {
    const order = sampleBuyerOrders(NOW).find((o) => o.number === "BM-2610-0388");
    if (!order) throw new Error("thiếu đơn mẫu");
    render(withIntl("en", <OrderView order={order} locale="en" siteName="Bếp Mộc" />));
    expect(screen.getByText("Store pickup")).toBeTruthy();
    expect(screen.getByText("Picked up")).toBeTruthy();
  });
});

describe("QuoteSummary", () => {
  it("phí từng nơi bán, giảm theo mã, còn bao nhiêu để miễn phí giao", () => {
    const quote = buildQuote({
      lines: [
        { sku: "CG26", quantity: 1 },
        { sku: "GS-DIA26", quantity: 1 },
      ],
      code: "BEPMOC10",
      store: "q3",
      delivery: "ship",
      province: "79",
      points: 0,
      balance: null,
      now: NOW,
    });
    render(
      withIntl("vi", <QuoteSummary quote={quote} locale="vi" siteName="Bếp Mộc" delivery="ship" />),
    );
    expect(screen.getByText("Giảm giá (BEPMOC10)")).toBeTruthy();
    expect(screen.getByText("−69.000 ₫".replace("−", "-"))).toBeTruthy();
    expect(screen.getByText("Phí giao của Gốm Sứ Bát Tràng Xưa")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(String(621_000));
    expect(screen.getByText(/tách thành 2 đơn/)).toBeTruthy();
  });
});
