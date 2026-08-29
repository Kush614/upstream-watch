/**
 * Post a payment notification to Slack.
 *
 * The fourth vendor surface this service depends on. Slack deprecates and retires API
 * methods on its changelog, which is why it is watched.
 */

const SLACK_API = process.env.SLACK_API_BASE ?? "https://slack.com/api";

export interface Notification {
  channel: string;
  chargeId: string;
  amountCents: number;
  currency: string;
}

export interface SlackApi {
  postMessage(input: { channel: string; text: string }): Promise<{ ok: boolean; ts?: string }>;
}

export function formatPaymentMessage(n: Notification): string {
  const amount = (n.amountCents / 100).toFixed(2);
  return `Payment ${n.chargeId} succeeded: ${amount} ${n.currency.toUpperCase()}`;
}

export function createSlack(token = process.env.SLACK_BOT_TOKEN ?? ""): SlackApi {
  return {
    // chat.postMessage — the method this service depends on.
    async postMessage({ channel, text }) {
      const res = await fetch(`${SLACK_API}/chat.postMessage`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, text }),
      });

      const body = (await res.json()) as { ok?: boolean; ts?: string; error?: string };
      if (!body.ok) throw new Error(`Slack chat.postMessage failed: ${body.error ?? res.status}`);

      return { ok: true, ts: body.ts };
    },
  };
}

export async function notifyPayment(slack: SlackApi, n: Notification): Promise<void> {
  await slack.postMessage({ channel: n.channel, text: formatPaymentMessage(n) });
}
