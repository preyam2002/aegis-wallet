import { describe, expect, it } from "vitest";
import {
	buildGuardianRecoveryPlan,
	buildRecoverySealApproveTransaction,
	buildSealEncryptRequests,
	buildSealShareIdentity,
	combineGuardianShares,
	createGuardianRecoveryShares,
} from "./recovery";

const secret = new Uint8Array([
	14, 45, 72, 99, 103, 111, 138, 144, 155, 166, 173, 184, 191, 202, 213, 224,
	235, 241, 3, 18, 29, 40, 51, 62, 73, 84, 95, 106, 117, 128, 139, 150,
]);

const recoveryConfigId = `0x${"ab".repeat(32)}`;

describe("guardian recovery", () => {
	it("splits a recoverable secret into Seal-namespaced guardian shares", async () => {
		const shares = await createGuardianRecoveryShares({
			secret,
			guardians: [
				"0xguardian1",
				"0xguardian2",
				"0xguardian3",
				"0xguardian4",
				"0xguardian5",
			],
			shamirThreshold: 3,
			sealKeyServerThreshold: 2,
			recoveryConfigId,
		});

		expect(shares).toHaveLength(5);
		expect(shares[0]).toMatchObject({
			guardian: "0xguardian1",
			index: 1,
			sealKeyServerThreshold: 2,
			identity: buildSealShareIdentity(recoveryConfigId, 1),
		});
		expect(shares[4]?.identity).toBe(
			buildSealShareIdentity(recoveryConfigId, 5),
		);
	});

	it("reconstructs from the Shamir threshold, independent of the Seal key-server threshold", async () => {
		const shares = await createGuardianRecoveryShares({
			secret,
			guardians: [
				"0xguardian1",
				"0xguardian2",
				"0xguardian3",
				"0xguardian4",
				"0xguardian5",
			],
			shamirThreshold: 3,
			sealKeyServerThreshold: 1,
			recoveryConfigId,
		});

		const recovered = await combineGuardianShares([
			shares[0],
			shares[2],
			shares[4],
		]);

		expect([...recovered]).toEqual([...secret]);
	});

	it("keeps below-threshold shares from reconstructing the original secret", async () => {
		const shares = await createGuardianRecoveryShares({
			secret,
			guardians: [
				"0xguardian1",
				"0xguardian2",
				"0xguardian3",
				"0xguardian4",
				"0xguardian5",
			],
			shamirThreshold: 3,
			sealKeyServerThreshold: 1,
			recoveryConfigId,
		});

		const belowThreshold = await combineGuardianShares([shares[0], shares[1]]);

		expect([...belowThreshold]).not.toEqual([...secret]);
	});

	it("rejects impossible Shamir and Seal thresholds before producing shares", async () => {
		await expect(
			createGuardianRecoveryShares({
				secret,
				guardians: ["0xguardian1", "0xguardian2"],
				shamirThreshold: 3,
				sealKeyServerThreshold: 1,
				recoveryConfigId,
			}),
		).rejects.toThrow("shamirThreshold cannot exceed guardian count");

		await expect(
			createGuardianRecoveryShares({
				secret,
				guardians: ["0xguardian1", "0xguardian2"],
				shamirThreshold: 2,
				sealKeyServerThreshold: 0,
				recoveryConfigId,
			}),
		).rejects.toThrow("sealKeyServerThreshold must be at least 1");
	});

	it("builds Seal encrypt requests for each Shamir share without changing the Shamir threshold", async () => {
		const shares = await createGuardianRecoveryShares({
			secret,
			guardians: ["0xguardian1", "0xguardian2", "0xguardian3"],
			shamirThreshold: 2,
			sealKeyServerThreshold: 1,
			recoveryConfigId,
		});

		const requests = buildSealEncryptRequests({
			packageId: `0x${"cd".repeat(32)}`,
			shares,
		});

		expect(requests).toHaveLength(3);
		expect(requests[0]).toMatchObject({
			threshold: 1,
			packageId: `0x${"cd".repeat(32)}`,
			id: buildSealShareIdentity(recoveryConfigId, 1),
		});
		expect(requests[0]?.data).toBe(shares[0]?.share);
	});

	it("builds a side-effect-free seal_approve transaction kind for a guardian share", () => {
		const tx = buildRecoverySealApproveTransaction({
			packageId: `0x${"cd".repeat(32)}`,
			recoveryConfigId,
			shareIdentity: buildSealShareIdentity(recoveryConfigId, 2),
		});

		const data = tx.getData() as {
			commands: {
				MoveCall?: { package: string; module: string; function: string };
			}[];
		};

		expect(data.commands).toHaveLength(1);
		expect(data.commands[0]?.MoveCall).toMatchObject({
			package: `0x${"cd".repeat(32)}`,
			module: "recovery",
			function: "seal_approve",
		});
	});

	it("builds a recovery setup plan that separates Shamir and Seal thresholds", () => {
		const plan = buildGuardianRecoveryPlan({
			guardians: ["Maya", "Ishan", "Rhea"],
			shamirThreshold: 2,
			sealKeyServerThreshold: 1,
			recoveryConfigId,
			encryptedShareIdentities: [],
		});

		expect(plan.status).toBe("setup-required");
		expect(plan.shamirLabel).toBe("2-of-3 guardians");
		expect(plan.sealLabel).toBe("1-of-n key servers per share");
		expect(plan.shareRows).toEqual([
			{
				guardian: "Maya",
				index: 1,
				identity: buildSealShareIdentity(recoveryConfigId, 1),
				encrypted: false,
			},
			{
				guardian: "Ishan",
				index: 2,
				identity: buildSealShareIdentity(recoveryConfigId, 2),
				encrypted: false,
			},
			{
				guardian: "Rhea",
				index: 3,
				identity: buildSealShareIdentity(recoveryConfigId, 3),
				encrypted: false,
			},
		]);
	});

	it("marks the recovery setup ready only when every expected share identity is encrypted", () => {
		const plan = buildGuardianRecoveryPlan({
			guardians: ["Maya", "Ishan", "Rhea"],
			shamirThreshold: 2,
			sealKeyServerThreshold: 1,
			recoveryConfigId,
			encryptedShareIdentities: [
				buildSealShareIdentity(recoveryConfigId, 1),
				buildSealShareIdentity(recoveryConfigId, 2),
				buildSealShareIdentity(recoveryConfigId, 3),
			],
		});

		expect(plan.status).toBe("ready");
		expect(plan.shareRows.every((row) => row.encrypted)).toBe(true);
	});

	it("blocks impossible recovery setup values without producing share identities", () => {
		const plan = buildGuardianRecoveryPlan({
			guardians: ["Maya", "Ishan"],
			shamirThreshold: 3,
			sealKeyServerThreshold: 1,
			recoveryConfigId,
			encryptedShareIdentities: [],
		});

		expect(plan.status).toBe("blocked");
		expect(plan.blockers).toContain(
			"shamirThreshold cannot exceed guardian count",
		);
		expect(plan.shareRows).toEqual([]);
	});
});
