import { type DryRunResponseLike, summarizeDryRun } from "@aegis/shared";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
	type AddressBookEntry,
	analyzeSimSummary,
	type TransactionAnalysis,
	type WalletPolicy,
} from "./transaction-analysis";
import { buildSendTransaction, type SendIntent } from "./wallet-workflows";

export type SendAnalysisInput = {
	dryRun: DryRunResponseLike;
	sender: string;
	totalMist: bigint;
	policy: WalletPolicy;
	addressBook: AddressBookEntry[];
	packagesTouched?: string[];
};

/**
 * Pure mapping: a dry-run response for the user's own transaction → the safety
 * verdict the signing screen renders. Reuses the shared dry-run summariser and the
 * existing risk scanner, so the analysis is identical to the unit-tested path.
 */
export const analyzeSend = ({
	dryRun,
	sender,
	totalMist,
	policy,
	addressBook,
	packagesTouched = [],
}: SendAnalysisInput): TransactionAnalysis =>
	analyzeSimSummary({
		walletAddress: sender,
		totalMist,
		summary: summarizeDryRun(dryRun, sender),
		packagesTouched,
		policy,
		addressBook,
	});

export type SendPreview = {
	analysis: TransactionAnalysis;
	bytes: Uint8Array;
};

export type PreviewSendInput = {
	client: SuiJsonRpcClient;
	sender: string;
	intent: SendIntent;
	totalMist: bigint;
	policy: WalletPolicy;
	addressBook: AddressBookEntry[];
	gasBudgetMist?: bigint;
};

/**
 * Build the user's send PTB, dry-run it live, and return the safety analysis plus
 * the built bytes. Uses raw JSON-RPC dryRunTransactionBlock (always available on the
 * public fullnode), never the throttle-prone gRPC simulate path.
 */
export const previewSend = async ({
	client,
	sender,
	intent,
	totalMist,
	policy,
	addressBook,
	gasBudgetMist,
}: PreviewSendInput): Promise<SendPreview> => {
	const tx = buildSendTransaction(intent);
	tx.setSender(sender);
	if (gasBudgetMist !== undefined) {
		tx.setGasBudget(gasBudgetMist);
	}

	const bytes = await tx.build({ client });
	const dryRun = (await client.dryRunTransactionBlock({
		transactionBlock: bytes,
	})) as unknown as DryRunResponseLike;

	return {
		analysis: analyzeSend({ dryRun, sender, totalMist, policy, addressBook }),
		bytes,
	};
};

export type SendResult = {
	digest: string;
	success: boolean;
	error?: string;
};

export type ExecuteSendInput = {
	client: SuiJsonRpcClient;
	signer: Ed25519Keypair;
	intent: SendIntent;
	gasBudgetMist?: bigint;
};

export const executeSend = async ({
	client,
	signer,
	intent,
	gasBudgetMist,
}: ExecuteSendInput): Promise<SendResult> => {
	const tx = buildSendTransaction(intent);
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
