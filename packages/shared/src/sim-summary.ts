export type CoSignRequest = {
	txBytes: string;
	userSig: string;
	vaultAddress: string;
};

export type CoSignResponse =
	| { ok: true; enclaveSig: string }
	| { ok: false; reason: string; rejectionReceipt?: string };

export type RiskLevel = "info" | "warn" | "block";

export type SimSummary = {
	sends: { coinType: string; amount: string; to?: string }[];
	receives: { coinType: string; amount: string }[];
	objectsLeaving: { objectId: string; type?: string; to?: string }[];
	gas: string;
	risk: { level: RiskLevel; reason: string }[];
	failed?: { error: string };
};

export type CoreTransactionForSummary = {
	status: { success: true; error: null } | { success: false; error: string };
	balanceChanges?: { coinType: string; address: string; amount: string }[];
	objectTypes?: Record<string, string>;
	effects?: {
		gasUsed?: {
			computationCost: string;
			storageCost: string;
			storageRebate: string;
			nonRefundableStorageFee: string;
		};
		changedObjects?: {
			objectId: string;
			inputOwner: CoreObjectOwner | null;
			outputOwner: CoreObjectOwner | null;
			outputState: string;
			idOperation: string;
		}[];
	};
};

export type CoreObjectOwner =
	| { $kind: "Address"; Address: { address: string } }
	| { Address: { address: string } }
	| { address: string }
	| { $kind: string; [key: string]: unknown };

export const summarizeSimulation = (
	transaction: CoreTransactionForSummary,
	userAddress: string,
): SimSummary => {
	const normalizedUser = normalizeAddress(userAddress);
	const sends: SimSummary["sends"] = [];
	const receives: SimSummary["receives"] = [];

	for (const change of transaction.balanceChanges ?? []) {
		const amount = BigInt(change.amount);
		const address = normalizeAddress(change.address);

		if (address === normalizedUser && amount < 0n) {
			sends.push({
				coinType: change.coinType,
				amount: change.amount,
				to: inferCoinRecipient(transaction, change.coinType, normalizedUser),
			});
		} else if (address === normalizedUser && amount > 0n) {
			receives.push({ coinType: change.coinType, amount: change.amount });
		}
	}

	const objectsLeaving = (transaction.effects?.changedObjects ?? [])
		.filter((object) => isObjectLeavingUser(object, normalizedUser))
		.map((object) => ({
			objectId: object.objectId,
			type: transaction.objectTypes?.[object.objectId],
			to: ownerAddress(object.outputOwner) ?? undefined,
		}));

	const failed = transaction.status.success
		? undefined
		: { error: transaction.status.error };
	const risk = failed
		? [
				{
					level: "block" as const,
					reason: `Simulation failed: ${failed.error}`,
				},
			]
		: [];

	return {
		sends,
		receives,
		objectsLeaving,
		gas: totalGas(transaction.effects?.gasUsed ?? null),
		risk,
		...(failed ? { failed } : {}),
	};
};

const inferCoinRecipient = (
	transaction: CoreTransactionForSummary,
	coinType: string,
	userAddress: string,
): string | undefined => {
	const recipient = (transaction.balanceChanges ?? []).find((change) => {
		const amount = BigInt(change.amount);
		return (
			change.coinType === coinType &&
			normalizeAddress(change.address) !== userAddress &&
			amount > 0n
		);
	});

	return recipient?.address;
};

const isObjectLeavingUser = (
	object: NonNullable<
		NonNullable<CoreTransactionForSummary["effects"]>["changedObjects"]
	>[number],
	userAddress: string,
): boolean => {
	const inputOwner = ownerAddress(object.inputOwner);
	const outputOwner = ownerAddress(object.outputOwner);

	if (inputOwner !== userAddress) {
		return false;
	}

	return (
		object.idOperation === "Deleted" ||
		object.outputState === "DoesNotExist" ||
		(outputOwner !== null && outputOwner !== userAddress)
	);
};

const ownerAddress = (owner: CoreObjectOwner | null): string | null => {
	if (!owner) {
		return null;
	}

	if (
		"Address" in owner &&
		owner.Address &&
		typeof owner.Address === "object"
	) {
		const address = (owner.Address as { address?: unknown }).address;
		return typeof address === "string" ? normalizeAddress(address) : null;
	}

	if ("address" in owner && typeof owner.address === "string") {
		return normalizeAddress(owner.address);
	}

	return null;
};

const totalGas = (
	gasUsed: NonNullable<CoreTransactionForSummary["effects"]>["gasUsed"] | null,
): string => {
	if (!gasUsed) {
		return "0";
	}

	return (
		BigInt(gasUsed.computationCost) +
		BigInt(gasUsed.storageCost) -
		BigInt(gasUsed.storageRebate)
	).toString();
};

const normalizeAddress = (address: string): string => address.toLowerCase();
