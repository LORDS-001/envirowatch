/// <reference lib="dom" />
import { expect, test, type Locator, type Page } from "@playwright/test";

// Journeys 1 and 2 with the keyboard alone: no clicks, no fills, no page.goto after the first load.
// Every stop on the way must show a visible focus indicator (WCAG 2.4.7).
// RECORD=1 npx playwright test e2e/keyboard.spec.ts saves a video of each walkthrough.
test.use({ video: process.env.RECORD ? "on" : "off" });
// Live data streams the whole time and every Tab is checked, so these run long; one at a time.
test.describe.configure({ mode: "default", timeout: 600_000 });

interface Stop {
  name: string;
  visible: boolean;
}

/** Presses Tab (or Shift+Tab) until `target` has focus, recording each stop on the way. */
async function tabTo(page: Page, target: Locator, stops: Stop[], { back = false, max = 60 } = {}) {
  const handle = await target.elementHandle();
  if (!handle) throw new Error(`${target} isn't on the page`);
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    // One round trip per stop: the page is busy with live data, and every call costs.
    const { reached, stop } = await handle.evaluate(focusCheck);
    stops.push(stop);
    if (reached) return;
  }
  throw new Error(`Never reached ${target} in ${max} tab presses. Last stops: ${stops.slice(-12).map((s) => s.name).join(" | ")}`);
}

/** Whether `target` holds focus, and what the focused element is and whether it shows a ring. */
function focusCheck(target: Element): { reached: boolean; stop: Stop } {
  const el = document.activeElement as HTMLElement | null;
  const reached = !!el && (el === target || target.contains(el));
  if (!el || el === document.body) return { reached, stop: { name: "body", visible: true } };
  const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 60);
  // A ring may sit on the element, or on a wrapper that styles :focus-within / in-focus-visible.
  const ringed = (node: Element) => {
    const cs = getComputedStyle(node);
    return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
  };
  let visible = ringed(el);
  // A row-level ring sits within the first few descendants; don't style-check a whole table.
  if (!visible) visible = [...el.querySelectorAll("*")].slice(0, 40).some((d) => ringed(d));
  for (let p = el.parentElement, n = 0; !visible && p && n < 3; p = p.parentElement, n++) visible = ringed(p);
  return { reached, stop: { name, visible } };
}

async function signInWithKeyboard(page: Page, who: "admin" | "operator", stops: Stop[]) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await tabTo(page, page.getByLabel("Email"), stops);
  await page.keyboard.type(`${who}@envirowatch.test`);
  await tabTo(page, page.getByLabel("Password"), stops);
  await page.keyboard.type("envirowatch-demo");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/overview$/);
  // Like a person, wait for the page before moving on: Tab presses during a route load are lost.
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
}

const unringed = (stops: Stop[]) => stops.filter((s) => !s.visible).map((s) => s.name);

test("journey 1 by keyboard: register a sensor, see the key once, and open its page", async ({ page }) => {
  const stops: Stop[] = [];
  await signInWithKeyboard(page, "admin", stops);

  await tabTo(page, page.getByRole("link", { name: "Devices" }), stops);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Devices" })).toBeVisible();

  const register = page.getByRole("button", { name: "Register device" });
  await expect(register).toBeEnabled();
  await tabTo(page, register, stops);
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Register device" });
  await expect(dialog).toBeVisible();
  // Focus moved into the dialog on open.
  await expect(dialog.locator(":focus")).toHaveCount(1);
  const id = await dialog.getByLabel("Device ID").inputValue();
  const site = dialog.getByLabel("Site");
  await tabTo(page, site, stops);
  // Arrow through the options; type-ahead in a native select isn't reliable across browsers.
  await page.keyboard.press("Home");
  for (let i = 0; i < 60 && (await site.locator("option:checked").textContent()) !== "Yaba"; i++) await page.keyboard.press("ArrowDown");
  await expect(site.locator("option:checked")).toHaveText("Yaba");
  await tabTo(page, dialog.getByRole("button", { name: "Register device" }), stops);
  await page.keyboard.press("Enter");

  const keyDialog = page.getByRole("dialog", { name: `${id} registered` });
  await expect(keyDialog.getByLabel("Device key")).toHaveText(/^ewk_[0-9a-f]{48}$/);
  await tabTo(page, keyDialog.getByRole("button", { name: "I’ve stored the key" }), stops);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Device key")).toHaveCount(0);

  // Focus went back to Register device; the filter is just before it.
  await tabTo(page, page.getByLabel("Filter devices"), stops, { back: true });
  await page.keyboard.type(id);
  const grid = page.getByRole("grid", { name: "Devices" });
  await expect(grid.getByRole("row").filter({ hasText: id }).getByText("Online")).toBeVisible({ timeout: 45_000 });

  // The grid is one tab stop; Enter opens the active row.
  await tabTo(page, grid, stops);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: id })).toBeVisible();
  await expect(page.getByLabel("Device key")).toHaveCount(0);

  expect(unringed(stops)).toEqual([]);
});

test("journey 2 by keyboard: open a pollution alert, acknowledge it, and see it resolve", async ({ page }) => {
  const stops: Stop[] = [];
  await signInWithKeyboard(page, "operator", stops);

  // The nav link carries the unacknowledged count, e.g. "Alerts, 2 unacknowledged".
  await tabTo(page, page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Alerts/ }), stops);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Alerts" })).toBeVisible();

  const alertLink = page.getByRole("link", { name: /PM2\.5 above 35 µg\/m³ for 10 min · Apapa Port/ });
  await tabTo(page, alertLink, stops, { max: 80 });
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await tabTo(page, drawer.getByRole("button", { name: "Acknowledge alert" }), stops);
  await page.keyboard.press("Enter");
  await expect(drawer.getByText("Acknowledged", { exact: true }).first()).toBeVisible();
  await expect(drawer.getByText("Resolved", { exact: true }).first()).toBeVisible({ timeout: 40_000 });

  // Esc closes the drawer. The resolved alert has left the open list, so focus lands on the
  // main region rather than being dropped on <body>.
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("main#main")).toBeFocused();

  expect(unringed(stops)).toEqual([]);
});
