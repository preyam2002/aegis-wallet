export type WalletNetworkId = "testnet" | "localnet" | "mainnet";

export type WalletNetwork = {
	id: WalletNetworkId;
	label: string;
	rpcUrl: string;
	faucetUrl?: string;
	spendPolicy: "allowed" | "requires-explicit-approval";
};

export type NetworkSettingsModel = {
	activeNetwork: WalletNetwork;
	networks: WalletNetwork[];
	mainnetSpendApproved: boolean;
};

export type NetworkSpendPolicy = {
	canSpend: boolean;
	reason: string;
};

type NetworkSettingsInput = {
	activeNetwork?: WalletNetworkId;
	allowMainnetSpend?: boolean;
	testnetRpcUrl?: string;
	localnetRpcUrl?: string;
	localnetFaucetUrl?: string;
	mainnetRpcUrl?: string;
};

export function buildNetworkSettingsModel({
	activeNetwork = "testnet",
	allowMainnetSpend = false,
	testnetRpcUrl = "https://fullnode.testnet.sui.io:443",
	localnetRpcUrl = "http://127.0.0.1:9000",
	localnetFaucetUrl = "http://127.0.0.1:9123",
	mainnetRpcUrl = "https://fullnode.mainnet.sui.io:443",
}: NetworkSettingsInput = {}): NetworkSettingsModel {
	const networks: WalletNetwork[] = [
		{
			id: "testnet",
			label: "Sui Testnet",
			rpcUrl: testnetRpcUrl,
			spendPolicy: "allowed",
		},
		{
			id: "localnet",
			label: "Localnet",
			rpcUrl: localnetRpcUrl,
			faucetUrl: localnetFaucetUrl,
			spendPolicy: "allowed",
		},
		{
			id: "mainnet",
			label: "Sui Mainnet",
			rpcUrl: mainnetRpcUrl,
			spendPolicy: "requires-explicit-approval",
		},
	];

	return {
		activeNetwork:
			networks.find((network) => network.id === activeNetwork) ?? networks[0],
		networks,
		mainnetSpendApproved: allowMainnetSpend,
	};
}

export function canSwitchNetwork(
	model: NetworkSettingsModel,
	networkId: string,
): boolean {
	return model.networks.some((network) => network.id === networkId);
}

export function getNetworkSpendPolicy(
	model: NetworkSettingsModel,
	networkId: WalletNetworkId,
): NetworkSpendPolicy {
	const network = model.networks.find((entry) => entry.id === networkId);
	if (!network) {
		return {
			canSpend: false,
			reason: "Network is not configured.",
		};
	}
	if (network.id === "mainnet" && !model.mainnetSpendApproved) {
		return {
			canSpend: false,
			reason: "Mainnet spending requires explicit approval.",
		};
	}
	if (network.id === "localnet") {
		return {
			canSpend: true,
			reason: "Localnet spending is allowed for disposable integration tests.",
		};
	}
	return {
		canSpend: true,
		reason: "Network spending is allowed by the current wallet policy.",
	};
}
