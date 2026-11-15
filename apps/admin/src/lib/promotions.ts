// Phần thuần (không gọi mạng) của màn "Khuyến mại" (module `promotions` của core, bước 43): permission
// dự kiến, đọc dòng giỏ hàng gõ tay, làm tròn tiền, đổi basis point sang phần trăm. Dùng được cả ở
// máy chủ lẫn trình duyệt.

// Permission dự kiến theo đặc tả bước 43 (`Module::permissions`). Core chưa có module này: sổ điều
// hướng và các nút vẫn lọc theo các tên này (admin có mọi permission), để khi có API thì không sửa.
export const PROMOTIONS_READ = "promotions.read";
export const PROMOTIONS_WRITE = "promotions.write";
export const PROMOTIONS_PUBLISH = "promotions.publish";
export const PROMOTIONS_CODES_MANAGE = "promotions.codes.manage";
export const PROMOTIONS_COMPLIANCE = "promotions.compliance";

/** Số mã tối đa trong một giỏ (`AUTOXIDE_PROMOTIONS_MAX_CODES_PER_CART`, mặc định 5). */
export const MAX_CODES_PER_CART = 5;
/** Số mã tối đa sinh một lần; trên `CODE_JOB_THRESHOLD` thì core chạy bằng job. */
export const MAX_CODES_PER_BATCH = 10_000;
export const CODE_JOB_THRESHOLD = 500;
/** Bảng chữ của mã sinh ngẫu nhiên: bỏ chữ dễ nhầm (0/O, 1/I/L). */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Một dòng giỏ gõ tay: SKU và số lượng. */
export interface TypedLine {
  sku: string;
  quantity: number;
}

/**
 * Đọc "CG26 × 1, KB4-XA × 2" (dấu ×, x hay *; cách nhau bằng dấu phẩy hay xuống dòng; thiếu số
 * lượng thì là 1). Dòng sai trả về nguyên văn trong `bad` để báo dưới ô.
 */
export function parseCartLines(text: string): { lines: TypedLine[]; bad: string[] } {
  const lines: TypedLine[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[,\n;]/)) {
    const part = raw.trim();
    if (!part) continue;
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]{0,63})\s*(?:[×x*]\s*(\d{1,4}))?$/i.exec(part);
    const quantity = match?.[2] ? Number(match[2]) : 1;
    if (!match?.[1] || quantity < 1) {
      bad.push(part);
      continue;
    }
    const sku = match[1].toUpperCase();
    const same = lines.find((l) => l.sku === sku);
    if (same) same.quantity += quantity;
    else lines.push({ sku, quantity });
  }
  return { lines, bad };
}

/** So mã như `code_key` của core: chữ hoa, bỏ mọi khoảng trắng. */
export function codeKey(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** Các mã người mua gõ (cách nhau bằng dấu phẩy, khoảng trắng hay xuống dòng), bỏ trùng. */
export function parseCodes(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n;\s]+/)) {
    const key = codeKey(raw);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * `value × bp / 10000`, làm tròn nửa xa số 0 về đơn vị nhỏ nhất (quy tắc `MidpointAwayFromZero` mà
 * đặc tả bước 43 khuyến nghị). Số nguyên, không qua số thực khi đủ nhỏ.
 */
export function applyBp(value: number, bp: number): number {
  const product = value * bp;
  const whole = Math.trunc(product / 10_000);
  const rest = product - whole * 10_000;
  if (Math.abs(rest) * 2 >= 10_000) return whole + Math.sign(product);
  return whole;
}

/** Basis point → chữ phần trăm: 1000 → "10", 1550 → "15.5" (dấu thập phân theo ngôn ngữ). */
export function bpPercent(bp: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100);
}

/** Đọc "10", "10%", "12,5" thành basis point; sai thì `null`. */
export function parsePercentBp(text: string): number | null {
  const clean = text.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null;
  const bp = Math.round(Number(clean) * 100);
  return bp > 0 && bp <= 10_000 ? bp : null;
}

/**
 * Chia `total` theo tỉ lệ `weights` (số nguyên), tổng các phần luôn đúng bằng `total` — như
 * `Money::allocate` của core: chia phần nguyên, phần dư cho phần có số lẻ lớn nhất trước.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || weights.length === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map((x) => Math.floor(x));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    rest -= 1;
  }
  return parts;
}

/** Giá thấp nhất được phép khi trần là `maxBp` trên giá ngay trước khuyến mại (làm tròn lên). */
export function lowestAllowed(reference: number, maxBp: number): number {
  return reference - Math.floor((reference * maxBp) / 10_000);
}

/** Phần trăm đã dùng (0–100) cho thanh "đã dùng"; không giới hạn thì 0. */
export function usedPercent(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Múi giờ của cửa hàng: chương trình nhập và hiện theo giờ Việt Nam (đặc tả 43, "Múi giờ"). */
export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Khung giờ ngắn theo giờ Việt Nam: "01/11 – 30/11", cùng ngày thì "15/11 20:00–22:00". */
export function vnRange(starts: string, ends: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: VN_TZ,
  });
  const hour = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: VN_TZ,
  });
  // Tiếng Việt viết ngày / tháng bằng "/" như bản thiết kế (Intl cho "01-11").
  const dm = (d: Date) => {
    if (!locale.startsWith("vi")) return day.format(d);
    const parts = day.formatToParts(d);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${pick("day")}/${pick("month")}`;
  };
  const s = new Date(starts);
  const e = new Date(ends);
  if (dm(s) === dm(e)) return `${dm(s)} ${hour.format(s)}–${hour.format(e)}`;
  return `${dm(s)} – ${dm(e)}`;
}

/** Ngày giờ đầy đủ theo giờ Việt Nam: "30/11/2026 23:59". */
export function vnDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

/** Ngày theo giờ Việt Nam: "30/11/2026". */
export function vnDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: VN_TZ,
  }).format(new Date(iso));
}

/** Giờ theo giờ Việt Nam: "15:40". */
export function vnTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: VN_TZ,
  }).format(new Date(iso));
}
