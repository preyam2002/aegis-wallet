import { describe, expect, it } from "vitest";
import { buildSafetyDemoScenarios } from "./safety-demo";

describe("buildSafetyDemoScenarios", () => {
	it("exposes the four read-only safety demos used by the product surface", () => {
		const scenarios = buildSafetyDemoScenarios();

		expect(scenarios.map((scenario) => scenario.title)).toEqual([
			"Known drainer",
			"Wallet sweep",
			"Untrusted package",
			"Poisoned address",
		]);
		expect(scenarios.map((scenario) => scenario.analysis.riskLevel)).toEqual([
			"critical",
			"high",
			"high",
			"high",
		]);
		expect(
			scenarios.flatMap((scenario) =>
				scenario.analysis.findings.map((finding) => finding.title),
			),
		).toEqual(
			expect.arrayContaining([
				"Known drainer recipient",
				"Wallet sweep",
				"Untrusted package",
				"Address looks like a saved contact",
			]),
		);
	});
});
