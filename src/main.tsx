import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "@/design/global.css";
import { config } from "@/lib/config";
import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";

async function boot() {
  if (config.useMocks) {
    const { startMocks } = await import("@/mocks/browser");
    await startMocks();
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void boot();
