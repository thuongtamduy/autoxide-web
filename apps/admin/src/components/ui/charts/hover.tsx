"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

/** Một chuỗi trong tooltip: chữ đã định dạng sẵn theo ngôn ngữ ở máy chủ. */
export interface HoverSeries {
  label: string;
  /** Màu của nét (biến CSS), chỉ tô vạch khoá cạnh chữ; chữ luôn màu chữ. */
  color: string;
  dashed: boolean;
  texts: readonly string[];
  /** Vị trí dọc theo % của chấm tại từng mốc; `null` thì không vẽ chấm (biểu đồ cột). */
  ys: readonly number[] | null;
}

/**
 * Lớp rê chuột / bàn phím đặt trên vùng vẽ: vạch dọc bắt mốc gần nhất (đường) hoặc làm sáng cột (cột),
 * tooltip liệt kê mọi chuỗi tại mốc đó. Chỉ là tăng cường: mọi số đã có ở bảng "Xem số liệu".
 */
export function ChartHover({
  positions,
  heads,
  series,
  mode,
  hint,
}: {
  /** Vị trí ngang theo % của từng mốc. */
  positions: readonly number[];
  heads: readonly string[];
  series: readonly HoverSeries[];
  mode: "line" | "band";
  /** Nhãn cho người dùng bàn phím ("Dùng phím mũi tên để xem từng ngày"). */
  hint: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const n = positions.length;
  if (n === 0) return null;

  const nearest = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    let best = 0;
    positions.forEach((p, i) => {
      if (Math.abs(p - pct) < Math.abs((positions[best] ?? 0) - pct)) best = i;
    });
    setIndex(best);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key === "Home") setIndex(0);
    else if (event.key === "End") setIndex(n - 1);
    else if (event.key === "Escape") setIndex(null);
    else if (step[event.key] !== undefined) {
      setIndex((i) => Math.max(0, Math.min(n - 1, (i ?? n - 1) + (step[event.key] ?? 0))));
    } else return;
    event.preventDefault();
  };

  const at = index === null ? null : (positions[index] ?? 0);
  const band = mode === "band" ? 100 / n : 0;
  const shown = index ?? n - 1;
  // Với trình đọc màn hình lớp này là một thanh trượt qua các mốc: đọc mốc và mọi chuỗi tại mốc đó.
  const valueText = [heads[shown], ...series.map((s) => `${s.label} ${s.texts[shown] ?? ""}`)].join(
    "; ",
  );
  return (
    <div
      ref={box}
      className="chart-hover"
      role="slider"
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={shown + 1}
      aria-valuetext={valueText}
      onPointerMove={nearest}
      onPointerLeave={() => setIndex(null)}
      onFocus={() => setIndex((i) => i ?? n - 1)}
      onBlur={() => setIndex(null)}
      onKeyDown={onKey}
      tabIndex={0}
      aria-label={hint}
    >
      {at !== null && index !== null ? (
        <>
          {mode === "line" ? (
            <span className="chart-cross" style={{ left: `${at}%` }} />
          ) : (
            <span className="chart-band" style={{ left: `${at - band / 2}%`, width: `${band}%` }} />
          )}
          {series.map((s) =>
            s.ys ? (
              <span
                key={s.label}
                className="chart-dot"
                style={{ left: `${at}%`, top: `${s.ys[index] ?? 100}%`, background: s.color }}
              />
            ) : null,
          )}
          <div
            className={at > 60 ? "chart-tip left" : "chart-tip"}
            style={{ left: `${at}%` }}
            aria-hidden="true"
          >
            <span className="chart-tip-head">{heads[index]}</span>
            {series.map((s) => (
              <span key={s.label} className="chart-tip-row">
                <span
                  className={s.dashed ? "chart-key dashed" : "chart-key"}
                  style={{ borderColor: s.color, color: s.color }}
                />
                <b className="num">{s.texts[index]}</b>
                <span className="chart-tip-label">{s.label}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
