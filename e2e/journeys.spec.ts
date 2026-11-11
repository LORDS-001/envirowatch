import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Each test gets a fresh browser context, so the mock backend starts from its seeded state.

test("journey 1: admin registers a sensor, sees the key once, and it comes online", async ({ page }) => {
  test.slow();
  await signIn(page, "admin");
  await page.goto("/devices");
  await page.getByRole("button", { name: "Register device" }).click();
  const dialog = page.getByRole("dialog", { name: "Register device" });
  const id = await dialog.getByLabel("Device ID").inputValue();
  await dialog.getByLabel("Site").selectOption({ label: "Yaba" });
  await dialog.getByRole("button", { name: "Register device" }).click();

  const keyDialog = page.getByRole("dialog", { name: `${id} registered` });
  await expect(keyDialog.getByText("Copy this key now.", { exact: false })).toBeVisible();
  await expect(keyDialog.getByLabel("Device key")).toHaveText(/^ewk_[0-9a-f]{48}$/);
  await keyDialog.getByRole("button", { name: "I’ve stored the key" }).click();
  await expect(page.getByLabel("Device key")).toHaveCount(0);

  // The simulator submits its first reading; live data marks it online.
  await page.getByLabel("Filter devices").fill(id);
  const row = page.getByRole("row").filter({ hasText: id });
  await expect(row.getByText("Online")).toBeVisible({ timeout: 45_000 });

  // The key is never shown again, not even on the device page.
  await row.getByRole("link", { name: id }).click();
  await expect(page.getByRole("heading", { level: 1, name: id })).toBeVisible();
  await expect(page.getByLabel("Device key")).toHaveCount(0);
});

test("journey 2: operator opens a pollution alert, checks context, acknowledges, and it resolves", async ({ page }) => {
  test.slow();
  await signIn(page, "operator");
  await page.goto("/alerts");
  await page.getByRole("link", { name: /PM2\.5 above 35 µg\/m³ for 10 min · Apapa Port/ }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Sensors at this site" })).toBeVisible();
  await expect(drawer.getByText("Notified by Webhook")).toBeVisible();
  await expect(drawer.getByText("Failed", { exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Acknowledge alert" }).click();
  await expect(page.getByText("Alert acknowledged").first()).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Acknowledge alert" })).toHaveCount(0);
  await expect(drawer.getByText("Acknowledged", { exact: true }).first()).toBeVisible();

  // Recovery: the condition clears and the alert resolves on its own.
  await expect(drawer.getByText("Resolved", { exact: true }).first()).toBeVisible({ timeout: 40_000 });
});

test("journey 3: a public visitor reads approved readings and the map without signing in", async ({ page }) => {
  await page.goto("/public");
  await expect(page.getByRole("heading", { level: 1, name: /^Air is .+ in Yaba/ })).toBeVisible();
  await page.getByLabel("Your area").selectOption({ label: "Apapa Port" });
  await expect(page.getByRole("heading", { level: 1, name: /in Apapa Port/ })).toBeVisible();

  await page.getByRole("link", { name: "Map", exact: true }).click();
  await expect(page).toHaveURL(/\/public\/map$/);
  await page.getByRole("radio", { name: "Temperature" }).click();
  await expect(page.getByLabel("Temperature scale in °C")).toBeVisible();
  await expect(page.getByText(/Estimated by distance weighting \(IDW, p = 2\)/)).toBeVisible();
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
});

test("journey 4: a fault-injection run reports detected, missed and false alerts with recall and precision", async ({ page }) => {
  test.slow();
  await signIn(page, "admin");
  await page.goto("/simulator");
  await page.getByLabel(/One-hour fault injection/).check();
  await page.getByRole("radio", { name: "360×" }).click();
  await page.getByRole("button", { name: "Start run" }).click();
  await expect(page.getByText("Running", { exact: true })).toBeVisible();
  // 3,600 simulated seconds at 360× take 10 s.
  await expect(page.getByText("Completed", { exact: true })).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/TP \/ \(TP \+ FN\) = \d+ \/ \d+/)).toBeVisible();
  // Detectors aren't perfect: some faults are missed and some alerts are false.
  const recall = (await page.getByText(/TP \/ \(TP \+ FN\) = \d+ \/ \d+/).textContent())!.match(/= (\d+) \/ (\d+)/)!;
  const precision = (await page.getByText(/TP \/ \(TP \+ FP\) = \d+ \/ \d+/).textContent())!.match(/= (\d+) \/ (\d+)/)!;
  expect(Number(recall[1])).toBeGreaterThan(0);
  expect(Number(recall[2])).toBeGreaterThan(Number(recall[1]));
  expect(Number(precision[2])).toBeGreaterThan(Number(precision[1]));
  const table = page.getByRole("grid", { name: "Ground truth against detections" });
  await expect(table.getByText("Detected").first()).toBeVisible();
});

test("journey 5: another organization's devices are refused, and the page says so", async ({ page }) => {
  await signIn(page, "operator");
  await page.goto("/devices?organization_id=org-ibadan");
  await expect(page.getByText("Couldn’t load devices")).toBeVisible();
  await expect(page.getByText("You don't have access to this. Ask an administrator")).toBeVisible();
});
