import type { ReactNode } from "react";

export type BadgeTone = "ok" | "warn" | "bad" | "brand" | "sale" | "plain";

/** Nhãn tròn nhỏ của bản thiết kế (`.badge.b-*`). */
export function Badge({ tone = "plain", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge b-${tone}`}>{children}</span>;
}

/** Tông của nhãn menu (`PublicMenuBadge.tone`: sale, brand, new, neutral) → tông của `Badge`. */
export function menuBadgeTone(tone: string): BadgeTone {
  if (tone === "sale") return "sale";
  if (tone === "brand" || tone === "new") return "brand";
  return "plain";
}
