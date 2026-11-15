// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type Entry, localToIso } from "@/lib/content";
import { renderIntl } from "@/test/render";
import { BodyView } from "./body-view";
import { EntryTable } from "./entry-list";

afterEach(cleanup);

function entry(change: Partial<Entry> = {}): Entry {
  return {
    id: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11",
    kind: "post",
    version: '"1"',
    locale: "vi",
    translation_group_id: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11",
    parent_id: null,
    status: "draft",
    has_unpublished_changes: false,
    title: "Chọn chảo gang cho bếp từ",
    slug: "chon-chao-gang-cho-bep-tu",
    excerpt: "",
    body: { type: "doc", content: [] },
    body_schema_version: 1,
    word_count: 0,
    reading_time_minutes: 0,
    featured_media_id: null,
    featured_media_alt: "",
    meta_title: "",
    meta_description: "",
    og_media_id: null,
    canonical_url: "",
    noindex: false,
    ai_generated: false,
    review_requested_at: null,
    review_requested_by: null,
    translated_from_revision_id: null,
    translation_outdated: false,
    created_by: null,
    created_via: "session",
    created_at: "2026-11-15T01:00:00Z",
    updated_at: "2026-11-15T02:00:00Z",
    term_ids: [],
    author_ids: [],
    ...change,
  };
}

describe("EntryTable", () => {
  it("mỗi bài một dòng: link tới trình soạn, trạng thái, nhãn cột cho thẻ điện thoại", () => {
    renderIntl(
      <EntryTable
        entries={[
          entry({ review_requested_at: "2026-11-15T03:00:00Z", author_ids: ["a1", "a2"] }),
          entry({
            id: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e12",
            title: "Đổi trả trong 7 ngày",
            status: "published",
            has_unpublished_changes: true,
            locale: "en",
            ai_generated: true,
          }),
        ]}
        authors={{ a1: "Minh Anh", a2: "Thu Hà" }}
        filtered={false}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0] as HTMLElement);
    expect(
      first.getByRole("link", { name: "Chọn chảo gang cho bếp từ" }).getAttribute("href"),
    ).toBe("/content/0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11");
    expect(first.getByText("Draft")).toBeTruthy();
    expect(first.getByText("In review")).toBeTruthy();
    expect(first.getByText("Minh Anh, Thu Hà")).toBeTruthy();
    const second = within(rows[1] as HTMLElement);
    expect(second.getByText("Published")).toBeTruthy();
    expect(second.getByText("Unpublished changes")).toBeTruthy();
    expect(second.getByText(/AI-assisted/)).toBeTruthy();
    const labels = [...(rows[0] as HTMLElement).querySelectorAll("td")].map((td) =>
      td.getAttribute("data-label"),
    );
    expect(labels).toEqual([null, "Status", "Language", "Authors", "Last edited"]);
  });

  it("rỗng: câu khác nhau khi đang lọc và khi chưa có bài", () => {
    renderIntl(<EntryTable entries={[]} authors={{}} filtered={false} />);
    expect(screen.getByText(/No posts or pages yet/)).toBeTruthy();
    cleanup();
    renderIntl(<EntryTable entries={[]} authors={{}} filtered />);
    expect(screen.getByText("No post or page matches these filters.")).toBeTruthy();
  });
});

describe("BodyView", () => {
  it("hiện node cho phép, link không an toàn thành chữ thường", () => {
    const { container } = renderIntl(
      <BodyView
        body={{
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Cách chọn" }],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Đọc ", marks: [{ type: "bold" }] },
                {
                  type: "text",
                  text: "đây",
                  marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                },
                { type: "text", text: " và ", marks: [] },
                {
                  type: "text",
                  text: "kia",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
            { type: "script", text: "alert(1)" },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "một" }] }],
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Cách chọn" })).toBeTruthy();
    expect(container.querySelector("strong")?.textContent).toBe("Đọc ");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://example.com");
    expect(container.textContent).toContain("kia");
    expect(container.textContent).not.toContain("alert");
    expect(screen.getByRole("listitem").textContent).toBe("một");
  });
});

describe("localToIso", () => {
  it("giờ địa phương thành UTC; rỗng hay sai thì null", () => {
    expect(localToIso("")).toBeNull();
    expect(localToIso("not a date")).toBeNull();
    expect(localToIso("2026-11-20T08:00")).toBe(new Date("2026-11-20T08:00").toISOString());
  });
});
