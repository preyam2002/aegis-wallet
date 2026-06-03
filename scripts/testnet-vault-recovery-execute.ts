import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	createRecoverableVaultAccount,
	createTestnetGrpcClient,
	NodePasskeyProvider,
} from "@aegis/shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { Transaction } from "@mysten/sui/transactions";

const client = createTestnetGrpcClient();
const recipient =
	process.env.AEGIS_TEST_RECIPIENT ??
	"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const passkeyProvider = await NodePasskeyProvider.create(
	"aegis-testnet-recoverable-vault",
);
const passkey = await PasskeyKeypair.getPasskeyInstance(
	passkeyProvider,
	"aegis-testnet-recoverable-vault",
);
const enclave = Ed25519Keypair.fromSecretKey(hexToBytes("07".repeat(32)));
const recovery = Ed25519Keypair.fromSecretKey(hexToBytes("08".repeat(32)));
const vault = createRecoverableVaultAccount({
	passkeyPublicKey: passkey.getPublicKey(),
	enclavePublicKey: enclave.getPublicKey(),
	recoveryPublicKey: recovery.getPublicKey(),
});

await ensureFunded(vault.address);

const tx = new Transaction();
tx.setSender(vault.address);
const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
tx.transferObjects([coin], tx.pure.address(recipient));
const txBytes = await tx.build({ client });
const { signature: passkeySig } = await passkey.signTransaction(txBytes);
const { signature: recoverySig } = await recovery.signTransaction(txBytes);
const combined = vault.publicKey.combinePartialSignatures([
	passkeySig,
	recoverySig,
]);
const result = await client.core.executeTransaction({
	transaction: txBytes,
	signatures: [combined],
	include: { effects: true, transaction: true },
});
const txn = result.Transaction ?? result.FailedTransaction;

if (!txn.status.success) {
	throw new Error(
		`recoverable vault escape transaction failed: ${txn.status.error}`,
	);
}

console.log(
	JSON.stringify(
		{
			network: "testnet",
			vaultAddress: vault.address,
			digest: txn.digest,
			recipient,
			status: txn.status,
			signers: "passkey+recovery-ed25519",
		},
		null,
		2,
	),
);

async function ensureFunded(address: string) {
	const { balance } = await client.core.getBalance({ owner: address });
	if (BigInt(balance.balance) > 20_000_000n) {
		return;
	}

	fundFromLocalWallet(address);

	for (let attempt = 0; attempt < 20; attempt += 1) {
		const next = await client.core.getBalance({ owner: address });
		if (BigInt(next.balance.balance) > 0n) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}

	throw new Error(`funding did not appear for recoverable vault ${address}`);
}

function fundFromLocalWallet(recipientAddress: string) {
	const configPath = createWritableSuiConfig();

	try {
		const coins = JSON.parse(
			execFileSync(
				"sui",
				["client", "--client.config", configPath, "--json", "gas"],
				{
					encoding: "utf8",
				},
			),
		) as { gasCoinId?: string; mistBalance?: string }[];
		const coin = coins
			.filter((candidate) => BigInt(candidate.mistBalance ?? "0") > 50_000_000n)
			.sort((left, right) =>
				Number(
					BigInt(right.mistBalance ?? "0") - BigInt(left.mistBalance ?? "0"),
				),
			)[0];

		if (!coin?.gasCoinId) {
			throw new Error(
				"No local testnet gas coin has enough MIST to fund recoverable vault smoke test",
			);
		}

		execFileSync(
			"sui",
			[
				"client",
				"--client.config",
				configPath,
				"--json",
				"transfer-sui",
				"--to",
				recipientAddress,
				"--sui-coin-object-id",
				coin.gasCoinId,
				"--amount",
				"30000000",
				"--gas-budget",
				"5000000",
			],
			{ encoding: "utf8" },
		);
	} finally {
		rmSync(configPath.replace(/\/client\.yaml$/, ""), {
			recursive: true,
			force: true,
		});
	}
}

function createWritableSuiConfig(): string {
	const sourceDir = join(homedir(), ".sui", "sui_config");
	const tempDir = mkdtempSync(join(tmpdir(), "aegis-sui-config-"));
	const configPath = join(tempDir, "client.yaml");
	const keystorePath = join(tempDir, "sui.keystore");

	copyFileSync(join(sourceDir, "sui.keystore"), keystorePath);
	const config = readFileSync(join(sourceDir, "client.yaml"), "utf8").replace(
		/File: .+sui\.keystore/,
		`File: ${keystorePath}`,
	);
	writeFileSync(configPath, config);

	return configPath;
}

function hexToBytes(hex: string): Uint8Array {
	return Uint8Array.from(Buffer.from(hex, "hex"));
}
