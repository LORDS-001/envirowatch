import { expect, test } from "@playwright/test";

const base = "http://127.0.0.1:8011/api/v1";

test("real auth, fleet, ingestion, public data, exports, invitations and simulator", async ({ page }) => {
  const errors: string[] = [];
  const frames: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource"))
      errors.push(message.text());
  });
  page.on("websocket", (socket) => socket.on("framereceived", (frame) => frames.push(String(frame.payload))));
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@real.envirowatch.test");
  await page.getByLabel("Password", { exact: true }).fill("integration-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/overview/);
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  const login = await page.request.post(`${base}/auth/login`, {
    data: { email: "admin@real.envirowatch.test", password: "integration-test-password" },
  });
  expect(login.ok()).toBeTruthy();
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` };
  const devices = await page.request.get(`${base}/devices?limit=500`, { headers });
  expect((await devices.json()).items).toHaveLength(55);
  await page.goto("/devices");
  await expect(page.getByRole("heading", { name: "Devices", exact: true })).toBeVisible();
  await expect(page.getByText("55", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Filter devices", { exact: true }).pressSequentially("e2e-sensor-054");
  await expect(page.getByLabel("Filter devices", { exact: true })).toHaveValue("e2e-sensor-054");
  await expect(
    page.getByRole("grid", { name: "Devices" }).getByRole("row").filter({ hasText: "e2e-sensor-054" }),
  ).toHaveCount(1);
  await page.getByLabel("Search devices and sites; press Enter").fill("e2e-sensor-000");
  await page.getByLabel("Search devices and sites; press Enter").press("Enter");
  await expect(page.getByLabel("Filter devices", { exact: true })).toHaveValue("e2e-sensor-000");
  const rotation = await page.request.post(`${base}/devices/e2e-sensor-000/rotate-key`, { headers });
  const key = (await rotation.json()).api_key;
  const reading = {
    reading_id: "browser-live-reading",
    timestamp: new Date().toISOString(),
    measurements: { pm25: 28 },
  };
  expect(
    (await page.request.post(`${base}/ingest`, { headers: { "X-API-Key": key }, data: reading })).status(),
  ).toBe(202);
  await expect
    .poll(async () => {
      const response = await page.request.get(`${base}/devices/e2e-sensor-000/ingestion-events`, { headers });
      return (await response.json()).items.some(
        (event: { reading_id: string }) => event.reading_id === reading.reading_id,
      );
    })
    .toBeTruthy();
  await expect
    .poll(() =>
      frames.some((frame) => frame.includes("measurement.updated") && frame.includes(reading.reading_id)),
    )
    .toBeTruthy();
  const burst = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      page.request.post(`${base}/ingest`, {
        headers: { "X-API-Key": key },
        data: { ...reading, reading_id: `burst-${index}`, timestamp: new Date().toISOString() },
      }),
    ),
  );
  expect(burst.every((response) => response.status() === 202)).toBeTruthy();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`${base}/devices/e2e-sensor-000/ingestion-events?limit=500`, { headers })
          ).json()
        ).items.length,
    )
    .toBeGreaterThanOrEqual(101);
  await page.request.post(`${base}/devices/e2e-sensor-000/rotate-key`, { headers });
  expect(
    (await page.request.post(`${base}/ingest`, { headers: { "X-API-Key": key }, data: reading })).status(),
  ).toBe(401);
  const summary = await page.request.get(`${base}/public/summary`);
  expect((await summary.json()).areas).toHaveLength(1);
  await page.goto("/public");
  await expect(page.getByRole("button", { name: /Test Lagos site/ }).first()).toBeVisible();
  const exportParams = new URLSearchParams({
    format: "pdf",
    metrics: "pm25",
    from: new Date(Date.now() - 3600000).toISOString(),
    to: new Date().toISOString(),
  });
  const pdf = await page.request.get(`${base}/reports/export?${exportParams}`, { headers });
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const email = "invited@real.envirowatch.test";
  const invitation = await page.request.post(`${base}/users`, { headers, data: { email, role: "operator" } });
  const token = (await invitation.json()).invitation_token;
  await page.goto(`/accept-invitation#${token}`);
  await page.getByLabel("New password", { exact: true }).fill("invited-test-password");
  await page.getByLabel("Confirm password", { exact: true }).fill("invited-test-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Password saved.", { exact: false })).toBeVisible();
  expect(
    (
      await page.request.post(`${base}/auth/login`, { data: { email, password: "invited-test-password" } })
    ).status(),
  ).toBe(200);
  const run = await page.request.post(`${base}/simulator/run`, {
    headers,
    data: { scenario: "baseline", seed: 42, speed: 120 },
  });
  expect(run.status()).toBe(201);
  await expect
    .poll(
      async () => (await (await page.request.get(`${base}/simulator/run`, { headers })).json()).run.elapsed_s,
    )
    .toBeGreaterThan(0);
  expect((await page.request.post(`${base}/simulator/run/pause`, { headers })).status()).toBe(200);
  expect((await page.request.post(`${base}/simulator/run/resume`, { headers })).status()).toBe(200);
  expect((await page.request.post(`${base}/simulator/run/stop`, { headers })).status()).toBe(200);
  expect((await page.request.post(`${base}/auth/logout`)).status()).toBe(204);
  expect((await page.request.post(`${base}/auth/refresh`)).status()).toBe(401);
  expect(errors).toEqual([]);
});
