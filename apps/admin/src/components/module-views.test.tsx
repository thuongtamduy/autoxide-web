// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KERNEL, NOTES } from "@/test/fixtures";
import { renderIntl } from "@/test/render";
import { ModuleDetail } from "./module-detail";
import { ModuleTable } from "./module-table";

afterEach(cleanup);

describe("ModuleTable", () => {
  it("mỗi module một dòng, có link tới trang chi tiết và số đếm", () => {
    renderIntl(<ModuleTable modules={[KERNEL, NOTES]} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const notes = within(rows[1] as HTMLElement);
    expect(notes.getByRole("link", { name: "notes" }).getAttribute("href")).toBe("/modules/notes");
    expect(notes.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "2",
      "notes",
      "1",
      "1",
      "1",
      "2",
      "2",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("Built-in")).toBeTruthy();
  });

  it("không có module thì báo rỗng", () => {
    renderIntl(<ModuleTable modules={[]} />);

    expect(screen.getByText("No modules.")).toBeTruthy();
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
