// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Entry, localToIso } from "@/lib/content";
import { renderIntl } from "@/test/render";
import { ToastProvider } from "../ui/toast";
import { BodyView } from "./body-view";
import { EntryTable, UpcomingTable } from "./entry-list";

// Server Action không chạy được trong jsdom; bảng chỉ cần tham chiếu tới nó.
vi.mock("@/app/(admin)/content/actions", () => ({
  approveEntry: vi.fn(),
  archiveFromList: vi.fn(),
  bulkArchiveEntries: vi.fn(),
  bulkDeleteEntries: vi.fn(),
  bulkPublishEntries: vi.fn(),
  bulkUnpublishEntries: vi.fn(),
  deleteFromList: vi.fn(),
  unpublishFromList: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/content",
}));

const ALL = { write: true, publish: true, publishAll: true, delete: true };
const NONE = { write: false, publish: false, publishAll: false, delete: false };
const SORT = { field: "updated", dir: "desc" } as const;

function Entries(props: {
  entries: Entry[];
  authors?: Record<string, string>;
  filtered?: boolean;
  can?: typeof ALL;
  status?: "all" | "review";
}) {
  return (
    <ToastProvider>
      <EntryTable
        entries={props.entries}
        authors={props.authors ?? {}}
        filtered={props.filtered ?? false}
        can={props.can ?? NONE}
        status={props.status ?? "all"}
        sort={SORT}
        keep={{}}
      />
    </ToastProvider>
  );
}

afterEach(cleanup);

function entry(change: Partial<Entry> = {}): Entry {
  return {
    id: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e11",
    kind: "post",
    ai_assisted: false,
    custom_fields: {},
    path: null,
    published_at: null,
    tags: [],
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
  it("⋯ của dòng theo trạng thái và quyền: Duyệt và đăng chỉ ở bài chờ duyệt, không nút nào nằm trên dòng", () => {
    const list = [
      entry({ review_requested_at: "2026-11-15T03:00:00Z" }),
      entry({
        id: "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e13",
        title: "Bài khác",
        status: "published",
      }),
    ];
    renderIntl(<Entries entries={list} can={ALL} />);
    // Không còn nút "Duyệt và đăng" trên dòng (từng bị cắt ở mép bảng).
    expect(screen.queryByRole("button", { name: /^Approve and publish/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "More actions for Chọn chảo gang cho bếp từ" }),
    );
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Open",
      "Approve and publish",
      "Archive",
      "Delete",
    ]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "More actions for Bài khác" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Open",
      "Unpublish",
      "Archive",
      "Delete",
    ]);
    cleanup();
    // Chỉ đọc: không ô chọn, "⋯" chỉ còn "Mở".
    renderIntl(<Entries entries={list} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More actions for Bài khác" }));
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Open"]);
  });

  it("chọn nhiều: thanh hàng loạt theo quyền, tab chờ duyệt gọi là Duyệt và đăng", () => {
    renderIntl(<Entries entries={[entry()]} can={ALL} status="review" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Chọn chảo gang cho bếp từ" }));
    const bar = within(screen.getByRole("region", { name: "1 selected" }));
    expect(
      bar
        .getAllByRole("button")
        .map((b) => b.textContent)
        .slice(0, 4),
    ).toEqual(["Approve and publish", "Unpublish", "Archive", "Delete"]);
    // Cột "Sửa lần cuối" sắp được (order của core), có aria-sort.
    expect(
      screen.getByRole("columnheader", { name: /Last edited/ }).getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("mỗi bài một dòng: link tới trình soạn, trạng thái, nhãn cột cho thẻ điện thoại", () => {
    renderIntl(
      <Entries
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
    expect(labels).toEqual([null, "Status", "Language", "Authors", "Last edited", "Actions"]);
  });

  it("rỗng: câu khác nhau khi đang lọc và khi chưa có bài", () => {
    renderIntl(<Entries entries={[]} />);
    expect(screen.getByText(/No posts or pages yet/)).toBeTruthy();
    cleanup();
    renderIntl(<Entries entries={[]} filtered />);
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

describe("BodyView với ảnh của bản xem trước", () => {
  const PUBLIC = "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e21";
  const PRIVATE = "0193e3a4-7b1c-7f00-9a51-6f2b8c0d4e22";
  it("ảnh công khai tải theo địa chỉ có phiên bản của core; ảnh không có trong đó thành ô giữ chỗ", () => {
    const { container } = renderIntl(
      <BodyView
        body={{
          type: "doc",
          content: [
            { type: "image", attrs: { mediaId: PUBLIC, alt: "" } },
            { type: "image", attrs: { mediaId: PRIVATE, alt: "Riêng" } },
          ],
        }}
        media={[
          {
            id: PUBLIC,
            alt_ai_assisted: false,
            url: `/api/v1/media/${PUBLIC}/content?v=v1`,
            alt: "Chảo gang",
            width: 1200,
            height: 800,
            variants: [
              {
                width: 640,
                height: 427,
                url: `/api/v1/media/${PUBLIC}/content?v=v1&w=640`,
              },
            ],
          },
        ]}
        missingImage="Ảnh không hiện"
      />,
    );
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe(`/media/${PUBLIC}/content?v=v1`);
    expect(images[0]?.getAttribute("srcset")).toBe(`/media/${PUBLIC}/content?v=v1&w=640 640w`);
    // Alt của node trống thì dùng alt của tệp.
    expect(images[0]?.getAttribute("alt")).toBe("Chảo gang");
    expect(screen.getByRole("img", { name: "Ảnh không hiện" })).toBeTruthy();
  });
});

describe("UpcomingTable", () => {
  it("lịch sớm nhất trước, kèm tên bài; bài không đọc được vẫn có dòng", () => {
    const schedule = (id: string, entry_id: string, run_at: string) => ({
      id,
      entry_id,
      action: "publish" as const,
      run_at,
      status: "scheduled",
      ai_reviewed: id === "s2",
      created_at: "2026-11-01T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
    });
    renderIntl(
      <UpcomingTable
        schedules={[
          schedule("s1", "missing", "2026-12-02T00:00:00Z"),
          schedule("s2", entry().id, "2026-12-01T00:00:00Z"),
        ]}
        entries={[entry()]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]?.textContent).toContain("Chọn chảo gang cho bếp từ");
    expect(rows[0]?.textContent).toContain("AI content reviewed");
    expect(rows[1]?.textContent).toContain("(post not found)");
  });
});

describe("localToIso", () => {
  it("giờ địa phương thành UTC; rỗng hay sai thì null", () => {
    expect(localToIso("")).toBeNull();
    expect(localToIso("not a date")).toBeNull();
    expect(localToIso("2026-11-20T08:00")).toBe(new Date("2026-11-20T08:00").toISOString());
  });
});
