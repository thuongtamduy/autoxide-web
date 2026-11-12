import { describe, expect, it } from "vitest";
import { splitDuration } from "./duration";

describe("splitDuration", () => {
  it.each([
    [86_400, { unit: "days", count: 1 }],
    [172_800, { unit: "days", count: 2 }],
    [3_600, { unit: "hours", count: 1 }],
    [5_400, { unit: "minutes", count: 90 }],
    [90, { unit: "seconds", count: 90 }],
    [0, { unit: "seconds", count: 0 }],
  ])("%d giây → %j", (seconds, expected) => {
    expect(splitDuration(seconds)).toEqual(expected);
  });
});
