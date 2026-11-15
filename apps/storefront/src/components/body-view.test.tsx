// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { outline } from "@/lib/body";
import type { BodyNode } from "@/lib/types";
import { BodyView } from "./body-view";

const doc = (content: BodyNode[]): BodyNode => ({ type: "doc", content });
const text = (value: string, marks?: BodyNode["marks"]): BodyNode => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("BodyView", () => {
  it("link trong site có tiền tố ngôn ngữ; link không an toàn thành chữ thường", () => {
    const { container } = render(
      <BodyView
        locale="en"
        body={doc([
          {
            type: "paragraph",
            content: [
              text("a", [{ type: "link", attrs: { href: "/blog/x" } }]),
              text("b", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
              text("c", [{ type: "link", attrs: { href: "https://example.com" } }]),
            ],
          },
        ])}
      />,
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/en/blog/x", "https://example.com"]);
    expect(links[1]?.getAttribute("rel")).toContain("nofollow");
    expect(container.textContent).toBe("abc");
  });

  it("tiêu đề có mỏ neo của mục lục; node lạ bị bỏ; ảnh không công khai không hiện", () => {
    const { body } = outline(
      doc([
        { type: "heading", attrs: { level: 2 }, content: [text("Chảo gang")] },
        { type: "script", content: [text("x")] },
        { type: "image", attrs: { mediaId: "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81", alt: "ảnh" } },
      ]),
    );
    const { container } = render(<BodyView locale="vi" body={body} />);
    expect(container.querySelector("h2")?.id).toBe("chao-gang");
    expect(container.textContent).toBe("Chảo gang");
    expect(container.querySelector("img")).toBeNull();
  });

  it("ảnh công khai lấy địa chỉ và bản thu nhỏ từ body_media", () => {
    const id = "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81";
    const { container } = render(
      <BodyView
        locale="vi"
        body={doc([{ type: "image", attrs: { mediaId: id, alt: "Chảo", caption: "Chú thích" } }])}
        media={[
          {
            id,
            url: `/api/v1/media/${id}/content?v=1`,
            alt: "x",
            width: 1200,
            height: 800,
            variants: [
              {
                width: 400,
                height: 267,
                url: `/api/v1/media/${id}/content?v=1&w=400`,
                webp_url: null,
              },
            ],
          },
        ]}
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(`/api/v1/media/${id}/content?v=1`);
    expect(img?.getAttribute("srcset")).toContain("400w");
    expect(img?.getAttribute("alt")).toBe("Chảo");
    expect(container.querySelector("figcaption")?.textContent).toBe("Chú thích");
  });
});
