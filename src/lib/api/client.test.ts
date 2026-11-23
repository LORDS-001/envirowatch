import { z } from "zod";
import { ApiError, configureApiClient, request, requestBlob } from "./client";

describe("session recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    configureApiClient({ getToken: () => null, onUnauthorized: () => {} });
  });

  it("refreshes once and retries with the new access token", async () => {
    let token = "old-token";
    const expire = vi.fn();
    const refresh = vi.fn(async () => {
      token = "new-token";
      return true;
    });
    configureApiClient({ getToken: () => token, onUnauthorized: expire, refreshSession: refresh });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    await expect(request("/test", { schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe("Bearer new-token");
    expect(expire).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not loop when the refreshed token is also refused", async () => {
    const refresh = vi.fn(async () => true);
    const expire = vi.fn();
    configureApiClient({ getToken: () => "token", onUnauthorized: expire, refreshSession: refresh });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(request("/test", { schema: z.unknown() })).rejects.toBeInstanceOf(ApiError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("recovers file downloads using the same session policy", async () => {
    configureApiClient({
      getToken: () => "token",
      onUnauthorized: vi.fn(),
      refreshSession: async () => true,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(
          new Response("csv", { headers: { "Content-Disposition": 'attachment; filename="report.csv"' } }),
        ),
    );
    expect((await requestBlob("/test")).filename).toBe("report.csv");
  });
});
