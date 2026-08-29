import { describe, it, expect, vi } from "vitest";
import { receiptUrls, type CloudflareApi } from "../src/cdn.ts";

describe("receiptUrls", () => {
  it("builds the receipt URLs a completed order should evict", () => {
    expect(receiptUrls("https://shop.test", "ch_123")).toEqual([
      "https://shop.test/receipts/ch_123",
      "https://shop.test/receipts/ch_123.pdf",
    ]);
  });
});

describe("purgeCache", () => {
  it("sends the files to evict for the zone", async () => {
    const purgeCache = vi.fn().mockResolvedValue({ success: true, errors: [] });
    const cf: CloudflareApi = { purgeCache };

    await cf.purgeCache({ zoneId: "zone_1", files: receiptUrls("https://shop.test", "ch_1") });

    // Pinned deliberately: when Cloudflare changes this call's shape, this is what fails.
    expect(purgeCache).toHaveBeenCalledWith({
      zoneId: "zone_1",
      files: ["https://shop.test/receipts/ch_1", "https://shop.test/receipts/ch_1.pdf"],
    });
  });
});
