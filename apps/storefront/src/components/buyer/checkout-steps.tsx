import { useTranslations } from "next-intl";

export type StepKey = "cart" | "delivery" | "payment" | "done";
const STEPS: readonly StepKey[] = ["cart", "delivery", "payment", "done"];

/** Các bước đặt hàng (bản thiết kế `Checkout`): bước đã qua có dấu ✓, bước hiện tại `aria-current`. */
export function CheckoutSteps({ current }: { current: StepKey }) {
  const t = useTranslations("checkout.steps");
  const index = STEPS.indexOf(current);
  return (
    <ol className="steps by-steps" aria-label={t("label")}>
      {STEPS.map((step, i) => (
        <li
          key={step}
          className={[i === index ? "cur" : "", i < index ? "done" : ""].filter(Boolean).join(" ")}
          aria-current={i === index ? "step" : undefined}
        >
          {/* Không `aria-hidden`: luật của `shop.css` cho `span[aria-hidden]` là đường nối giữa các bước. */}
          <span className="by-step-n">{i < index ? "✓" : i + 1}</span>
          <span className="st-lab">{t(step)}</span>
          {i < index ? <span className="sr-only">{t("doneMark")}</span> : null}
          {i < STEPS.length - 1 ? <span className="by-step-sep" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}
