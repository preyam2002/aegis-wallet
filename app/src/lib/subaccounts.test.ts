import { describe, expect, it } from "vitest";
import {
	createSubAccount,
	recordSubAccountSpend,
	revokeSubAccount,
} from "./subaccounts";

describe("subaccounts", () => {
	it("creates scoped dApp spend authority", () => {
		const subaccount = createSubAccount({
			id: "sub-navi",
			owner: "0xaegis",
			dapp: "app.naviprotocol.io",
			maxMist: 1_000_000_000n,
			expiresAtMs: 10_000,
		});

		expect(subaccount).toMatchObject({
			id: "sub-navi",
			owner: "0xaegis",
			dapp: "app.naviprotocol.io",
			maxMist: 1_000_000_000n,
			spentMist: 0n,
			revoked: false,
		});
	});

	it("records spend until the cap and rejects over-budget attempts", () => {
		const subaccount = createSubAccount({
			id: "sub-navi",
			owner: "0xaegis",
			dapp: "app.naviprotocol.io",
			maxMist: 1_000_000_000n,
			expiresAtMs: 10_000,
		});

		const spent = recordSubAccountSpend(subaccount, 400_000_000n, 5_000);

		expect(spent.spentMist).toBe(400_000_000n);
		expect(() => recordSubAccountSpend(spent, 700_000_000n, 5_000)).toThrow(
			"subaccount spend exceeds scoped budget",
		);
	});

	it("rejects expired or revoked subaccounts", () => {
		const subaccount = createSubAccount({
			id: "sub-navi",
			owner: "0xaegis",
			dapp: "app.naviprotocol.io",
			maxMist: 1_000_000_000n,
			expiresAtMs: 10_000,
		});

		expect(() => recordSubAccountSpend(subaccount, 1n, 10_001)).toThrow(
			"subaccount is expired",
		);
		expect(() =>
			recordSubAccountSpend(revokeSubAccount(subaccount), 1n, 5_000),
		).toThrow("subaccount is revoked");
	});
});
