import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
	type CoreTransactionForSummary,
	type SimSummary,
	summarizeSimulation,
} from "./sim-summary";

export const TESTNET_GRPC_URL = "https://fullnode.testnet.sui.io:443";

type CoreSimulationResult =
	| {
			$kind: "Transaction";
			Transaction: CoreTransactionForSummary;
			FailedTransaction?: never;
	  }
	| {
			$kind: "FailedTransaction";
			Transaction?: never;
			FailedTransaction: CoreTransactionForSummary;
	  };

export type CoreSimulationClient = {
	core: {
		simulateTransaction(input: {
			transaction: Uint8Array | object;
			include: { balanceChanges: true; effects: true; objectTypes: true };
		}): Promise<CoreSimulationResult>;
	};
};

export const createTestnetGrpcClient = (): SuiGrpcClient =>
	new SuiGrpcClient({ baseUrl: TESTNET_GRPC_URL, network: "testnet" });

export const simulateTransactionToSummary = async ({
	client,
	transaction,
	userAddress,
}: {
	client: CoreSimulationClient;
	transaction: Uint8Array | object;
	userAddress: string;
}): Promise<SimSummary> => {
	const result = await client.core.simulateTransaction({
		transaction,
		include: { balanceChanges: true, effects: true, objectTypes: true },
	});
	const simulated = result.Transaction ?? result.FailedTransaction;

	return summarizeSimulation(simulated, userAddress);
};
