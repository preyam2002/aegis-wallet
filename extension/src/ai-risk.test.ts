import type { SimSummary } from "@aegis/shared/sim-summary";
import { describe, expect, it, vi } from "vitest";
import { fetchAiVerdict, mergeRiskLevel, primaryRecipient } from "./ai-risk";

const summary: SimSummary = {
	sends: [{ coinType: "0x2::sui::SUI", amount: "-45000000000", to: "0xdead" }],
	receives: [],
	objectsLeaving: [],
	gas: "1997880",
	risk: [],
};

const context = {
	origin: "https://drainer.example",
	sender: "0xa1a1",
	recipient: "0xdead",
	knownRecipient: false,
};

describe("mergeRiskLevel (hard-floor)", () => {
	it("keeps a deterministic critical even when AI says low", () => {
		expect(mergeRiskLevel("critical", "low")).toBe("critical");
	});
	it("escalates to AI critical when rules saw nothing", () => {
		expect(mergeRiskLevel("low", "critical")).toBe("critical");
	});
	it("takes the worse of the two", () => {
		expect(mergeRiskLevel("medium", "high")).toBe("high");
		expect(mergeRiskLevel("high", "medium")).toBe("high");
	});
});

describe("primaryRecipient", () => {
	it("returns the recipient of the first SUI outflow", () => {
		expect(primaryRecipient(summary)).toBe("0xdead");
	});
	it("falls back to an outgoing object recipient", () => {
		expect(
			primaryRecipient({
				...summary,
				sends: [],
				objectsLeaving: [{ objectId: "0x1", to: "0xbeef" }],
			}),
		).toBe("0xbeef");
	});
});

describe("fetchAiVerdict", () => {
	it("returns the verdict on a 200", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				riskLevel: "critical",
				headline: "Drainer",
				explanation: "Sends most of your SUI.",
				findings: [],
			}),
		});
		const verdict = await fetchAiVerdict(summary, context, {
			fetch: fetchMock as never,
		});
		expect(verdict?.riskLevel).toBe("critical");
	});

	it("returns null when the service errors (fail safe, not open)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: false, json: async () => ({}) });
		expect(
			await fetchAiVerdict(summary, context, { fetch: fetchMock as never }),
		).toBeNull();
	});

	it("returns null when the request throws or times out", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("aborted"));
		expect(
			await fetchAiVerdict(summary, context, { fetch: fetchMock as never }),
		).toBeNull();
	});

	it("returns null on a malformed verdict shape", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ riskLevel: "nonsense" }),
		});
		expect(
			await fetchAiVerdict(summary, context, { fetch: fetchMock as never }),
		).toBeNull();
	});
});
