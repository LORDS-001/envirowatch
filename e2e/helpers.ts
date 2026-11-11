import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, who: "admin" | "operator" = "operator") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${who}@envirowatch.test`);
  await page.getByLabel("Password").fill("envirowatch-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
