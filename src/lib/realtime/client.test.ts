// @vitest-environment node
import { backoffDelay } from "./client";

describe("backoffDelay", () => {
  it("grows exponentially and caps at 30 s, with ±30 % jitter", () => {
    const mid = () => 0.5; // jitter factor 1.0
    expect(backoffDelay(0, mid)).toBe(1000);
    expect(backoffDelay(3, mid)).toBe(8000);
    expect(backoffDelay(10, mid)).toBe(30000);
    expect(backoffDelay(0, () => 0)).toBe(700);
    expect(backoffDelay(0, () => 0.999999)).toBe(1300);
  });
});
