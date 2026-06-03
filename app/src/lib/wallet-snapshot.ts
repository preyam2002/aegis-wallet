import {
	fetchSuiUsdPrice as defaultFetchSuiUsdPrice,
	loadTokenMetadata as defaultLoadTokenMetadata,
	listRecentActivityRows,
	loadStakingOverview,
	loadWalletPortfolio,
	type StakingOverview,
	type TokenMetadata,
	type TokenPriceQuote,
	valuePortfolioTokens,
	type WalletActivityRow,
	type WalletPortfolio,
} from "@aegis/shared";

export type DashboardPortfolioRow = {
	symbol: string;
	name: string;
	amount: string;
	value: string;
	priced: boolean;
};

export type DashboardActivityRow = {
	id: string;
	label: string;
	value: string;
	status: "Passed" | "Failed";
};

export type DashboardNftRow = {
	id: string;
	name: string;
	collection: string;
	imageUrl?: string;
};

export type DashboardDefiRow = {
	id: string;
	protocol: string;
	label: string;
	value: string;
};

export type DashboardStakingRow = {
	id: string;
	validator: string;
	status: string;
	principal: string;
	rewards: string;
};

export type LiveWalletSnapshot = {
	address: string;
	totalUsdValue: string;
	portfolioRows: DashboardPortfolioRow[];
	activityRows: DashboardActivityRow[];
	nftRows: DashboardNftRow[];
	defiRows: DashboardDefiRow[];
	stakingRows: DashboardStakingRow[];
	activeValidatorCount: number;
	capabilityCount: number;
	otherObjectCount: number;
};

export type LiveWalletSnapshotLoaders = {
	loadPortfolio?: (address: string) => Promise<WalletPortfolio>;
	fetchSuiUsdPrice?: () => Promise<TokenPriceQuote>;
	loadTokenMetadata?: (
		tokens: { coinType: string }[],
	) => Promise<TokenMetadata[]>;
	listActivity?: (address: string) => Promise<WalletActivityRow[]>;
	loadStaking?: (address: string) => Promise<StakingOverview>;
};

export const loadLiveWalletSnapshot = async (
	address: string,
	{
		loadPortfolio: portfolioLoader = loadWalletPortfolio,
		fetchSuiUsdPrice = defaultFetchSuiUsdPrice,
		loadTokenMetadata = defaultLoadTokenMetadata,
		listActivity = (walletAddress: string) =>
			listRecentActivityRows(walletAddress, { limit: 10 }),
		loadStaking = loadStakingOverview,
	}: LiveWalletSnapshotLoaders = {},
): Promise<LiveWalletSnapshot> => {
	const [portfolio, suiUsdPrice, activity, staking] = await Promise.all([
		portfolioLoader(address),
		fetchSuiUsdPrice(),
		listActivity(address),
		loadStaking(address),
	]);
	const tokenMetadata = await loadTokenMetadata(portfolio.tokens);
	const valuedTokens = valuePortfolioTokens(
		portfolio.tokens,
		[suiUsdPrice],
		tokenMetadata,
	);

	return {
		address,
		totalUsdValue: formatUsd(
			valuedTokens.reduce(
				(sum, token) => sum + Number(token.usdValue ?? "0"),
				0,
			),
		),
		portfolioRows: valuedTokens.map((token) => ({
			symbol: token.symbol,
			name: token.name ?? token.symbol,
			amount: token.amount,
			value: token.usdValue ? `$${token.usdValue}` : "Unpriced",
			priced: Boolean(token.usdValue),
		})),
		activityRows: activity.map((row) => ({
			id: row.id,
			label: row.label,
			value: activityValue(row),
			status: row.status === "failure" ? "Failed" : "Passed",
		})),
		nftRows: portfolio.collectibles.map((item) => ({
			id: item.objectId,
			name: item.displayName,
			collection: typeName(item.type),
			...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
		})),
		defiRows: portfolio.defiPositions.map((item) => ({
			id: item.objectId,
			protocol: typeModule(item.type),
			label: item.displayName,
			value: item.objectId,
		})),
		stakingRows: staking.positions.map((position) => ({
			id: position.stakedSuiId,
			validator:
				position.validatorName ?? shortAddress(position.validatorAddress),
			status: position.status,
			principal: `${formatMist(position.principalMist)} SUI`,
			rewards: `${formatMist(position.estimatedRewardMist)} SUI`,
		})),
		activeValidatorCount: staking.activeValidatorCount,
		capabilityCount: portfolio.capabilities.length,
		otherObjectCount: portfolio.otherObjects.length,
	};
};

const activityValue = (row: WalletActivityRow): string => {
	const prefix =
		row.direction === "inbound" ? "+" : row.direction === "outbound" ? "-" : "";
	const symbol = row.coinType === "0x2::sui::SUI" ? "SUI" : "coins";
	return `${prefix}${formatMist(row.amountMist)} ${symbol}`;
};

const formatMist = (amountMist: string): string =>
	formatBaseUnits(amountMist, 9);

const formatBaseUnits = (rawAmount: string, decimals: number): string => {
	const value = BigInt(rawAmount);
	if (decimals === 0) {
		return value.toString();
	}

	const divisor = 10n ** BigInt(decimals);
	const whole = value / divisor;
	const fractional = (value % divisor).toString().padStart(decimals, "0");
	const trimmedFractional = fractional.replace(/0+$/, "");

	return trimmedFractional.length > 0
		? `${whole}.${trimmedFractional}`
		: whole.toString();
};

const formatUsd = (value: number): string =>
	`$${(Math.round(value * 100) / 100).toFixed(2)}`;

const typeName = (type: string): string =>
	type.split("::").at(-1)?.replace(/[<>]/g, "") ?? type;

const typeModule = (type: string): string => type.split("::").at(-2) ?? type;

const shortAddress = (address: string): string =>
	address.length > 18
		? `${address.slice(0, 10)}...${address.slice(-8)}`
		: address;
