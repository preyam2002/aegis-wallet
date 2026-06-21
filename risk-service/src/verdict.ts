import type { SimSummary } from "@aegis/shared/sim-summary";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskFinding = {
	title: string;
	detail: string;
};

export type RiskVerdict = {
	riskLevel: RiskLevel;
	headline: string;
	explanation: string;
	findings: RiskFinding[];
};

export type AssessInput = {
	/** The dApp origin requesting the signature (untrusted). */
	origin: string;
	/** The signer's wallet address. */
	sender: string;
	/** The primary recipient of the outgoing transfer, if any (untrusted). */
	recipient?: string;
	/** Whether the wallet has sent to this recipient before. */
	knownRecipient: boolean;
	/** The dry-run simulation summary the verdict is judged against. */
	summary: SimSummary;
};

export const RISK_LEVELS: readonly RiskLevel[] = [
	"low",
	"medium",
	"high",
	"critical",
];

/**
 * The single tool Claude must call. `strict: true` forces the model output to
 * validate against this schema, so the verdict needs no defensive parsing.
 */
export const REPORT_RISK_TOOL = {
	name: "report_risk",
	description:
		"Report the security assessment for the proposed Sui transaction. Call this exactly once.",
	strict: true,
	input_schema: {
		type: "object",
		additionalProperties: false,
		required: ["riskLevel", "headline", "explanation", "findings"],
		properties: {
			riskLevel: {
				type: "string",
				enum: ["low", "medium", "high", "critical"],
				description:
					"low = benign; medium = unusual but probably fine; high = dangerous, warn loudly; critical = almost certainly a scam or drain.",
			},
			headline: {
				type: "string",
				description:
					"A 3-8 word verdict in plain English, e.g. 'Looks like a wallet drainer'.",
			},
			explanation: {
				type: "string",
				description:
					"One short paragraph a non-technical user can understand: what this transaction actually does and why it is or isn't safe.",
			},
			findings: {
				type: "array",
				description:
					"Specific concrete concerns. Empty if the transfer is benign.",
				items: {
					type: "object",
					additionalProperties: false,
					required: ["title", "detail"],
					properties: {
						title: { type: "string" },
						detail: { type: "string" },
					},
				},
			},
		},
	},
} as const;
