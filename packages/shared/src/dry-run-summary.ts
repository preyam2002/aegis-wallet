import type { SimSummary } from "./sim-summary";

export type DryRunOwner =
	| { AddressOwner: string }
	| { ObjectOwner: string }
	| { Shared: unknown }
	| string;

export type DryRunBalanceChange = {
	owner: DryRunOwner;
	coinType: string;
	amount: string;
};

export type DryRunObjectChange = {
	type: string;
	sender?: string;
	recipient?: DryRunOwner;
	objectType?: string;
	objectId?: string;
};

export type DryRunGasUsed = {
	computationCost: string;
	storageCost: string;
	storageRebate: string;
	nonRefundableStorageFee?: string;
};

export type DryRunResponseLike = {
	effects: {
		status: { status: "success" } | { status: "failure"; error?: string };
		gasUsed?: DryRunGasUsed;
	};
	balanceChanges?: DryRunBalanceChange[];
	objectChanges?: DryRunObjectChange[];
};

const OBJECT_LEAVING_TYPES = new Set(["transferred", "deleted", "wrapped"]);

export const summarizeDryRun = (
	response: DryRunResponseLike,
	userAddress: string,
): SimSummary => {
	const user = normalizeAddress(userAddress);
	const sends: SimSummary["sends"] = [];
	const receives: SimSummary["receives"] = [];

	for (const change of response.balanceChanges ?? []) {
		const owner = ownerAddress(change.owner);
		if (owner !== user) {
			continue;
		}

		const amount = BigInt(change.amount);
		if (amount < 0n) {
			sends.push({
				coinType: change.coinType,
				amount: change.amount,
				to: inferRecipient(response, change.coinType, user),
			});
		} else if (amount > 0n) {
			receives.push({ coinType: change.coinType, amount: change.amount });
		}
	}

	const objectsLeaving = (response.objectChanges ?? [])
		.filter(
			(change) =>
				OBJECT_LEAVING_TYPES.has(change.type) &&
				typeof change.objectId === "string" &&
				change.sender !== undefined &&
				normalizeAddress(change.sender) === user,
		)
		.map((change) => {
			const to = change.recipient ? ownerAddress(change.recipient) : null;
			return {
				objectId: change.objectId as string,
				...(change.objectType ? { type: change.objectType } : {}),
				...(to ? { to } : {}),
			};
		});

	const failed =
		response.effects.status.status === "failure"
			? { error: response.effects.status.error ?? "Simulation failed" }
			: undefined;
	const risk: SimSummary["risk"] = failed
		? [{ level: "block", reason: `Simulation failed: ${failed.error}` }]
		: [];

	return {
		sends,
		receives,
		objectsLeaving,
		gas: totalGas(response.effects.gasUsed),
		risk,
		...(failed ? { failed } : {}),
	};
};

const inferRecipient = (
	response: DryRunResponseLike,
	coinType: string,
	user: string,
): string | undefined => {
	const recipient = (response.balanceChanges ?? []).find((change) => {
		const owner = ownerAddress(change.owner);
		return (
			change.coinType === coinType &&
			owner !== null &&
			owner !== user &&
			BigInt(change.amount) > 0n
		);
	});

	if (!recipient) {
		return undefined;
	}

	return ownerAddress(recipient.owner) ?? undefined;
};

const ownerAddress = (owner: DryRunOwner): string | null => {
	if (typeof owner === "string") {
		return null;
	}
	if ("AddressOwner" in owner && typeof owner.AddressOwner === "string") {
		return normalizeAddress(owner.AddressOwner);
	}
	return null;
};

const totalGas = (gasUsed: DryRunGasUsed | undefined): string => {
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
