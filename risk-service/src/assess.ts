import { buildUserContent, SYSTEM_PROMPT } from "./prompt";
import {
	type AssessInput,
	REPORT_RISK_TOOL,
	RISK_LEVELS,
	type RiskFinding,
	type RiskLevel,
	type RiskVerdict,
} from "./verdict";

export const DEFAULT_MODEL = process.env.AEGIS_RISK_MODEL ?? "claude-haiku-4-5";

/** Structural slice of the Anthropic client we depend on (keeps tests SDK-free). */
export type MessagesClient = {
	messages: {
		// biome-ignore lint/suspicious/noExplicitAny: SDK request/response shapes vary by version
		create: (body: any) => Promise<any>;
	};
};

const asString = (value: unknown, fallback: string): string =>
	typeof value === "string" && value.trim().length > 0 ? value : fallback;

/** Coerce the model's tool input into a valid verdict, even if a field is off. */
export const normalizeVerdict = (raw: unknown): RiskVerdict => {
	const v = (raw && typeof raw === "object" ? raw : {}) as Record<
		string,
		unknown
	>;
	const riskLevel = RISK_LEVELS.includes(v.riskLevel as RiskLevel)
		? (v.riskLevel as RiskLevel)
		: "medium";
	const findings: RiskFinding[] = Array.isArray(v.findings)
		? v.findings
				.filter(
					(f): f is Record<string, unknown> => !!f && typeof f === "object",
				)
				.map((f) => ({
					title: asString(f.title, "Concern"),
					detail: asString(f.detail, ""),
				}))
		: [];
	return {
		riskLevel,
		headline: asString(v.headline, "Transaction reviewed"),
		explanation: asString(v.explanation, "No explanation was produced."),
		findings,
	};
};

/** Run the AI risk judge for one simulated transaction. Throws on no verdict. */
export const assessTransaction = async (
	input: AssessInput,
	deps: { client: MessagesClient; model?: string },
): Promise<RiskVerdict> => {
	const response = await deps.client.messages.create({
		model: deps.model ?? DEFAULT_MODEL,
		max_tokens: 1024,
		system: SYSTEM_PROMPT,
		tools: [REPORT_RISK_TOOL],
		tool_choice: { type: "tool", name: "report_risk" },
		messages: [{ role: "user", content: buildUserContent(input) }],
	});

	if (response?.stop_reason === "refusal") {
		throw new Error("risk model refused to assess this transaction");
	}
	const content: unknown[] = Array.isArray(response?.content)
		? response.content
		: [];
	const toolUse = content.find(
		(block): block is { type: string; name: string; input: unknown } =>
			!!block &&
			typeof block === "object" &&
			(block as { type?: unknown }).type === "tool_use" &&
			(block as { name?: unknown }).name === "report_risk",
	);
	if (!toolUse) {
		throw new Error("risk model did not return a verdict");
	}
	return normalizeVerdict(toolUse.input);
};
