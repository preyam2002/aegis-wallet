import type { EncryptOptions } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { combine, split } from "shamir-secret-sharing";

export type GuardianRecoveryShare = {
	guardian: string;
	index: number;
	identity: string;
	share: Uint8Array;
	sealKeyServerThreshold: number;
};

export type GuardianRecoveryInput = {
	secret: Uint8Array;
	guardians: string[];
	shamirThreshold: number;
	sealKeyServerThreshold: number;
	recoveryConfigId: string;
};

export type SealEncryptRequestInput = {
	packageId: string;
	shares: GuardianRecoveryShare[];
};

export type RecoverySealApproveInput = {
	packageId: string;
	recoveryConfigId: string;
	shareIdentity: string;
};

export type GuardianRecoveryPlanInput = {
	guardians: string[];
	shamirThreshold: number;
	sealKeyServerThreshold: number;
	recoveryConfigId?: string | null;
	encryptedShareIdentities: string[];
};

export type GuardianRecoveryPlan = {
	status: "not-configured" | "setup-required" | "ready" | "blocked";
	shamirLabel: string;
	sealLabel: string;
	blockers: string[];
	shareRows: {
		guardian: string;
		index: number;
		identity: string;
		encrypted: boolean;
	}[];
};

export const createGuardianRecoveryShares = async ({
	secret,
	guardians,
	shamirThreshold,
	sealKeyServerThreshold,
	recoveryConfigId,
}: GuardianRecoveryInput): Promise<GuardianRecoveryShare[]> => {
	validateThresholds(guardians.length, shamirThreshold, sealKeyServerThreshold);

	const rawShares = await split(secret, guardians.length, shamirThreshold);

	return rawShares.map((share, offset) => {
		const index = offset + 1;
		return {
			guardian: guardians[offset],
			index,
			identity: buildSealShareIdentity(recoveryConfigId, index),
			share,
			sealKeyServerThreshold,
		};
	});
};

export const combineGuardianShares = async (
	shares: Pick<GuardianRecoveryShare, "share">[],
): Promise<Uint8Array> => combine(shares.map((share) => share.share));

export const buildSealEncryptRequests = ({
	packageId,
	shares,
}: SealEncryptRequestInput): EncryptOptions[] =>
	shares.map((share) => ({
		threshold: share.sealKeyServerThreshold,
		packageId,
		id: share.identity,
		data: share.share,
	}));

export const buildRecoverySealApproveTransaction = ({
	packageId,
	recoveryConfigId,
	shareIdentity,
}: RecoverySealApproveInput): Transaction => {
	assertObjectId(packageId, "packageId");
	assertObjectId(recoveryConfigId, "recoveryConfigId");
	if (!shareIdentity.toLowerCase().startsWith(recoveryConfigId.toLowerCase())) {
		throw new Error("shareIdentity must be namespaced by recoveryConfigId");
	}

	const tx = new Transaction();
	tx.moveCall({
		target: `${packageId}::recovery::seal_approve`,
		arguments: [
			tx.pure.vector("u8", [...hexToBytesAnyLength(shareIdentity)]),
			tx.object(recoveryConfigId),
			tx.object.clock(),
		],
	});

	return tx;
};

export const buildGuardianRecoveryPlan = ({
	guardians,
	shamirThreshold,
	sealKeyServerThreshold,
	recoveryConfigId,
	encryptedShareIdentities,
}: GuardianRecoveryPlanInput): GuardianRecoveryPlan => {
	const shamirLabel = `${shamirThreshold}-of-${guardians.length} guardians`;
	const sealLabel = `${sealKeyServerThreshold}-of-n key servers per share`;

	if (!recoveryConfigId || guardians.length === 0) {
		return {
			status: "not-configured",
			shamirLabel,
			sealLabel,
			blockers: [],
			shareRows: [],
		};
	}

	const blockers: string[] = [];
	try {
		validateThresholds(
			guardians.length,
			shamirThreshold,
			sealKeyServerThreshold,
		);
	} catch (error) {
		blockers.push(error instanceof Error ? error.message : String(error));
	}

	if (blockers.length > 0) {
		return {
			status: "blocked",
			shamirLabel,
			sealLabel,
			blockers,
			shareRows: [],
		};
	}

	let shareRows: GuardianRecoveryPlan["shareRows"];
	try {
		const encrypted = new Set(
			encryptedShareIdentities.map((identity) => identity.toLowerCase()),
		);
		shareRows = guardians.map((guardian, offset) => {
			const index = offset + 1;
			const identity = buildSealShareIdentity(recoveryConfigId, index);
			return {
				guardian,
				index,
				identity,
				encrypted: encrypted.has(identity.toLowerCase()),
			};
		});
	} catch (error) {
		return {
			status: "blocked",
			shamirLabel,
			sealLabel,
			blockers: [error instanceof Error ? error.message : String(error)],
			shareRows: [],
		};
	}

	return {
		status: shareRows.every((row) => row.encrypted)
			? "ready"
			: "setup-required",
		shamirLabel,
		sealLabel,
		blockers: [],
		shareRows,
	};
};

export const buildSealShareIdentity = (
	recoveryConfigId: string,
	index: number,
): string => {
	if (!Number.isInteger(index) || index < 1 || index > 255) {
		throw new Error("share index must be between 1 and 255");
	}

	return bytesToHex(new Uint8Array([...hexToBytes(recoveryConfigId), index]));
};

const validateThresholds = (
	guardianCount: number,
	shamirThreshold: number,
	sealKeyServerThreshold: number,
) => {
	if (guardianCount < 2) {
		throw new Error("at least two guardians are required");
	}
	if (guardianCount > 255) {
		throw new Error("guardian count cannot exceed 255");
	}
	if (shamirThreshold < 2) {
		throw new Error("shamirThreshold must be at least 2");
	}
	if (shamirThreshold > guardianCount) {
		throw new Error("shamirThreshold cannot exceed guardian count");
	}
	if (sealKeyServerThreshold < 1) {
		throw new Error("sealKeyServerThreshold must be at least 1");
	}
};

const hexToBytes = (value: string): Uint8Array => {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	if (normalized.length !== 64) {
		throw new Error("recoveryConfigId must be a 32-byte hex object id");
	}
	if (!/^[0-9a-fA-F]+$/.test(normalized)) {
		throw new Error("recoveryConfigId must be hex");
	}

	const bytes = new Uint8Array(normalized.length / 2);
	for (let index = 0; index < normalized.length; index += 2) {
		bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
	}
	return bytes;
};

const hexToBytesAnyLength = (value: string): Uint8Array => {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) {
		throw new Error("expected even-length hex");
	}

	const bytes = new Uint8Array(normalized.length / 2);
	for (let index = 0; index < normalized.length; index += 2) {
		bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
	}
	return bytes;
};

const assertObjectId = (value: string, name: string) => {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	if (normalized.length !== 64 || !/^[0-9a-fA-F]+$/.test(normalized)) {
		throw new Error(`${name} must be a 32-byte hex object id`);
	}
};

const bytesToHex = (bytes: Uint8Array): string =>
	`0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
