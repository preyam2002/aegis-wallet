export type ConsumerCapabilityStatus = "ready" | "gated";

export type ConsumerNetwork = "testnet" | "localnet" | "mainnet";

export type FiatProviderId = "transak" | "banxa" | "moonpay";

export type FiatProvider = {
	id: FiatProviderId;
	label: string;
	requiresKyc: true;
	supports: ("buy" | "sell")[];
	status: ConsumerCapabilityStatus;
};

export type FiatOnrampModel = {
	status: ConsumerCapabilityStatus;
	reason: string;
	providers: FiatProvider[];
};

export type BridgeChain = "sui" | "ethereum" | "solana";

export type BridgeProvider = "sui-bridge" | "wormhole" | "cctp";

export type BridgeRoute = {
	fromChain: BridgeChain;
	toChain: BridgeChain;
	providers: BridgeProvider[];
	status: ConsumerCapabilityStatus;
};

export type BridgeModel = {
	status: ConsumerCapabilityStatus;
	reason: string;
	routes: BridgeRoute[];
};

export type BridgeIntent = {
	fromChain: BridgeChain;
	toChain: BridgeChain;
	asset: string;
	amount: string;
	provider: BridgeProvider;
	riskLevel: "high";
	summary: string;
};

export type AdvancedTradingItemId =
	| "perps"
	| "prediction-markets"
	| "tokenized-stocks"
	| "wallet-chat"
	| "cash-card";

export type AdvancedTradingItem = {
	id: AdvancedTradingItemId;
	label: string;
	status: ConsumerCapabilityStatus;
	requiresHighRiskApproval: boolean;
};

export type AdvancedTradingModel = {
	status: ConsumerCapabilityStatus;
	reason: string;
	items: AdvancedTradingItem[];
};

export function buildFiatOnrampModel({
	activeNetwork,
	providerCredentialsReady,
}: {
	activeNetwork: ConsumerNetwork;
	providerCredentialsReady: boolean;
}): FiatOnrampModel {
	const status =
		activeNetwork === "mainnet" && providerCredentialsReady ? "ready" : "gated";
	const reason =
		activeNetwork === "mainnet"
			? "Provider credentials are required before buy or sell handoff can go live."
			: "Mainnet fiat providers only; testnet and localnet keep buy/sell disabled.";

	return {
		status,
		reason,
		providers: [
			buildFiatProvider("transak", "Transak", status),
			buildFiatProvider("banxa", "Banxa", status),
			buildFiatProvider("moonpay", "MoonPay", status),
		],
	};
}

export function buildBridgeModel({
	activeChain,
	providerRoutesReady,
}: {
	activeChain: BridgeChain;
	providerRoutesReady: boolean;
}): BridgeModel {
	const status = providerRoutesReady ? "ready" : "gated";
	const routes: BridgeRoute[] = [
		{
			fromChain: "sui",
			toChain: "ethereum",
			providers: ["sui-bridge", "wormhole"],
			status,
		},
		{
			fromChain: "ethereum",
			toChain: "sui",
			providers: ["sui-bridge", "wormhole"],
			status,
		},
		{
			fromChain: "sui",
			toChain: "solana",
			providers: ["wormhole"],
			status,
		},
		{
			fromChain: "solana",
			toChain: "sui",
			providers: ["wormhole", "cctp"],
			status,
		},
	];

	return {
		status,
		reason: providerRoutesReady
			? `Bridge routes are enabled for ${chainLabel(activeChain)}.`
			: "Bridge routes need live provider routing, liquidity, and risk checks before execution.",
		routes: routes.filter(
			(route) =>
				route.fromChain === activeChain || route.toChain === activeChain,
		),
	};
}

export function createBridgeIntent(input: {
	fromChain: BridgeChain;
	toChain: BridgeChain;
	asset: string;
	amount: string;
	provider: BridgeProvider;
}): BridgeIntent {
	if (input.fromChain === input.toChain) {
		throw new Error("bridge intent must use different chains");
	}

	const numericAmount = Number(input.amount);
	if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
		throw new Error("bridge amount must be greater than zero");
	}

	return {
		...input,
		riskLevel: "high",
		summary: `${input.amount} ${input.asset} from ${chainLabel(
			input.fromChain,
		)} to ${chainLabel(input.toChain)} through ${providerLabel(input.provider)}`,
	};
}

export function buildAdvancedTradingModel({
	providerCredentialsReady,
	highRiskTradingEnabled,
}: {
	providerCredentialsReady: boolean;
	highRiskTradingEnabled: boolean;
}): AdvancedTradingModel {
	const itemInputs: Omit<AdvancedTradingItem, "status">[] = [
		{
			id: "perps",
			label: "Perps",
			requiresHighRiskApproval: true,
		},
		{
			id: "prediction-markets",
			label: "Prediction markets",
			requiresHighRiskApproval: true,
		},
		{
			id: "tokenized-stocks",
			label: "Tokenized stocks",
			requiresHighRiskApproval: true,
		},
		{
			id: "wallet-chat",
			label: "Wallet chat",
			requiresHighRiskApproval: false,
		},
		{
			id: "cash-card",
			label: "Cash card",
			requiresHighRiskApproval: false,
		},
	];
	const items = itemInputs.map<AdvancedTradingItem>((item) => ({
		...item,
		status:
			providerCredentialsReady &&
			(!item.requiresHighRiskApproval || highRiskTradingEnabled)
				? "ready"
				: "gated",
	}));

	return {
		status: items.every((item) => item.status === "ready") ? "ready" : "gated",
		reason:
			"Provider credentials and explicit high-risk approval are required before these Phantom-class surfaces execute.",
		items,
	};
}

export function chainLabel(chain: BridgeChain): string {
	return {
		sui: "Sui",
		ethereum: "Ethereum",
		solana: "Solana",
	}[chain];
}

function buildFiatProvider(
	id: FiatProviderId,
	label: string,
	status: ConsumerCapabilityStatus,
): FiatProvider {
	return {
		id,
		label,
		requiresKyc: true,
		supports: ["buy", "sell"],
		status,
	};
}

function providerLabel(provider: BridgeProvider): string {
	return {
		"sui-bridge": "Sui Bridge",
		wormhole: "Wormhole",
		cctp: "CCTP",
	}[provider];
}
