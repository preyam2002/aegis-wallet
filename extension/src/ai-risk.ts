import type { SimSummary } from "@aegis/shared/sim-summary";
import type { RiskLevel } from "./risk";

// The AI judge (risk-service) verdict. Advisory: shown to the user and merged
// with the deterministic assessment, but never the sole basis for a block.
export type AiVerdict = {
	riskLevel: RiskLevel;
	headline: string;
	explanation: string;
	findings: { title: string; detail: string }[];
};

export type AssessContext = {
	origin: string;
	sender: string;
	recipient?: string;
	knownRecipient: boolean;
};

const RISK_SERVICE_URL = "http://127.0.0.1:8787";
const TIMEOUT_MS = 4000;

const RANK: Record<RiskLevel, number> = {
	low: 0,
	medium: 1,
	high: 2,
	critical: 3,
};

/**
 * The hard-floor: the merged level is the worse of the deterministic rules and
 * the AI verdict. A wrong/jailbroken AI saying "low" can never lower a level the
 * deterministic rules already raised — that's what keeps "won't let you get
 * drained" defensible.
 */
export const mergeRiskLevel = (
	deterministic: RiskLevel,
	ai: RiskLevel,
): RiskLevel => (RANK[ai] > RANK[deterministic] ? ai : deterministic);

/** The recipient the AI should focus on: the largest SUI outflow, else an object. */
export const primaryRecipient = (summary: SimSummary): string | undefined => {
	const send = summary.sends.find((s) => s.to);
	if (send?.to) {
		return send.to;
	}
	return summary.objectsLeaving.find((o) => o.to)?.to;
};

/**
 * Ask the risk-service for an AI verdict. Returns null on any failure (service
 * down, timeout, bad shape) so the caller falls back to deterministic-only —
 * fail safe, not fail open.
 */
export const fetchAiVerdict = async (
	summary: SimSummary,
	context: AssessContext,
	deps: { fetch?: typeof fetch; url?: string; timeoutMs?: number } = {},
): Promise<AiVerdict | null> => {
	const doFetch = deps.fetch ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(),
		deps.timeoutMs ?? TIMEOUT_MS,
	);
	try {
		const response = await doFetch(`${deps.url ?? RISK_SERVICE_URL}/assess`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...context, summary }),
			signal: controller.signal,
		});
		if (!response.ok) {
			return null;
		}
		const verdict = (await response.json()) as AiVerdict;
		if (
			!verdict ||
			typeof verdict !== "object" ||
			!Object.hasOwn(RANK, verdict.riskLevel)
		) {
			return null;
		}
		return {
			riskLevel: verdict.riskLevel,
			headline: String(verdict.headline ?? ""),
			explanation: String(verdict.explanation ?? ""),
			findings: Array.isArray(verdict.findings) ? verdict.findings : [],
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
};
