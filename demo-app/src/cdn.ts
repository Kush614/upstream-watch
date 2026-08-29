/**
 * Cloudflare cache purge.
 *
 * The receipt for an order is cached at the edge, so a successful payment has to purge it
 * or the customer sees a stale page. That makes this the second vendor API this service
 * depends on — and the second one that can change under us.
 */

const CLOUDFLARE_API = process.env.CLOUDFLARE_API_BASE ?? "https://api.cloudflare.com/client/v4";

export interface PurgeRequest {
  zoneId: string;
  /** Absolute URLs to evict. */
  files: string[];
}

export interface PurgeResult {
  success: boolean;
  errors: string[];
}

export interface CloudflareApi {
  purgeCache(req: PurgeRequest): Promise<PurgeResult>;
}

export function createCloudflare(apiToken = process.env.CLOUDFLARE_API_TOKEN ?? ""): CloudflareApi {
  return {
    async purgeCache({ zoneId, files }): Promise<PurgeResult> {
      const res = await fetch(`${CLOUDFLARE_API}/zones/${zoneId}/purge_cache`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });

      const body = (await res.json()) as { success?: boolean; errors?: Array<{ message?: string }> };
      return {
        success: res.ok && body.success === true,
        errors: (body.errors ?? []).map((e) => e.message ?? "unknown"),
      };
    },
  };
}

/** Build the receipt URLs a completed order should evict. */
export function receiptUrls(baseUrl: string, chargeId: string): string[] {
  return [`${baseUrl}/receipts/${chargeId}`, `${baseUrl}/receipts/${chargeId}.pdf`];
}
