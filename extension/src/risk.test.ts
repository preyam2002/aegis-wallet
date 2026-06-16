import type { SimSummary } from "@aegis/shared/sim-summary";
import { describe, expect, it } from "vitest";
import { assessTransaction } from "./risk";

const base: SimSummary = {
	sends: [],
	receives: [],
	objectsLeaving: [],
	gas: "1000000",
	risk: [],
};

describe("assessTransaction (dApp bouncer)", () => {
	it("rates a small SUI send as low risk", () => {
		const result = assessTransaction(
			{ ...base, sends: [{ coinType: "0x2::sui::SUI", amount: "-1000000" }] },
			{ totalMist: 50_000_000_000n },
		);
		expect(result.riskLevel).toBe("low");
		expect(result.findings).toHaveLength(0);
	});

	it("flags a failed simulation as critical", () => {
		const result = assessTransaction(
			{ ...base, failed: { error: "InsufficientGas" } },
			{},
		);
		expect(result.riskLevel).toBe("critical");
		expect(result.findings[0]?.title).toBe("Simulation failed");
	});

	it("flags owned objects leaving the wallet as high", () => {
		const result = assessTransaction(
			{ ...base, objectsLeaving: [{ objectId: "0x1" }, { objectId: "0x2" }] },
			{},
		);
		expect(result.riskLevel).toBe("high");
		expect(result.objectsLeaving).toBe(2);
	});

	it("flags a near-total drain as critical", () => {
		const result = assessTransaction(
			{
				...base,
				sends: [{ coinType: "0x2::sui::SUI", amount: "-9500000000" }],
			},
			{ totalMist: 10_000_000_000n },
		);
		expect(result.riskLevel).toBe("critical");
		expect(result.findings.some((f) => /drains/i.test(f.title))).toBe(true);
	});
});
