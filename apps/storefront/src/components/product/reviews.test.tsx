// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import vi from "../../../messages/vi.json";
import { Questions } from "./questions";
import { Reviews, type ReviewView } from "./reviews";

const review = (id: string, stars: number, sku: string, body: string, photos = 0): ReviewView => ({
  id,
  stars,
  author: "Nguyễn Văn A",
  sku,
  date: `2026-11-0${stars}`,
  body,
  photos,
  helpful: stars,
  shown: "Văn A N.",
  dateText: "01/11/2026",
  variantLabel: sku,
  photoArts: Array.from({ length: photos }, () => ({ art: "pan" as const, tone: "t1" as const })),
  reply: null,
});

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="vi" messages={vi}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("Reviews", () => {
  it("bấm dòng số sao thì lọc; có ảnh; xoá lọc; hữu ích tăng một", () => {
    wrap(
      <Reviews
        rating={4.5}
        total={10}
        distribution={[6, 2, 1, 1, 0]}
        reviews={[
          review("a", 5, "CG26", "Giữ nhiệt tốt", 1),
          review("b", 4, "CG26", "Tay cầm nóng"),
          review("c", 2, "CG28", "Giao chậm", 2),
        ]}
        summary="Tóm tắt"
        topics={[{ label: "Tay cầm nóng", count: 3, keyword: "tay cầm" }]}
        variants={[
          { sku: "CG26", label: "26 cm" },
          { sku: "CG28", label: "28 cm" },
        ]}
        shopName="Bếp Mộc"
        locale="vi"
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Lọc đánh giá 2 sao, 1 đánh giá" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText(/Đang lọc: 2 sao/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xoá lọc" }));
    fireEvent.click(screen.getByRole("button", { name: "Có ảnh" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Xoá lọc" }));
    fireEvent.click(screen.getByRole("button", { name: /Tay cầm nóng/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    const helpful = screen.getByRole("button", { name: "Hữu ích (4)" });
    fireEvent.click(helpful);
    expect(helpful.getAttribute("aria-pressed")).toBe("true");
    expect(helpful.textContent).toContain("Hữu ích (5)");
  });
});

describe("Questions", () => {
  it("tìm bỏ dấu; câu hỏi quá ngắn báo lỗi; câu hỏi mới hiện chờ duyệt", () => {
    wrap(
      <Questions
        product="Chảo gang"
        questions={[
          {
            id: "q1",
            body: "Chảo dùng được bếp hồng ngoại không?",
            who: "Mai T.",
            when: "01/11/2026",
            age: 3,
            helpfulTotal: 4,
            answers: [
              { name: "Bếp Mộc", role: "shop", when: "01/11/2026", body: "Được.", helpful: 4 },
            ],
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm câu hỏi" }), {
      target: { value: "noi chien" },
    });
    expect(screen.getByText("Chưa có câu hỏi nào khớp “noi chien”.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đặt câu hỏi này" }));
    const box = screen.getByRole("textbox", { name: "Câu hỏi của bạn về Chảo gang" });
    fireEvent.change(box, { target: { value: "ngắn" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    expect(screen.getByRole("alert").textContent).toBe("Câu hỏi cần ít nhất 8 ký tự.");
    fireEvent.change(box, { target: { value: "Có nắp đi kèm không ạ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Tìm câu hỏi" }), {
      target: { value: "" },
    });
    expect(screen.getByText("Chờ duyệt · chỉ bạn thấy")).toBeTruthy();
    expect(screen.getByText("Cửa hàng")).toBeTruthy();
  });
});
