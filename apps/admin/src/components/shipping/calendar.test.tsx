// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { monthGrid } from "@/lib/shipping-calendar";
import { renderIntl } from "@/test/render";
import { calendarHref, MonthCalendar } from "./calendar";

afterEach(cleanup);

const RULES = [
  { id: "a", cutoff: "16:00", workdays: [1, 2, 3, 4, 5, 6], effective_from: "2026-01-01" },
];
const HOLIDAYS = [
  {
    id: "h",
    org_id: null,
    name: "Nghỉ bù",
    from: "2026-11-25",
    to: "2026-11-25",
    status: "confirmed",
  },
];

describe("MonthCalendar", () => {
  it("lưới 7 cột từ thứ Hai, giờ 24h, ngày dd/mm, ô là liên kết ?day=", () => {
    const weeks = monthGrid("2026-11", RULES, HOLIDAYS, "2026-11-17");
    renderIntl(
      <MonthCalendar month="2026-11" selected="2026-11-19" weeks={weeks} today="2026-11-17" />,
      "en",
    );
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    const heads = screen.getAllByRole("columnheader");
    expect(heads).toHaveLength(7);
    expect(heads[0]?.textContent).toContain("Mon");
    const thu = screen.getByRole("link", { name: /^Thursday 19\/11\/2026/ });
    expect(thu.getAttribute("href")).toBe("/sales/shipping/calendar?month=2026-11&day=2026-11-19");
    expect(thu.getAttribute("aria-current")).toBe("true");
    expect(thu.getAttribute("aria-label")).toContain("cut-off 16:00");
    expect(thu.textContent).toContain("16:00");
    expect(document.body.textContent).not.toMatch(/AM|PM/);
    expect(
      screen.getByRole("link", { name: /^Wednesday 25\/11\/2026 · Holiday: Nghỉ bù/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /^Sunday 22\/11\/2026 · No carrier pickup/ }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Tuesday 17\/11\/2026 · Today/ })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Change month" });
    expect(within(nav).getByRole("link", { name: "Next month" }).getAttribute("href")).toBe(
      calendarHref("2026-12"),
    );
    expect(within(nav).getByRole("link", { name: "Previous month" }).getAttribute("href")).toBe(
      calendarHref("2026-10"),
    );
  });

  it("tiếng Việt: tên tháng và thứ theo Intl", () => {
    const weeks = monthGrid("2026-11", RULES, HOLIDAYS, "2026-11-17");
    renderIntl(
      <MonthCalendar month="2026-11" selected="2026-11-17" weeks={weeks} today="2026-11-17" />,
      "vi",
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^Tháng 11/);
    expect(
      screen.getByRole("link", { name: /^Thứ Năm 19\/11\/2026 · Hãng lấy hàng, chốt 16:00/ }),
    ).toBeTruthy();
  });
});
