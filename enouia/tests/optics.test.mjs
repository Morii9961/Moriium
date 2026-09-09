import test from "node:test";
import assert from "node:assert/strict";
import { refract, intersect, traceRay } from "../src/scripts/optics.ts";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("normal incidence preserves direction across the interface", () => {
  const ray = refract({ x: 1, y: 0 }, { x: -1, y: 0 }, 1 / 1.5);
  near(ray.x, 1);
  near(ray.y, 0);
});
test("the tangential component follows the index ratio and stays normalized", () => {
  const ray = refract({ x: Math.sqrt(0.75), y: 0.5 }, { x: -1, y: 0 }, 1 / 1.5);
  near(ray.y, 0.5 / 1.5);
  near(Math.hypot(ray.x, ray.y), 1);
});
test("total internal reflection does not produce an invalid direction", () => {
  assert.equal(
    refract({ x: 0.5, y: Math.sqrt(0.75) }, { x: 1, y: 0 }, 1.5),
    null,
  );
});
test("a ray traveling away from the prism has no intersection", () => {
  assert.equal(intersect({ x: 0, y: 300 }, { x: -1, y: 0 }), null);
});
test("every UI angle and sampled wavelength produces a finite exiting path", () => {
  for (let angle = -35; angle <= 35; angle++) {
    for (const wavelength of [0, 0.25, 0.5, 0.75, 1]) {
      const ray = traceRay(angle, wavelength);
      assert.ok(ray.outgoing, `No outgoing ray at ${angle}, ${wavelength}`);
      assert.ok(ray.points.length >= 4);
      assert.ok(
        ray.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      );
    }
  }
});
test("the two ends of the spectrum separate after leaving the glass", () => {
  const blue = traceRay(-12, 0).points.at(-1);
  const red = traceRay(-12, 1).points.at(-1);
  assert.ok(Math.hypot(blue.x - red.x, blue.y - red.y) > 10);
});
