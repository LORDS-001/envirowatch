import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("signed-out visitors are sent to login with a return path", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login\?next=%2Foverview/);
});

test("wrong password says what happened", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("operator@envirowatch.test");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect");
});

test("overview goes live within the freshness budget and shows trusted values", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  // Live indicator turns on once the socket connects and events flow.
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^PM2\.5 is .+ across Lagos$/ })).toBeVisible();
  // The IDW surface always carries its flag and method caption.
  await expect(page.getByText("Estimated (IDW)")).toBeVisible();
  await expect(page.getByText(/Estimated by distance weighting \(IDW, p = 2\) from \d+ sensor sites/)).toBeVisible();
  // Devices online count reflects the silent sensor.
  await expect(page.getByText("Devices online")).toBeVisible();
  await expect(page.getByText(/\d+ not reporting/)).toBeVisible();
  // Device-health and environment alerts are both listed and labelled by kind.
  await expect(page.getByText("Sensor 014 · silent for 6 min")).toBeVisible();
  await expect(page.getByText("PM2.5 above 35 µg/m³ for 10 min · Apapa Port")).toBeVisible();
});

test("every chart can be read as a table", async ({ page }) => {
  await signIn(page);
  const card = page.getByRole("region", { name: "PM2.5 by hour" });
  await card.getByRole("button", { name: "View as table" }).click();
  await expect(card.getByRole("table")).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "Mean" })).toBeVisible();
});

test("operators don't see admin destinations and get a 403 page if they go there", async ({ page }) => {
  await signIn(page, "operator");
  await expect(page.getByRole("link", { name: "Simulator" })).toHaveCount(0);
  await page.goto("/simulator");
  await expect(page.getByRole("heading", { name: "You don’t have access to this page" })).toBeVisible();
});

// Each route with the heading that proves it rendered. A live socket never lets the network go idle.
const ROUTES: Array<{ path: string; ready: RegExp; who?: "admin" | "operator" }> = [
  { path: "/login", ready: /^Sign in$/ },
  { path: "/overview", ready: /^Overview$/, who: "operator" },
  { path: "/map", ready: /^Environmental map$/, who: "operator" },
  { path: "/analytics?device=sensor-512", ready: /^Historical analytics$/, who: "operator" },
  { path: "/alerts", ready: /^Alerts$/, who: "operator" },
  { path: "/health", ready: /^Sensor health$/, who: "operator" },
  { path: "/devices", ready: /^Devices$/, who: "admin" },
  { path: "/reports", ready: /^Reports$/, who: "operator" },
  { path: "/settings/alert-rules", ready: /^Settings$/, who: "admin" },
  { path: "/simulator", ready: /^Simulator$/, who: "admin" },
  { path: "/public", ready: /^Air is / },
  { path: "/public/map", ready: /^Map$/ },
  { path: "/does-not-exist", ready: /^This page doesn’t exist$/ },
];

for (const { path, ready, who } of ROUTES) {
  test(`no serious or critical axe violations on ${path}`, async ({ page }) => {
    test.slow(!!who, "signs in, waits for live data, then scans a large live page");
    if (who) await signIn(page, who);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: ready })).toBeVisible();
    await page.waitForTimeout(2000);
    let axe = new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      // Third-party map tiles are decorative images; Leaflet's controls and attribution are still checked.
      .exclude(".leaflet-tile-pane");
    // Site markers are 24 px but overlap where sites cluster. WCAG 2.5.8 exempts targets whose
    // function is available through an equivalent control: both maps list every site as a button.
    if (path.includes("map")) axe = axe.disableRules(["target-size"]);
    const results = await axe.analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  });
}
