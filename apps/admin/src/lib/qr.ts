// Mã QR dạng một path SVG (mỗi ô đen là một hình vuông 1 × 1), để hiện địa chỉ `otpauth://` cho
// app xác thực quét. Sinh ở máy chủ: trình duyệt chỉ nhận path, không tải thư viện QR.
import { encode } from "uqr";

export interface QrPath {
  /** Số ô mỗi cạnh, kể cả viền trắng: dùng làm `viewBox`. */
  size: number;
  /** Thuộc tính `d` của `<path>`. */
  d: string;
}

export function qrPath(text: string): QrPath {
  // Mức sửa lỗi M (15%): đủ cho màn hình, mã không quá dày. Viền 2 ô để app quét dễ.
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      // Gộp các ô đen liền nhau trên một hàng thành một hình chữ nhật: path ngắn hơn nhiều.
      let run = 1;
      while (row[x + run]) run += 1;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return { size, d };
}
