import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";

export const requestTestnetFaucet = async (recipient: string): Promise<void> => {
	await requestSuiFromFaucetV2({
		host: getFaucetHost("testnet"),
		recipient,
	});
};
