import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";

/** Render trong provider của next-intl, như trang thật. */
export function renderIntl(ui: ReactNode, locale: "en" | "vi" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : vi}>
      {ui}
    </NextIntlClientProvider>,
  );
}
