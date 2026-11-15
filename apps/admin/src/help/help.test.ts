import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { flagMap, hintDismissed, hintKey, isHintId, NEWS_FLAG, newsSeen } from "./flags";
import { type ArticleText, HELP_PAGES, helpPageOf, searchArticles } from "./pages";
import { compareVersions, latestVersion, unseenNews, WHATS_NEW } from "./whats-new";

describe("cờ giao diện", () => {
  const flags = flagMap([
    { key: "hint.saved_views", value: "dismissed" },
    { key: NEWS_FLAG, value: "2026-11-15.1" },
  ]);

  it("gợi ý đã tắt khi cờ hint.<id> = dismissed", () => {
    expect(hintKey("saved_views")).toBe("hint.saved_views");
    expect(hintDismissed(flags, "saved_views")).toBe(true);
    expect(hintDismissed(flagMap([{ key: "hint.saved_views", value: "x" }]), "saved_views")).toBe(
      false,
    );
  });

  it("không đọc được cờ thì vẫn hiện gợi ý (fail open)", () => {
    expect(hintDismissed(null, "saved_views")).toBe(false);
    expect(newsSeen(null)).toBeNull();
  });

  it("chỉ nhận id gợi ý đã khai", () => {
    expect(isHintId("saved_views")).toBe(true);
    expect(isHintId("../auth")).toBe(false);
    expect(isHintId(42)).toBe(false);
  });

  it("đọc phiên bản Có gì mới đã xem", () => {
    expect(newsSeen(flags)).toBe("2026-11-15.1");
    expect(newsSeen(new Map())).toBeNull();
  });
});

describe("Có gì mới", () => {
  it("so phiên bản theo từng phần số", () => {
    expect(compareVersions("2026-11-15.10", "2026-11-15.9")).toBe(1);
    expect(compareVersions("2026-11-15", "2026-11-15.1")).toBe(-1);
    expect(compareVersions("2026-11-15.2", "2026-11-15.2")).toBe(0);
    expect(compareVersions("2026-12-01", "2026-11-30.9")).toBe(1);
  });

  it("tin mới hơn phiên bản đã xem; chưa xem lần nào thì mọi tin", () => {
    const items = [
      { id: "b", version: "2026-11-16" },
      { id: "a", version: "2026-11-15" },
    ];
    expect(unseenNews(items, null).map((i) => i.id)).toEqual(["b", "a"]);
    expect(unseenNews(items, "2026-11-15").map((i) => i.id)).toEqual(["b"]);
    expect(unseenNews(items, "2026-11-16")).toEqual([]);
    expect(latestVersion(items)).toBe("2026-11-16");
    expect(latestVersion([])).toBeNull();
  });

  it("tin mới nhất đứng đầu và mỗi tin có chữ", () => {
    expect(WHATS_NEW[0]?.version).toBe(latestVersion());
    for (const item of WHATS_NEW) {
      expect(en.help.news.items).toHaveProperty(item.id);
    }
  });
});

describe("trang trợ giúp", () => {
  it.each([
    ["/", "home"],
    ["/work", null],
    ["/sales/orders", "orders"],
    ["/sales/orders/returns", "orders"],
    ["/sales/ordersx", null],
    ["/content/new", "content"],
    ["/org", "org"],
    ["/org/access/users", "org"],
    ["/compliance/privacy", "compliance"],
    ["/platform/plans", "platform"],
    ["/settings/developers/requests", "developers"],
    ["/settings/api-keys/new", "apiKeys"],
    ["/settings", null],
  ])("%s → %s", (path, id) => {
    expect(helpPageOf(path)?.id ?? null).toBe(id);
  });

  it("mỗi bài có tiêu đề và tóm tắt trong messages", () => {
    const pages = en.help.pages as Record<
      string,
      { name: string; articles: Record<string, { title: string; summary: string }> }
    >;
    for (const page of HELP_PAGES) {
      expect(pages[page.id]?.name).toBeTruthy();
      for (const article of page.articles) {
        expect(pages[page.id]?.articles[article.id]?.title).toBeTruthy();
      }
    }
  });

  it("tìm không cần dấu, mọi từ phải khớp; bài không có màn trỏ về màn đầu của trang", () => {
    const list: ArticleText[] = [
      { page: "orders", id: "views", title: "Lưu view", summary: "Mở lại bộ lọc", href: null },
      {
        page: "orders",
        id: "refunds",
        title: "Hoàn tiền và đổi trả",
        summary: "Hoàn một phần",
        href: "/sales/orders/returns",
      },
      { page: "org", id: "tree", title: "Cây tổ chức", summary: "Trụ sở, vùng", href: null },
    ];
    const name = (id: string) => (id === "orders" ? "Đơn hàng" : "Tổ chức");
    expect(searchArticles(list, "hoan tien", name).map((a) => a.id)).toEqual(["refunds"]);
    expect(searchArticles(list, "don hang loc", name)).toEqual([
      { ...list[0], href: "/sales/orders" },
    ]);
    expect(searchArticles(list, "   ", name)).toEqual([]);
    expect(searchArticles(list, "kho", name)).toEqual([]);
  });
});
