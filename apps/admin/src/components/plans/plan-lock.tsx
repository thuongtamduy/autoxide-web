import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { lacksFeature } from "@/lib/plans-server";

// Nhãn "Cần gói cao hơn" (bước 35 của core): gói của khách không có tính năng `feature` (theo
// `GET /plans/entitlements`). Bấm vào mở tab Gói và thuê bao. Không có gì khi gói đã có tính năng,
// khi khách không bị gói giới hạn, hay khi bản cài không có module `plans`.
export async function PlanLock({ feature }: { feature: string }) {
  if (!(await lacksFeature(feature))) return null;
  const t = await getTranslations("planLock");
  return (
    <Link
      href="/settings/plan"
      className="badge b-info"
      title={t("hint")}
      data-testid={`plan-lock-${feature}`}
    >
      {t("badge")}
    </Link>
  );
}
