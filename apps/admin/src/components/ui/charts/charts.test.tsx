// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dayPoints, hourPoints } from "@/lib/chart";
import { BarChart } from "./bar-chart";
import { ChangeFigure } from "./change-figure";
import { Sparkline, sparkY } from "./sparkline";
import { TimeSeriesChart } from "./time-series";

afterEach(cleanup);

const text = { data: "Xem số liệu", x: "Ngày", hint: "Dùng phím mũi tên" };
const days = ["2026-11-15", "2026-11-16", "2026-11-17"];

describe("TimeSeriesChart", () => {
  it("có nhãn cho trình đọc màn hình, đúng số điểm, kỳ trước nét đứt và bảng số liệu", () => {
    const { container } = render(
      <TimeSeriesChart
        label="Doanh thu"
        summary="Tổng 600.000 ₫"
        x={dayPoints(days, "vi")}
        series={[
          { id: "now", label: "7 ngày qua", values: [100_000, 200_000, 300_000], color: 1 },
          { id: "before", label: "7 ngày trước đó", values: [50_000, 0, 100_000], previous: true },
        ]}
        area
        unit="money"
        locale="vi"
        text={text}
      />,
    );
    const img = screen.getByRole("img", { name: "Doanh thu. Tổng 600.000 ₫" });
    const lines = img.querySelectorAll("path.chart-line");
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.getAttribute("data-points")).toBe("3");
    expect(img.querySelectorAll("path.chart-line.previous")).toHaveLength(1);
    expect(img.querySelector("path.chart-area")).not.toBeNull();
    // Hai chuỗi thì có chú giải.
    expect(container.querySelectorAll(".chart-legend li")).toHaveLength(2);
    // Bảng: một hàng mỗi ngày, số định dạng theo ngôn ngữ.
    const rows = container.querySelectorAll(".chart-data tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[2]?.textContent).toContain("300.000 ₫");
    expect(screen.getByText("Xem số liệu")).toBeTruthy();
  });

  it("một chuỗi không có hộp chú giải; vạch ngưỡng có trong chú giải", () => {
    const one = render(
      <TimeSeriesChart
        label="Huỷ"
        x={dayPoints(days, "en")}
        series={[{ id: "c", label: "Huỷ", values: [1, 1.5, 1.2] }]}
        unit="percent"
        locale="en"
        text={text}
      />,
    );
    expect(one.container.querySelector(".chart-legend")).toBeNull();
    cleanup();
    const withLimit = render(
      <TimeSeriesChart
        label="Huỷ"
        x={dayPoints(days, "en")}
        series={[{ id: "c", label: "Huỷ", values: [1, 1.5, 1.2] }]}
        threshold={{ value: 2, label: "Ngưỡng 2%" }}
        unit="percent"
        locale="en"
        text={text}
      />,
    );
    expect(withLimit.container.querySelector("line.chart-threshold")).not.toBeNull();
    expect(screen.getByText("Ngưỡng 2%")).toBeTruthy();
  });

  it("phím mũi tên chọn từng mốc và đọc mọi chuỗi tại mốc đó", () => {
    render(
      <TimeSeriesChart
        label="Doanh thu"
        x={dayPoints(days, "en")}
        series={[
          { id: "a", label: "Web", values: [1000, 2000, 3000], color: 1 },
          { id: "b", label: "POS", values: [10, 20, 30], color: 2 },
        ]}
        unit="count"
        locale="en"
        text={text}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Dùng phím mũi tên" });
    fireEvent.focus(slider);
    expect(slider.getAttribute("aria-valuenow")).toBe("3");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider.getAttribute("aria-valuenow")).toBe("2");
    expect(slider.getAttribute("aria-valuetext")).toContain("Web 2,000");
    expect(slider.getAttribute("aria-valuetext")).toContain("POS 20");
    expect(slider.querySelector(".chart-tip")?.textContent).toContain("2,000");
  });
});

describe("BarChart", () => {
  it("một cột cho mỗi giá trị dương, có nhãn và bảng", () => {
    const hours = ["2026-11-17T01:00:00Z", "2026-11-17T02:00:00Z", "2026-11-17T03:00:00Z"];
    const { container } = render(
      <BarChart
        label="Job hỏng mới"
        summary="9 job"
        x={hourPoints(hours, "vi", "Asia/Ho_Chi_Minh")}
        values={[0, 2, 9]}
        seriesLabel="Job hỏng"
        unit="count"
        locale="vi"
        text={{ ...text, x: "Giờ" }}
      />,
    );
    const img = screen.getByRole("img", { name: "Job hỏng mới. 9 job" });
    expect(img.querySelectorAll(".chart-slot")).toHaveLength(3);
    expect(img.querySelectorAll(".chart-bar")).toHaveLength(2);
    expect(container.querySelectorAll(".chart-data tbody tr")).toHaveLength(3);
    // Giờ hiện theo giờ Việt Nam.
    expect(container.querySelector(".chart-data tbody th")?.textContent).toContain("08:00");
  });
});

describe("Sparkline", () => {
  it("có nhãn, đúng số điểm, dưới hai điểm thì không vẽ", () => {
    render(<Sparkline values={[3, 5, 4, 8]} label="14 ngày qua: từ 3 tới 8" />);
    const img = screen.getByRole("img", { name: "14 ngày qua: từ 3 tới 8" });
    expect(img.querySelector("path")?.getAttribute("data-points")).toBe("4");
    cleanup();
    const { container } = render(<Sparkline values={[3]} label="x" />);
    expect(container.innerHTML).toBe("");
  });

  it("dãy phẳng nằm giữa, dãy tăng đi từ dưới lên", () => {
    expect(sparkY([2, 2])).toEqual([50, 50]);
    const [first, last] = [sparkY([0, 10])[0], sparkY([0, 10])[1]];
    expect(first).toBeGreaterThan(last ?? 0);
  });
});

describe("ChangeFigure", () => {
  it("tăng là tốt: dấu, mũi tên và lớp màu", () => {
    const { container } = render(
      <ChangeFigure value="1.000 ₫" change={12.5} changeText="+12,5%" note="so với 7 ngày trước" />,
    );
    expect(container.querySelector(".chart-delta.up")?.textContent).toContain("+12,5%");
  });

  it("kỳ trước bằng 0: không có phần trăm, chỉ có ghi chú", () => {
    const { container } = render(
      <ChangeFigure value="1.000 ₫" change={null} changeText="" note="Chưa có số liệu để so" />,
    );
    expect(container.querySelector(".chart-delta")).toBeNull();
    expect(screen.getByText("Chưa có số liệu để so")).toBeTruthy();
  });
});
