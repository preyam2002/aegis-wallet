/**
 * Shell-only proof that the functional wallet's send path works against live testnet —
 * exercises the EXACT functions SendModal calls (no browser):
 *   previewSend  → builds the PTB, dry-runs it live, runs the risk scanner
 *   executeSend  → signs and broadcasts, returns a real digest
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSuiBalance } from "@aegis/shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import { fromBase64 } from "@mysten/sui/utils";
import { executeSend, previewSend } from "../app/src/lib/send-flow";
import { createBrowserSuiClient } from "../app/src/lib/sui-browser-client";
import { buildDefaultWalletPolicy } from "../app/src/lib/wallet-policy";

const client = createBrowserSuiClient("testnet");
const wallet = loadLocalWallet();
const sender = wallet.activeKeypair.toSuiAddress();
const recipient =
	process.env.AEGIS_TEST_SEND_RECIPIENT ??
	wallet.addresses.find((address) => address !== sender) ??
	sender;
const amountMist = BigInt(process.env.AEGIS_SEND_MIST ?? "1000");
const execute = process.env.AEGIS_WALLET_SMOKE_EXECUTE !== "false";

const { totalBalance } = await getSuiBalance(sender);
const totalMist = BigInt(totalBalance);
const intent = { recipientAddress: recipient, amountMist };

const { analysis } = await previewSend({
	client,
	sender,
	intent,
	totalMist,
	policy: buildDefaultWalletPolicy(),
	addressBook: [],
});

const preview = {
	sender,
	recipient,
	amountMist: amountMist.toString(),
	totalMist: totalMist.toString(),
	riskLevel: analysis.riskLevel,
	summary: analysis.summary,
	netMist: analysis.netMist.toString(),
	gasMist: analysis.gasMist.toString(),
	findings: analysis.findings.map((f) => ({ kind: f.kind, title: f.title })),
};

let execution: unknown = "skipped (AEGIS_WALLET_SMOKE_EXECUTE=false)";
if (execute) {
	execution = await executeSend({
		client,
		signer: wallet.activeKeypair,
		intent,
	});
}

console.log(JSON.stringify({ preview, execution }, null, 2));

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
