export type SubAccount = {
	id: string;
	owner: string;
	dapp: string;
	maxMist: bigint;
	spentMist: bigint;
	expiresAtMs: number;
	revoked: boolean;
};

export type CreateSubAccountInput = Omit<SubAccount, "spentMist" | "revoked">;

export const createSubAccount = (input: CreateSubAccountInput): SubAccount => ({
	...input,
	spentMist: 0n,
	revoked: false,
});

export const recordSubAccountSpend = (
	subaccount: SubAccount,
	amountMist: bigint,
	nowMs: number,
): SubAccount => {
	if (subaccount.revoked) {
		throw new Error("subaccount is revoked");
	}
	if (nowMs > subaccount.expiresAtMs) {
		throw new Error("subaccount is expired");
	}
	if (subaccount.spentMist + amountMist > subaccount.maxMist) {
		throw new Error("subaccount spend exceeds scoped budget");
	}

	return {
		...subaccount,
		spentMist: subaccount.spentMist + amountMist,
	};
};

export const revokeSubAccount = (subaccount: SubAccount): SubAccount => ({
	...subaccount,
	revoked: true,
});
