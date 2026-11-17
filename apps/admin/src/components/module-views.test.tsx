// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KERNEL, NOTES } from "@/test/fixtures";
import { renderIntl } from "@/test/render";
import { ModuleDetail } from "./module-detail";
import { ModuleList, moduleState } from "./module-list";

afterEach(cleanup);

describe("ModuleList", () => {
  it("mỗi module một dòng: tên dễ đọc (xếp theo tên), tên mã, mô tả, link chi tiết, số đếm thu gọn", () => {
    renderIntl(<ModuleList modules={[NOTES, KERNEL]} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const [core, notes] = rows.map((row) => within(row as HTMLElement));
    expect(core?.getByRole("link", { name: "Core" }).getAttribute("href")).toBe(
      "/settings/modules/kernel",
    );
    expect(core?.getByText("Built-in")).toBeTruthy();
    expect(notes?.getByRole("link", { name: "Notes" }).getAttribute("href")).toBe(
      "/settings/modules/notes",
    );
    expect(notes?.getByText("notes")).toBeTruthy();
    expect(notes?.getByText("Example module: short notes.")).toBeTruthy();
    expect(notes?.getByText("Technical details")).toBeTruthy();
    expect(notes?.getAllByRole("definition").map((cell) => cell.textContent)).toEqual([
      "2",
      "1",
      "1",
      "1",
      "2",
      "2",
    ]);
  });

  it("module lạ hiện tên mã; trạng thái theo gói", () => {
    const shop = { ...NOTES, name: "shop" };
    const always = { ...NOTES, name: "audit", always_enabled: true };
    renderIntl(<ModuleList modules={[shop, always, NOTES]} enabled={["notes"]} />);

    const row = (name: string) =>
      within(screen.getByRole("link", { name }).closest("li") as HTMLElement);
    expect(row("shop").getByText("Not in your plan")).toBeTruthy();
    expect(row("shop").getByText("Module of this server.")).toBeTruthy();
    expect(row("Audit log").getByText("Always on")).toBeTruthy();
    expect(row("Notes").getByText("On")).toBeTruthy();
  });

  it("không biết gói thì coi như bật", () => {
    expect(moduleState(NOTES, null)).toBe("on");
    expect(moduleState(NOTES, [])).toBe("off");
    expect(moduleState({ ...NOTES, always_enabled: true }, [])).toBe("always");
  });

  it("không có module thì báo rỗng", () => {
    renderIntl(<ModuleList modules={[]} />);

    expect(screen.getByText("No modules.")).toBeTruthy();
  });

  it("tiếng Việt", () => {
    renderIntl(<ModuleList modules={[KERNEL]} />, "vi");

    expect(screen.getByRole("link", { name: "Lõi hệ thống" })).toBeTruthy();
    expect(screen.getByText("Chi tiết kỹ thuật")).toBeTruthy();
  });
});

describe("ModuleDetail", () => {
  it("hiện mọi nhóm khai báo, kể cả migration chưa áp dụng", () => {
    renderIntl(<ModuleDetail module={NOTES} />);

    expect(screen.getByText("Applied")).toBeTruthy();
    expect(screen.getByText("Not applied")).toBeTruthy();
    expect(screen.getByText(/autoxide migrate up/)).toBeTruthy();
    expect(screen.getByText("Write notes.")).toBeTruthy();
    expect(screen.getByText("destructive")).toBeTruthy();
    expect(screen.getByText("read-only")).toBeTruthy();
    expect(screen.getByText("any signed-in caller")).toBeTruthy();
    expect(screen.getByText("every event")).toBeTruthy();
    expect(screen.getByText("Every 1 day")).toBeTruthy();
    expect(screen.getByText("GET /api/v1/notes/{id}")).toBeTruthy();
    expect(screen.getByText("/api/v2/notes/{id}")).toBeTruthy();
  });

  it("module không khai gì thì báo không có; migration chưa đọc trạng thái thì để trống", () => {
    renderIntl(<ModuleDetail module={KERNEL} />);

    expect(screen.getAllByText("None.").length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText("Applied")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("tiếng Việt", () => {
    renderIntl(<ModuleDetail module={NOTES} />, "vi");

    expect(screen.getByText("Đã áp dụng")).toBeTruthy();
    expect(screen.getByText("Mỗi 1 ngày")).toBeTruthy();
  });
});
