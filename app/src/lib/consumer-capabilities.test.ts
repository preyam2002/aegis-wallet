import { describe, expect, it } from "vitest";
import {
	buildAdvancedTradingModel,
	buildBridgeModel,
	buildFiatOnrampModel,
	createBridgeIntent,
} from "./consumer-capabilities";

describe("consumer capability parity", () => {
	it("keeps fiat on-ramp handoff provider-gated instead of pretending testnet can buy", () => {
		const model = buildFiatOnrampModel({
			activeNetwork: "testnet",
			providerCredentialsReady: false,
		});

		expect(model.status).toBe("gated");
		expect(model.reason).toContain("Mainnet");
		expect(model.providers.map((provider) => provider.id)).toEqual([
			"transak",
			"banxa",
			"moonpay",
		]);
		expect(model.providers.every((provider) => provider.requiresKyc)).toBe(
			true,
		);
	});

	it("builds cross-chain bridge intents with explicit provider and risk gates", () => {
		const model = buildBridgeModel({
			activeChain: "sui",
			providerRoutesReady: false,
		});
		const intent = createBridgeIntent({
			fromChain: "sui",
			toChain: "ethereum",
			asset: "SUI",
			amount: "12.5",
			provider: "wormhole",
		});

		expect(model.status).toBe("gated");
		expect(
			model.routes.map((route) => `${route.fromChain}->${route.toChain}`),
		).toContain("sui->ethereum");
		expect(intent.riskLevel).toBe("high");
		expect(intent.summary).toContain("SUI from Sui to Ethereum");
		expect(() =>
			createBridgeIntent({
				fromChain: "sui",
				toChain: "sui",
				asset: "SUI",
				amount: "1",
				provider: "sui-bridge",
			}),
		).toThrow("different chains");
	});

	it("keeps advanced consumer trading disabled until providers and high-risk mode are enabled", () => {
		const model = buildAdvancedTradingModel({
			providerCredentialsReady: false,
			highRiskTradingEnabled: false,
		});

		expect(model.status).toBe("gated");
		expect(model.items.map((item) => item.id)).toEqual([
			"perps",
			"prediction-markets",
			"tokenized-stocks",
			"wallet-chat",
			"cash-card",
		]);
		expect(
			model.items.filter((item) => item.requiresHighRiskApproval),
		).toHaveLength(3);
		expect(model.items.every((item) => item.status === "gated")).toBe(true);
	});
});
