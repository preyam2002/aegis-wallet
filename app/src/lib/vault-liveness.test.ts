import { describe, expect, it } from "vitest";
import { getVaultLivenessState } from "./vault-liveness";

describe("getVaultLivenessState", () => {
	it("keeps normal Vault Mode active while the co-signer is reachable", () => {
		expect(
			getVaultLivenessState({
				enclaveReachable: true,
				recoveryRequestedAtMs: null,
				timelockMs: 3_600_000,
				nowMs: 10_000,
			}),
		).toEqual({ status: "active", remainingMs: 0 });
	});

	it("requires recovery request when the enclave is down and no request exists", () => {
		expect(
			getVaultLivenessState({
				enclaveReachable: false,
				recoveryRequestedAtMs: null,
				timelockMs: 3_600_000,
				nowMs: 10_000,
			}),
		).toEqual({ status: "request-recovery", remainingMs: 3_600_000 });
	});

	it("reports pending timelock before escape is available", () => {
		expect(
			getVaultLivenessState({
				enclaveReachable: false,
				recoveryRequestedAtMs: 1_000,
				timelockMs: 3_600_000,
				nowMs: 3_000_000,
			}),
		).toEqual({ status: "timelocked", remainingMs: 601_000 });
	});

	it("allows escape once the timelock has elapsed", () => {
		expect(
			getVaultLivenessState({
				enclaveReachable: false,
				recoveryRequestedAtMs: 1_000,
				timelockMs: 3_600_000,
				nowMs: 3_601_000,
			}),
		).toEqual({ status: "escape-available", remainingMs: 0 });
	});
});
