"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { chooseStore } from "@/sample/actions";
import { Icon } from "../icon";

export interface StoreCardData {
  code: string;
  name: string;
  address: string;
  hours: string;
  pickup: string | null;
}

/** "Hệ thống cửa hàng": thẻ cửa hàng, chọn được làm cửa hàng của bạn (mẫu, cookie). */
export function StoreCards({ stores, current }: { stores: StoreCardData[]; current: string }) {
  const t = useTranslations("home.stores");
  const [pending, start] = useTransition();
  return (
    <div className="g3 store-grid">
      {stores.map((store) => {
        const on = store.code === current;
        return (
          <div className={`card store-card${on ? " on" : ""}`} key={store.code}>
            <span className="store-head">
              <span className="dsp store-name">{store.name}</span>
              {on ? <span className="badge b-brand">{t("yours")}</span> : null}
            </span>
            <span className="store-lines">
              <span>
                <Icon name="map_pin" small />
                {store.address}
              </span>
              <span>
                <Icon name="clock" small />
                {t("opens", { hours: store.hours })}
              </span>
              {store.pickup ? (
                <span>
                  <Icon name="bag" small />
                  {store.pickup}
                </span>
              ) : null}
            </span>
            {on ? null : (
              <button
                type="button"
                className="btn sm"
                disabled={pending}
                onClick={() => start(() => chooseStore(store.code))}
              >
                {t("choose")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
