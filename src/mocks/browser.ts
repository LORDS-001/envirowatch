import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { liveHandler } from "./live";

export async function startMocks() {
  const worker = setupWorker(...handlers, liveHandler);
  // Fonts, assets and map tiles pass straight through to the network.
  await worker.start({ quiet: true, onUnhandledFrame: "bypass" });
}
