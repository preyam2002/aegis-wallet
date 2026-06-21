import type { RiskLevel } from "./risk";

const RISK_SERVICE_URL = "http://127.0.0.1:8787";

export type DecisionInput = {
	origin: string;
	method: string;
	riskLevel: RiskLevel;
	blocked: boolean;
	approved: boolean;
	headline?: string;
};

/**
 * Report a bouncer decision to the risk service so the website's live log can
 * show it. Fire-and-forget: a missing service must never affect signing.
 */
export const recordDecision = (
	input: DecisionInput,
	deps: { fetch?: typeof fetch; url?: string } = {},
): void => {
	const doFetch = deps.fetch ?? fetch;
	void doFetch(`${deps.url ?? RISK_SERVICE_URL}/decisions`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	}).catch(() => {});
};
