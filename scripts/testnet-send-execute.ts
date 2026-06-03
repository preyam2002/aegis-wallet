import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createTestnetGrpcClient, TESTNET_RPC_URL } from "@aegis/shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { fromBase64 } from "@mysten/sui/utils";
import { buildSendTransaction } from "../app/src/lib/wallet-workflows";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const client = createTestnetGrpcClient();
const amountMist = BigInt(process.env.AEGIS_SEND_MIST ?? "1000");
const gasBudgetMist = BigInt(process.env.AEGIS_SEND_GAS_MIST ?? "10000000");
const localWallet = loadLocalWallet();
const sender = localWallet.activeKeypair.toSuiAddress();
const recipient =
	process.env.AEGIS_TEST_SEND_RECIPIENT ??
	localWallet.addresses.find((address) => address !== sender);

if (!recipient) {
	throw new Error(
		"set AEGIS_TEST_SEND_RECIPIENT or add a second local testnet address to prove native send execution",
	);
}
assertAddress(recipient);
await ensureSpendable(sender, amountMist + gasBudgetMist);

const beforeSenderBalance = await getMistBalance(sender);
const beforeRecipientBalance =
	recipient === sender ? beforeSenderBalance : await getMistBalance(recipient);

const tx = buildSendTransaction({
	recipientAddress: recipient,
	amountMist,
});
tx.setSender(sender);
tx.setGasBudget(gasBudgetMist);

const result = await localWallet.activeKeypair.signAndExecuteTransaction({
	transaction: tx,
	client,
	include: { effects: true, transaction: true },
});
const txn = result.Transaction ?? result.FailedTransaction;

if (!txn.status.success) {
	throw new Error(`send transaction failed: ${txn.status.error}`);
}

const balanceChanges = await getTransactionBalanceChanges(txn.digest);
const recipientChange = balanceChanges.find(
	(change) => change.owner === recipient && change.coinType === SUI_COIN_TYPE,
);
const senderChange = balanceChanges.find(
	(change) => change.owner === sender && change.coinType === SUI_COIN_TYPE,
);

if (BigInt(recipientChange?.amount ?? "0") !== amountMist) {
	throw new Error(
		`send transaction did not credit recipient ${recipient} with ${amountMist.toString()} MIST`,
	);
}
if (BigInt(senderChange?.amount ?? "0") >= 0n) {
	throw new Error("send transaction did not debit the sender");
}

const afterSenderBalance = await getMistBalance(sender);
const afterRecipientBalance =
	recipient === sender ? afterSenderBalance : await getMistBalance(recipient);

console.log(
	JSON.stringify(
		{
			network: "testnet",
			sender,
			recipient,
			amountMist: amountMist.toString(),
			gasBudgetMist: gasBudgetMist.toString(),
			digest: txn.digest,
			status: txn.status,
			balanceChanges,
			beforeSenderBalance: beforeSenderBalance.toString(),
			afterSenderBalance: afterSenderBalance.toString(),
			beforeRecipientBalance: beforeRecipientBalance.toString(),
			afterRecipientBalance: afterRecipientBalance.toString(),
		},
		null,
		2,
	),
);

async function ensureSpendable(address: string, requiredMist: bigint) {
	const balance = await getMistBalance(address);
	if (balance >= requiredMist) {
		return;
	}

	throw new Error(
		`testnet balance for ${address} is ${balance.toString()} MIST, below required ${requiredMist.toString()} MIST`,
	);
}

async function getMistBalance(owner: string): Promise<bigint> {
	const { balance } = await client.core.getBalance({ owner });
	return BigInt(balance.balance);
}

async function getTransactionBalanceChanges(
	digest: string,
): Promise<BalanceChange[]> {
	let lastError = "";
	for (let attempt = 0; attempt < 10; attempt += 1) {
		try {
			return await fetchTransactionBalanceChanges(digest);
		} catch (error) {
			lastError = String(error);
			await new Promise((resolve) => setTimeout(resolve, 1_000));
		}
	}

	throw new Error(
		`transaction effects RPC did not return balance changes for ${digest}: ${lastError}`,
	);
}

async function fetchTransactionBalanceChanges(
	digest: string,
): Promise<BalanceChange[]> {
	const response = await fetch(TESTNET_RPC_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "sui_getTransactionBlock",
			params: [digest, { showBalanceChanges: true }],
		}),
	});
	if (!response.ok) {
		throw new Error(
			`transaction effects RPC failed with HTTP ${response.status}`,
		);
	}

	const body = (await response.json()) as {
		result?: {
			balanceChanges?: {
				owner?: { AddressOwner?: string };
				coinType?: string;
				amount?: string;
			}[];
		};
		error?: { message?: string };
	};
	if (body.error) {
		throw new Error(`transaction effects RPC failed: ${body.error.message}`);
	}

	return (body.result?.balanceChanges ?? [])
		.map((change) => ({
			owner: change.owner?.AddressOwner ?? "",
			coinType: change.coinType ?? "",
			amount: change.amount ?? "0",
		}))
		.filter((change) => change.owner && change.coinType);
}

function loadLocalWallet() {
	const config = readFileSync(
		join(homedir(), ".sui", "sui_config", "client.yaml"),
		"utf8",
	);
	const activeAddress = config
		.match(/active[-_]address:\s*"?([^"\n]+)"?/)?.[1]
		?.trim();
	const entries = JSON.parse(
		readFileSync(join(homedir(), ".sui", "sui_config", "sui.keystore"), "utf8"),
	) as string[];
	const keypairs = entries.map(keypairFromLegacyKeystoreEntry);
	const activeKeypair =
		keypairs.find(
			(keypair) =>
				!activeAddress ||
				keypair.toSuiAddress().toLowerCase() === activeAddress.toLowerCase(),
		) ?? keypairs[0];

	if (!activeKeypair) {
		throw new Error("local Sui keystore has no keypairs");
	}

	return {
		activeKeypair,
		addresses: keypairs.map((keypair) => keypair.toSuiAddress()),
	};
}

function keypairFromLegacyKeystoreEntry(entry: string) {
	const bytes = fromBase64(entry);
	const scheme = bytes[0];
	const secretKey = bytes.slice(1);

	if (scheme === 0) {
		return Ed25519Keypair.fromSecretKey(secretKey);
	}
	if (scheme === 1) {
		return Secp256k1Keypair.fromSecretKey(secretKey);
	}
	if (scheme === 2) {
		return Secp256r1Keypair.fromSecretKey(secretKey);
	}

	throw new Error(`unsupported Sui keystore scheme byte ${scheme}`);
}

function assertAddress(address: string) {
	if (!/^0x[0-9a-fA-F]{64}$/.test(address)) {
		throw new Error("expected canonical Sui address");
	}
}

type BalanceChange = {
	owner: string;
	coinType: string;
	amount: string;
};
