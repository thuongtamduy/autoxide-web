// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RevisionDiffView } from "@/components/content/revision-diff";
import { diffSnapshots } from "@/lib/revision-diff";
import { renderIntl } from "@/test/render";
import { LegacyMenuCard } from "./legacy-menu";

afterEach(cleanup);

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("khác biệt giữa hai phiên bản", () => {
  it("ô đổi (trước → sau) và dòng thân bài thêm, bớt", () => {
    const diff = diffSnapshots(
      { title: "Bản cũ", body: { type: "doc", content: [p("Giữ"), p("Bỏ")] } },
      { title: "Bản mới", body: { type: "doc", content: [p("Giữ"), p("Thêm")] } },
    );
    renderIntl(<RevisionDiffView diff={diff} />, "vi");
    expect(screen.getByText("Tiêu đề")).toBeTruthy();
    expect(screen.getByText("Bản cũ").tagName).toBe("DEL");
    expect(screen.getByText("Bản mới").tagName).toBe("INS");
    expect(screen.getByText("Thêm").closest("li")?.className).toBe("add");
    expect(screen.getByText("Bỏ").closest("li")?.className).toBe("remove");
    expect(screen.getByText("+1 −1")).toBeTruthy();
  });

  it("hai phiên bản giống nhau", () => {
    renderIntl(<RevisionDiffView diff={diffSnapshots({ title: "A" }, { title: "A" })} />);
    expect(screen.getByText("The two versions are the same.")).toBeTruthy();
  });
});

describe("menu cũ chỉ đọc", () => {
  it("cây mục và đích của từng mục", () => {
    renderIntl(
      <LegacyMenuCard
        menu={{
          id: "m",
          key: "blog",
          locale: "vi",
          created_at: "2026-11-15T00:00:00Z",
          updated_at: "2026-11-15T00:00:00Z",
          items: [
            {
              id: "1",
              label: "Về Bếp Mộc",
              entry_id: "01a1dddb-a898-7618-bf3d-4a167eb0c3da",
              children: [
                { id: "2", label: "Liên hệ", url: "mailto:hotro@example.com", children: [] },
              ],
            },
          ],
        }}
      />,
      "vi",
    );
    expect(screen.getByText("blog")).toBeTruthy();
    expect(screen.getByText(/2 mục/)).toBeTruthy();
    expect(screen.getByText("bài 01a1dddb…")).toBeTruthy();
    expect(screen.getByText("mailto:hotro@example.com")).toBeTruthy();
    expect(screen.getByText("Chỉ đọc")).toBeTruthy();
  });
});
