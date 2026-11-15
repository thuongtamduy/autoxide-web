// Biểu tượng nét (24 × 24) và hình minh hoạ sản phẩm của bản thiết kế. Không dùng thư viện biểu
// tượng: vài chục đường SVG là đủ, và tên ở đây phủ đúng bộ biểu tượng cố định mà module `menus`
// của core cho phép (`PublicSiteMenuItem.icon`).

/** Biểu tượng giao diện. Tên trong `MENU_ICONS` là bộ của core; các tên khác chỉ giao diện dùng. */
export const ICONS = {
  // Bộ biểu tượng của menu (core, `modules/menus/src/items.rs`).
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  bolt: "M13 3 5 13h6l-1 8 8-10h-6z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  cart: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  category: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  chat: "M4 5h16v11H9l-5 4z",
  fire: "M12 21c-4 0-7-2.7-7-6.5 0-3.4 2.6-5.6 4-8.5.6 2 1.8 3 3 3.5C12 7 13 5 12.5 3 16 5 19 9.3 19 14.5 19 18.3 16 21 12 21z",
  gift: "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.4v.6M12 16.8h.01",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  map_pin:
    "M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  news: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3",
  percent:
    "M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  phone: "M8 3h8v18H8zM11 18h2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.6-3.6",
  shop: "M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11zM5 13v7h14v-7M10 20v-4h4v4",
  sparkles: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  store:
    "M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11zM5 13v7h14v-7M10 20v-4h4v4",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  truck:
    "M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  // Chỉ giao diện dùng.
  leaf: "M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l7-7",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  down: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  ret: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  rss: "M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14M6 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  // Trang đặt hàng, tài khoản, gian hàng (W-030).
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2",
  cash: "M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6 10v4M18 10v4",
  minus: "M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  pin: "M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  key: "M14 10a4 4 0 1 0-3.5 4L9 15.5V18H6.5v2H4v-2.5L10.5 11A4 4 0 0 0 14 10zM15 7h.01",
  flag: "M5 21V4h11l-2 4 2 4H5",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
} as const;

export type IconName = keyof typeof ICONS;

/** Bộ biểu tượng cố định của menu trong core. */
export const MENU_ICONS = [
  "bag",
  "bolt",
  "book",
  "calendar",
  "cart",
  "category",
  "chat",
  "fire",
  "gift",
  "grid",
  "heart",
  "help",
  "home",
  "info",
  "mail",
  "map_pin",
  "news",
  "percent",
  "phone",
  "search",
  "shop",
  "sparkles",
  "star",
  "store",
  "tag",
  "truck",
  "user",
] as const satisfies readonly IconName[];

export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && Object.hasOwn(ICONS, value);
}

/** Hình minh hoạ đứng thay ảnh sản phẩm thật (bản thiết kế dùng hình nét, không dùng ảnh ngoài). */
export const ART = {
  pan: "M10 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11h6",
  pot: "M5 9h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 9h18M9 6h6M12 4v2",
  knife: "M3 20 14 9l2 2L6 21zM14 9l5-6 1 1-4 7",
  board: "M3 7h13a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H3zM19 12h2.5M6 10v4",
  glass: "M4 9h16v10H4zM3 6h18v3H3zM8 13h8",
  bowl: "M3 11h18a9 7 0 0 1-18 0zM9 20h6M8 14h8",
  dutch: "M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 12h2M20 12h2M7 7h10M12 5v2",
  spoon: "M8 3a3 4 0 1 1 0 8 3 4 0 0 1 0-8zM8 11v10M16 3v18M14 3v5a2 2 0 0 0 4 0V3",
  towel: "M6 3h12v18H6zM6 8h12M6 16h12",
  basket: "M3 10h18l-2 10H5zM7 10l3-6M17 10l-3-6M9 14v3M15 14v3",
  clay: "M6 8h12l1 8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM4 8h16M10 5h4",
  bottle: "M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3zM8 13h8",
  jar: "M7 7h10v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM8 3h8v4H8zM7 12h10",
} as const;

export type ArtName = keyof typeof ART;
export const ART_NAMES = Object.keys(ART) as ArtName[];

/** Năm nền nhạt của ô minh hoạ (`.t1`…`.t5` trong CSS). */
export type Tone = "t1" | "t2" | "t3" | "t4" | "t5";
export const TONES: readonly Tone[] = ["t1", "t2", "t3", "t4", "t5"];

/** Biểu tượng nét, luôn `aria-hidden` (chữ bên cạnh hay `aria-label` của nút nói nghĩa). */
export function Icon({
  name,
  small = false,
  className,
}: {
  name: IconName;
  small?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={["ic", small ? "s" : "", className ?? ""].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Hình minh hoạ trong ô `.thumb`. */
export function Art({ name }: { name: ArtName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ART[name]} />
    </svg>
  );
}
