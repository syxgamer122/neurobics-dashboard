/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { parseTelemetry } from "../supabase/functions/_shared/scoring/schema.ts";
import {
  clamp01,
  assertFiniteScore,
  finite,
} from "../supabase/functions/_shared/scoring/core.ts";

describe("Fuzz Math Bounds", () => {
  it("clamp01 should never return NaN", () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it("assertFiniteScore should throw on NaN or Infinity", () => {
    expect(() => assertFiniteScore("test", NaN)).toThrow();
    expect(() => assertFiniteScore("test", Infinity)).toThrow();
    expect(() => assertFiniteScore("test", -Infinity)).toThrow();
    expect(() => assertFiniteScore("test", -1)).toThrow();
    expect(() => assertFiniteScore("test", 1001)).toThrow();
    expect(assertFiniteScore("test", 500)).toBe(500);
  });

  it("finite should behave same as assertFiniteScore", () => {
    expect(() => finite(NaN, "test")).toThrow();
    expect(() => finite(Infinity, "test")).toThrow();
  });
});
