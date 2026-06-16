import { type DryRunResponseLike, summarizeDryRun } from "@aegis/shared";
import type { Signer } from "@mysten/sui/cryptography";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { SendPreview, SendResult } from "./send-flow";
import {
	type AddressBookEntry,
	analyzeSimSummary,
	type WalletPolicy,
} from "./transaction-analysis";
import { buildStakeTransaction, type StakeIntent } from "./wallet-workflows";

// Native staking calls the system package; mark it touched so the scanner knows.
const SYSTEM_STAKE_PACKAGE = "0x3";

export type PreviewStakeInput = {
	client: SuiJsonRpcClient;
	sender: string;
	intent: StakeIntent;
	totalMist: bigint;
	policy: WalletPolicy;
	addressBook: AddressBookEntry[];
	gasBudgetMist?: bigint;
};

export const previewStake = async ({
	client,
	sender,
	intent,
	totalMist,
	policy,
	addressBook,
	gasBudgetMist,
}: PreviewStakeInput): Promise<SendPreview> => {
	const tx = buildStakeTransaction(intent);
	tx.setSender(sender);
	if (gasBudgetMist !== undefined) {
		tx.setGasBudget(gasBudgetMist);
	}

	const bytes = await tx.build({ client });
	const dryRun = (await client.dryRunTransactionBlock({
		transactionBlock: bytes,
	})) as unknown as DryRunResponseLike;

	return {
		analysis: analyzeSimSummary({
			walletAddress: sender,
			totalMist,
			summary: summarizeDryRun(dryRun, sender),
			packagesTouched: [SYSTEM_STAKE_PACKAGE],
			policy,
			addressBook,
		}),
		bytes,
	};
};

export type ExecuteStakeInput = {
	client: SuiJsonRpcClient;
	signer: Signer;
	intent: StakeIntent;
	gasBudgetMist?: bigint;
};

export const executeStake = async ({
	client,
	signer,
	intent,
	gasBudgetMist,
}: ExecuteStakeInput): Promise<SendResult> => {
	const tx = buildStakeTransaction(intent);
	tx.setSender(signer.toSuiAddress());
	if (gasBudgetMist !== undefined) {
		tx.setGasBudget(gasBudgetMist);
	}

	const result = await client.signAndExecuteTransaction({
		transaction: tx,
		signer,
		options: { showEffects: true },
	});
	const status = result.effects?.status;
	const success = status?.status === "success";

	return {
		digest: result.digest,
		success,
		...(success ? {} : { error: status?.error ?? "transaction failed" }),
	};
};
