import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findNearby,
  getFind,
  getUnknown,
  poll,
  sendApproval,
  sendUnknown,
  serverBase,
} from "../api";

const ALLOWED = new Set(["ndc11", "zip", "crop_url", "decision"]);
const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { origin: "http://test" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, init: init as RequestInit };
};

describe("REST client", () => {
  it("findNearby posts ndc11 + zip", async () => {
    fetchMock.mockResolvedValue(ok({ find_id: "f_1" }));
    expect(await findNearby("50580044902", "30332")).toEqual({
      find_id: "f_1",
    });
    const { url, init } = lastCall();
    expect(url).toBe(`${serverBase()}/api/find`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ ndc11: "50580044902", zip: "30332" });
  });
  it("sendUnknown / sendApproval bodies", async () => {
    fetchMock.mockResolvedValue(ok({ job_id: "u_1" }));
    await sendUnknown("/media/c_1.jpg");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      crop_url: "/media/c_1.jpg",
    });
    expect(lastCall().url).toBe(`${serverBase()}/api/unknown`);
    await sendApproval("f_1", "approve");
    expect(lastCall().url).toBe(`${serverBase()}/api/approvals/f_1`);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      decision: "approve",
    });
  });
  it("GETs use the record URLs and send no body", async () => {
    fetchMock.mockResolvedValue(ok({}));
    await getFind("f_1");
    expect(lastCall().url).toBe(`${serverBase()}/api/finds/f_1`);
    await getUnknown("u_2");
    expect(lastCall().url).toBe(`${serverBase()}/api/unknowns/u_2`);
    expect(lastCall().init.body).toBeUndefined();
  });
  it("all request body keys are within the privacy allow-list", async () => {
    fetchMock.mockResolvedValue(ok({}));
    await findNearby("1", "2");
    await sendUnknown("/media/x");
    await sendApproval("f", "reject");
    for (const [, init] of fetchMock.mock.calls) {
      for (const k of Object.keys(JSON.parse(init.body as string)))
        expect(ALLOWED.has(k)).toBe(true);
    }
  });
  it("throws with the HTTP status (and detail) on non-2xx", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "product not in our data yet" }),
    });
    await expect(findNearby("1", "30332")).rejects.toThrow(
      /404.*product not in our data yet/,
    );
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => Promise.reject(new Error("x")),
    });
    await expect(getFind("f")).rejects.toThrow(/502/);
  });
});

describe("poll", () => {
  it("stops when done", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fn = vi.fn(async () => ++n);
    const p = poll(fn, (v) => v >= 3);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(async () => 0);
    const p = poll(fn, () => false, { timeoutMs: 180000 });
    const assertion = expect(p).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(200_000);
    await assertion;
    expect(fn.mock.calls.length).toBeLessThanOrEqual(91);
  });
  it("rejects when aborted", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const p = poll(
      async () => 0,
      () => false,
      { signal: ac.signal },
    );
    const assertion = expect(p).rejects.toThrow("aborted");
    ac.abort();
    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
  });
});
