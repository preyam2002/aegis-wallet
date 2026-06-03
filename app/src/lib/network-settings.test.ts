import { describe, expect, it } from "vitest";
import {
	buildNetworkSettingsModel,
	canSwitchNetwork,
	getNetworkSpendPolicy,
} from "./network-settings";

describe("network settings", () => {
	it("defaults to testnet and exposes localnet/mainnet safety rails", () => {
		const model = buildNetworkSettingsModel({
			activeNetwork: "testnet",
			allowMainnetSpend: false,
		});

		expect(model.activeNetwork.id).toBe("testnet");
		expect(model.networks.map((network) => network.id)).toEqual([
			"testnet",
			"localnet",
			"mainnet",
		]);
		expect(getNetworkSpendPolicy(model, "mainnet")).toEqual({
			canSpend: false,
			reason: "Mainnet spending requires explicit approval.",
		});
		expect(getNetworkSpendPolicy(model, "localnet")).toEqual({
			canSpend: true,
			reason: "Localnet spending is allowed for disposable integration tests.",
		});
	});

	it("switches only to configured networks", () => {
		const model = buildNetworkSettingsModel({
			activeNetwork: "testnet",
			allowMainnetSpend: true,
		});

		expect(canSwitchNetwork(model, "localnet")).toBe(true);
		expect(canSwitchNetwork(model, "mainnet")).toBe(true);
		expect(canSwitchNetwork(model, "devnet")).toBe(false);
	});
});
