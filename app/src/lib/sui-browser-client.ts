import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export type WalletNetwork = "testnet" | "mainnet";

export const createBrowserSuiClient = (
	network: WalletNetwork = "testnet",
): SuiJsonRpcClient =>
	new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network), network });
