import { describe, expect, it } from "vitest";
import { qrPath } from "./qr";

describe("qrPath", () => {
  const url = "otpauth://totp/Autoxide:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Autoxide";

  it("mã có viền 2 ô, path chỉ gồm hình chữ nhật cao 1 ô", () => {
    const { size, d } = qrPath(url);

    // Phiên bản QR nào cũng có cạnh 17 + 4k ô, cộng viền 2 ô mỗi bên.
    expect((size - 4 - 17) % 4).toBe(0);
    expect(d).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    // Ô góc trên trái của mẫu định vị nằm ngay sau viền.
    expect(d.startsWith("M2 2h7v1h-7z")).toBe(true);
  });

  it("cùng nội dung cho cùng mã", () => {
    expect(qrPath(url)).toEqual(qrPath(url));
    expect(qrPath(url).d).not.toBe(qrPath(`${url}x`).d);
  });
});
