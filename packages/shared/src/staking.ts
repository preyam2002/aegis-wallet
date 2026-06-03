import { type RpcFetcher, TESTNET_RPC_URL } from "./testnet-rpc";

export type StakeStatus = "active" | "pending" | "inactive";

export type WalletStakePosition = {
	validatorAddress: string;
	validatorName?: string;
	stakingPool?: string;
	stakedSuiId: string;
	principalMist: string;
	estimatedRewardMist: string;
	status: StakeStatus;
	stakeActiveEpoch?: string;
};

export type ActiveValidatorSummary = {
	address: string;
	name?: string;
	stakingPoolSuiBalance: string;
};

export type StakingOverview = {
	epoch?: string;
	positions: WalletStakePosition[];
	activeValidatorCount: number;
	topValidators: ActiveValidatorSummary[];
};

type JsonRpcResponse<T> = {
	jsonrpc: "2.0";
	id: number;
	result?: T;
	error?: { code: number; message: string };
};

type DelegatedStake = {
	validatorAddress: string;
	stakingPool?: string;
	stakes?: {
		stakedSuiId: string;
		principal: string;
		status: string;
		estimatedReward?: string;
		stakeActiveEpoch?: string;
	}[];
};

type SystemState = {
	epoch?: string;
	activeValidators?: {
		suiAddress?: string;
		name?: string;
		stakingPoolSuiBalance?: string;
	}[];
};

export const loadStakingOverview = async (
	address: string,
	{
		fetcher = fetch,
		validatorLimit = 5,
	}: {
		fetcher?: RpcFetcher;
		validatorLimit?: number;
	} = {},
): Promise<StakingOverview> => {
	const [delegations, systemState] = await Promise.all([
		rpc<DelegatedStake[]>("suix_getStakes", [address], fetcher),
		rpc<SystemState>("suix_getLatestSuiSystemState", [], fetcher),
	]);
	const validators = normalizeValidators(systemState).sort((left, right) =>
		compareBigIntStrings(
			right.stakingPoolSuiBalance,
			left.stakingPoolSuiBalance,
		),
	);
	const validatorsByAddress = new Map(
		validators.map((validator) => [validator.address, validator] as const),
	);

	return {
		...(systemState.epoch ? { epoch: systemState.epoch } : {}),
		positions: delegations.flatMap((delegation) =>
			(delegation.stakes ?? []).map((stake) => {
				const validator = validatorsByAddress.get(delegation.validatorAddress);

				return {
					validatorAddress: delegation.validatorAddress,
					...(validator?.name ? { validatorName: validator.name } : {}),
					...(delegation.stakingPool
						? { stakingPool: delegation.stakingPool }
						: {}),
					stakedSuiId: stake.stakedSuiId,
					principalMist: stake.principal,
					estimatedRewardMist: stake.estimatedReward ?? "0",
					status: normalizeStakeStatus(stake.status),
					...(stake.stakeActiveEpoch
						? { stakeActiveEpoch: stake.stakeActiveEpoch }
						: {}),
				};
			}),
		),
		activeValidatorCount: validators.length,
		topValidators: validators.slice(0, validatorLimit),
	};
};

const normalizeValidators = (
	systemState: SystemState,
): ActiveValidatorSummary[] =>
	(systemState.activeValidators ?? [])
		.filter((validator) => typeof validator.suiAddress === "string")
		.map((validator) => ({
			address: validator.suiAddress as string,
			...(validator.name ? { name: validator.name } : {}),
			stakingPoolSuiBalance: validator.stakingPoolSuiBalance ?? "0",
		}));

const normalizeStakeStatus = (status: string): StakeStatus => {
	const normalized = status.toLowerCase();
	if (normalized === "active") {
		return "active";
	}
	if (normalized === "pending") {
		return "pending";
	}

	return "inactive";
};

const compareBigIntStrings = (left: string, right: string): number => {
	const delta = BigInt(left) - BigInt(right);
	if (delta > 0n) {
		return 1;
	}
	if (delta < 0n) {
		return -1;
	}

	return 0;
};

const rpc = async <T>(
	method: string,
	params: unknown[],
	fetcher: RpcFetcher,
): Promise<T> => {
	const response = await fetcher(TESTNET_RPC_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});

	if (!response.ok) {
		throw new Error(`Sui RPC ${method} failed with HTTP ${response.status}`);
	}

	const body = (await response.json()) as JsonRpcResponse<T>;
	if (body.error) {
		throw new Error(`Sui RPC ${method} failed: ${body.error.message}`);
	}
	if (!body.result) {
		throw new Error(`Sui RPC ${method} returned no result`);
	}

	return body.result;
};
