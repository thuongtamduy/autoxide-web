import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return <MessagePanel title={t("notFoundTitle")} message={t("notFound")} />;
}
