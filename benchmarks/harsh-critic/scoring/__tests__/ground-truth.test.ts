import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { validateSharedGroundTruth } from "../../../shared/scorer.ts";
import { requiredKeywordMatchesForTest } from "../scorer.ts";

const BENCHMARK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GROUND_TRUTH_DIR = join(BENCHMARK_DIR, "ground-truth");
const FIXTURES_DIR = join(BENCHMARK_DIR, "fixtures");

const files = readdirSync(GROUND_TRUTH_DIR).filter((f) => f.endsWith(".json"));

/**
 * The ground truth is this benchmark's answer key. A malformed or drifted key
 * silently produces wrong scores rather than an error, so it is validated here
 * instead of at run time.
 */
describe("ground truth", () => {
  it("has at least one fixture", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s validates against the harness schema", (file) => {
    const raw = JSON.parse(readFileSync(join(GROUND_TRUTH_DIR, file), "utf-8"));
    const validated = validateSharedGroundTruth(raw);
    expect(validated.fixtureId).toBe(file.replace(/\.json$/, ""));
  });

  it.each(files)("%s points at a fixture that exists", (file) => {
    const raw = JSON.parse(readFileSync(join(GROUND_TRUTH_DIR, file), "utf-8"));
    const content = readFileSync(join(BENCHMARK_DIR, raw.fixturePath), "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("has a fixture file for every ground-truth entry and vice versa", () => {
    const fixtureIds = readdirSync(join(FIXTURES_DIR, "plans"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    const groundTruthIds = files.map((f) => f.replace(/\.json$/, "")).sort();
    expect(groundTruthIds).toEqual(fixtureIds);
  });

  it("keeps every keyword set matchable under the proportional threshold", () => {
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(GROUND_TRUTH_DIR, file), "utf-8"));
      for (const finding of raw.findings) {
        const required = requiredKeywordMatchesForTest(finding.keywords);
        // A finding needing more matches than it has keywords can never match.
        expect(required).toBeLessThanOrEqual(finding.keywords.length);
        expect(finding.keywords.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("marks exactly one clean baseline, and it carries no findings", () => {
    const baselines = files
      .map((f) => JSON.parse(readFileSync(join(GROUND_TRUTH_DIR, f), "utf-8")))
      .filter((gt) => gt.isCleanBaseline);
    expect(baselines).toHaveLength(1);
    expect(baselines[0].findings).toHaveLength(0);
  });

  it("preserves per-technique attribution and precision traps from expected/", () => {
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(GROUND_TRUTH_DIR, file), "utf-8"));
      expect(Array.isArray(raw["x-falsePositiveTraps"])).toBe(true);
      for (const finding of raw.findings) {
        expect(finding.targetTechnique).toMatch(/^T\d$/);
      }
    }
  });
});
