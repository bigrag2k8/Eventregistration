import { describe, it, expect } from "vitest";
import { platformFeeCents, seriesDropInFeeCents } from "@/lib/connect";

/**
 * Series drop-in fee policy: 5% of the sale, $1.25 minimum, but the minimum is
 * capped at 10% of the ticket for series occurrences — cheap class tickets
 * never pay an effective rate above 10%.
 */
describe("seriesDropInFeeCents", () => {
  it("free ticket → no fee", () => {
    expect(seriesDropInFeeCents(0)).toBe(0);
  });

  it("$5 class: min $1.25 capped at 10% → $0.50", () => {
    expect(platformFeeCents(500)).toBe(125); // one-off event keeps the plain min
    expect(seriesDropInFeeCents(500)).toBe(50);
  });

  it("$10 class: capped at 10% → $1.00", () => {
    expect(seriesDropInFeeCents(1000)).toBe(100);
  });

  it("$12.50 is the crossover: min = 10% = $1.25", () => {
    expect(seriesDropInFeeCents(1250)).toBe(125);
  });

  it("$20 ticket: min $1.25 < 10% cap → plain minimum applies", () => {
    expect(seriesDropInFeeCents(2000)).toBe(125);
  });

  it("$50 ticket: 5% ($2.50) exceeds the minimum → plain 5%", () => {
    expect(seriesDropInFeeCents(5000)).toBe(250);
    expect(seriesDropInFeeCents(5000)).toBe(platformFeeCents(5000));
  });

  it("never returns zero on a paid ticket", () => {
    expect(seriesDropInFeeCents(1)).toBeGreaterThan(0);
  });
});
