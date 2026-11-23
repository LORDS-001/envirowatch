import { api } from "./endpoints";
import { ContractError } from "./client";

const device = (id: string) => ({
  id,
  site_id: "site-yaba",
  type: "sensor",
  status: "active",
  last_seen_at: null,
  metrics: ["pm25"],
});

describe("paginated resource endpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads all device pages instead of silently keeping the first page", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [device("sensor-1")], next_cursor: "sensor-1" }))
      .mockResolvedValueOnce(Response.json({ items: [device("sensor-2")], next_cursor: null }));
    vi.stubGlobal("fetch", fetcher);
    const result = await api.devices();
    expect(result.items.map((item) => item.id)).toEqual(["sensor-1", "sensor-2"]);
    expect(new URL(fetcher.mock.calls[1]![0] as string).searchParams.get("cursor")).toBe("sensor-1");
  });

  it("refuses pagination loops rather than returning an incomplete fleet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(Response.json({ items: [], next_cursor: "same" }))),
    );
    await expect(api.devices()).rejects.toBeInstanceOf(ContractError);
  });

  it("forwards cancellation to every page", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [], next_cursor: null }));
    vi.stubGlobal("fetch", fetcher);
    await api.devices({}, controller.signal);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ signal: controller.signal });
  });
});
