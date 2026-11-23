import { project } from "./projection";

const site = { id: "one", organization_id: "test", name: "Site", latitude: 6.5, longitude: 3.4 };

it("centers a single site without dividing by zero", () => {
  const projection = project([site], 400, 200)!;
  const [horizontal, vertical] = projection.toXY(site.latitude, site.longitude);
  expect(horizontal).toBeCloseTo(200);
  expect(vertical).toBeCloseTo(100);
  expect(projection.bounds.every(Number.isFinite)).toBe(true);
});

it("handles co-located sensors and very small map boxes", () => {
  const projection = project([site, { ...site, id: "two" }], 20, 20)!;
  expect(projection.toXY(site.latitude, site.longitude).every(Number.isFinite)).toBe(true);
  expect(project([], 200, 200)).toBeNull();
});
