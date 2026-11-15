// Bộ biểu tượng nét (24 × 24, viền 1,75) dùng chung cho khung quản trị, theo bản thiết kế.
// Mỗi biểu tượng là một chuỗi path SVG; thêm biểu tượng mới thì thêm một dòng vào ICONS.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  cart: "M3 4h2.5l2.2 11h10.6l2-8H6.3M9 20h.01M17 20h.01",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  mega: "M3 10v4h3l7 4V6L6 10zM16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11",
  posts: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  users:
    "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1.5a4 4 0 0 0-3-3.85M16 3.6a3.5 3.5 0 0 1 0 6.8",
  store:
    "M4 9l1.5-5h13L20 9M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11zM5 13v7h14v-7M10 20v-4h4v4",
  wallet: "M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11v3M16 13.5h.01",
  chart: "M5 20V11M11 20V5M17 20v-6M3 20h18",
  org: "M9 3h6v5H9zM4 16h6v5H4zM14 16h6v5h-6zM12 8v4M7 16v-4h10v4",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.6-3.6",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  x: "M6 6l12 12M18 6L6 18",
  right: "M9 6l6 6-6 6",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  task: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11",
  collapse: "M11 17l-5-5 5-5M18 17l-5-5 5-5",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  key: "M14 10a4 4 0 1 0-3.5 4L9 15.5V18H6.5v2H4v-2.5L10.5 11A4 4 0 0 0 14 10zM15 7h.01",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  down: "M12 4v12M7 11l5 5 5-5M4 20h16",
  warn: "M12 3l9.5 17h-19zM12 10v4M12 17h.01",
  plus: "M12 5v14M5 12h14",
  // Nội dung: thư viện media, cấu trúc, menu (hình theo bản thiết kế).
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M9 9h.01",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  video: "M4 6h12v12H4zM16 10l5-3v10l-5-3",
  audio: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  swap: "M7 7h13l-4-4M17 17H4l4 4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  chev: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  indent: "M4 6h16M11 12h9M11 18h9M4 10l4 3-4 3",
  outdent: "M4 6h16M11 12h9M11 18h9M8 10l-4 3 4 3",
  menu: "M4 6h16M4 12h16M4 18h16",
  page: "M4 4h16v16H4zM4 9h16M9 9v11",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.6h.01",
  pan: "M10 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11h6",
  pot: "M5 9h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 9h18M9 6h6M12 4v2",
  knife: "M3 20 14 9l2 2L6 21zM14 9l5-6 1 1-4 7",
  glass: "M4 9h16v10H4zM3 6h18v3H3zM8 13h8",
  bowl: "M3 11h18a9 7 0 0 1-18 0zM9 20h6M8 14h8",
  towel: "M6 3h12v18H6zM6 8h12M6 16h12",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7",
  gift: "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1zM12 7c1.5-3 5-3 5-1s-3 1-5 1z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, small = false }: { name: IconName; small?: boolean }) {
  return (
    <svg className={small ? "ic s" : "ic"} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
