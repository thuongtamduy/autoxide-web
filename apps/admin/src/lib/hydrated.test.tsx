// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useHydrated } from "./hydrated";

function Probe() {
  return <span>{useHydrated() ? "ready" : "server"}</span>;
}

describe("useHydrated", () => {
  it("máy chủ dựng bản chưa sẵn sàng", () => {
    expect(renderToString(<Probe />)).toContain("server");
  });

  it("trên trình duyệt thì sẵn sàng", () => {
    render(<Probe />);
    expect(screen.getByText("ready")).toBeTruthy();
  });
});
