import { type RpcFetcher, suiRpc } from "./testnet-rpc";

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
		suiRpc<DelegatedStake[]>("suix_getStakes", [address], { fetcher }),
		suiRpc<SystemState>("suix_getLatestSuiSystemState", [], { fetcher }),
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
