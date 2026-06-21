import type { SimSummary } from "@aegis/shared/sim-summary";
import { describe, expect, it, vi } from "vitest";
import {
	assessTransaction,
	type MessagesClient,
	normalizeVerdict,
} from "./assess";
import type { AssessInput } from "./verdict";

const summary: SimSummary = {
	sends: [{ coinType: "0x2::sui::SUI", amount: "-45000000000", to: "0xdead" }],
	receives: [],
	objectsLeaving: [],
	gas: "1997880",
	risk: [],
};

const input: AssessInput = {
	origin: "https://drainer.example",
	sender: "0xa1a1",
	recipient: "0xdead",
	knownRecipient: false,
	summary,
};

const clientReturning = (response: unknown): MessagesClient => ({
	messages: { create: vi.fn().mockResolvedValue(response) },
});

describe("assessTransaction", () => {
	it("returns the verdict from the forced report_risk tool call", async () => {
		const client = clientReturning({
			stop_reason: "tool_use",
			content: [
				{
					type: "tool_use",
					name: "report_risk",
					input: {
						riskLevel: "critical",
						headline: "Looks like a wallet drainer",
						explanation: "Sends ~45 SUI to an address you have never used.",
						findings: [
							{
								title: "Large outflow",
								detail: "Most of your balance leaves.",
							},
						],
					},
				},
			],
		});

		const verdict = await assessTransaction(input, {
			client,
			model: "claude-haiku-4-5",
		});
		expect(verdict.riskLevel).toBe("critical");
		expect(verdict.headline).toContain("drainer");
		expect(verdict.findings).toHaveLength(1);

		const body = (client.messages.create as ReturnType<typeof vi.fn>).mock
			.calls[0]?.[0] as { model: string; tool_choice: unknown };
		expect(body.tool_choice).toEqual({ type: "tool", name: "report_risk" });
		expect(body.model).toBe("claude-haiku-4-5");
	});

	it("throws when the model refuses", async () => {
		const client = clientReturning({ stop_reason: "refusal", content: [] });
		await expect(assessTransaction(input, { client })).rejects.toThrow(
			/refused/,
		);
	});

	it("throws when no verdict tool call is returned", async () => {
		const client = clientReturning({
			stop_reason: "end_turn",
			content: [{ type: "text", text: "I think it's fine." }],
		});
		await expect(assessTransaction(input, { client })).rejects.toThrow(
			/did not return a verdict/,
		);
	});
});

describe("normalizeVerdict", () => {
	it("coerces an out-of-range risk level to medium and fills missing fields", () => {
		const verdict = normalizeVerdict({
			riskLevel: "nonsense",
			findings: "oops",
		});
		expect(verdict.riskLevel).toBe("medium");
		expect(verdict.findings).toEqual([]);
		expect(typeof verdict.headline).toBe("string");
		expect(typeof verdict.explanation).toBe("string");
	});
});
