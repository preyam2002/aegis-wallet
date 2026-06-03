import { describe, expect, it } from "vitest";
import {
	disconnectSession,
	type PermissionState,
	revokeCapability,
} from "./permissions";

const baseState: PermissionState = {
	sessions: [
		{
			id: "navi",
			origin: "https://app.naviprotocol.io",
			account: "0xaegis",
			connectedAt: "2026-06-03T10:00:00Z",
			active: true,
		},
	],
	capabilities: [
		{
			objectId: "0xcap1",
			label: "Navi repay cap",
			dappOrigin: "https://app.naviprotocol.io",
			expiresAt: "2026-06-04T10:00:00Z",
			revoked: false,
		},
	],
};

describe("permissions manager", () => {
	it("disconnects a dApp session without deleting history", () => {
		const next = disconnectSession(baseState, "navi");

		expect(next.sessions[0]).toMatchObject({ id: "navi", active: false });
		expect(baseState.sessions[0].active).toBe(true);
	});

	it("marks wallet-issued capability objects as revoked", () => {
		const next = revokeCapability(baseState, "0xcap1");

		expect(next.capabilities[0]).toMatchObject({
			objectId: "0xcap1",
			revoked: true,
		});
		expect(baseState.capabilities[0].revoked).toBe(false);
	});
});
