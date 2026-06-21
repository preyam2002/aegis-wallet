import { describe, expect, it, vi } from "vitest";
import { recordDecision } from "./decisions";

const decision = {
	origin: "https://drainer.example",
	method: "signAndExecuteTransaction",
	riskLevel: "critical" as const,
	blocked: true,
	approved: false,
	headline: "Looks like a drainer",
};

describe("recordDecision", () => {
	it("POSTs the decision to the risk service", () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		recordDecision(decision, { fetch: fetchMock as never, url: "http://x" });
		expect(fetchMock).toHaveBeenCalledWith(
			"http://x/decisions",
			expect.objectContaining({ method: "POST" }),
		);
		const body = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
		expect(body.blocked).toBe(true);
		expect(body.headline).toBe("Looks like a drainer");
	});

	it("never throws when the service is down", () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error("refused"));
		expect(() =>
			recordDecision(decision, { fetch: fetchMock as never }),
		).not.toThrow();
	});
});
