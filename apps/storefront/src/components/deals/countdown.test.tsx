// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import vi from "../../../messages/vi.json";
import { Countdown } from "./countdown";

const HOUR = 3_600_000;

function show(start: number, end: number) {
  return render(
    <NextIntlClientProvider locale="vi" messages={vi}>
      <Countdown start={start} end={end} now={Date.now()} />
    </NextIntlClientProvider>,
  );
}

describe("Countdown", () => {
  it("trước giờ mở: bắt đầu sau; đang chạy: kết thúc sau; xong: đã kết thúc", () => {
    const now = Date.now();
    const { unmount } = show(now + 26 * HOUR + 5 * 60_000 + 30_000, now + 28 * HOUR);
    expect(screen.getByRole("timer").textContent).toBe("Bắt đầu sau 1 ngày 2 giờ 5 phút");
    unmount();
    const running = show(now - HOUR, now + 30 * 60_000 + 30_000);
    expect(screen.getByRole("timer").textContent).toBe("Kết thúc sau 0 giờ 30 phút");
    running.unmount();
    show(now - 2 * HOUR, now - HOUR);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Đã kết thúc")).toBeTruthy();
  });
});
