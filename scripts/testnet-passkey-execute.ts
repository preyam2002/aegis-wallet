import { createTestnetGrpcClient, NodePasskeyProvider } from "@aegis/shared";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { Transaction } from "@mysten/sui/transactions";
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

const client = createTestnetGrpcClient();
const provider = await NodePasskeyProvider.create();
const signer = await PasskeyKeypair.getPasskeyInstance(provider);
const address = signer.toSuiAddress();

await ensureFunded(address);

const tx = new Transaction();
tx.setSender(address);
const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
tx.transferObjects([coin], tx.pure.address(address));

const result = await signer.signAndExecuteTransaction({ transaction: tx, client });
const txn = result.Transaction ?? result.FailedTransaction;

if (!txn.status.success) {
  throw new Error(`Passkey transaction failed: ${txn.status.error}`);
}

console.log(
  JSON.stringify(
    {
      network: "testnet",
      address,
      digest: txn.digest,
      status: txn.status,
      signerScheme: signer.getKeyScheme(),
      credentialIdLength: signer.getCredentialId()?.length ?? 0,
    },
    null,
    2,
  ),
);

async function ensureFunded(address: string) {
  const startingBalance = await getMistBalance(address);
  if (startingBalance > 0n) {
    return;
  }

  try {
    await requestSuiFromFaucetV2({
      host: getFaucetHost("testnet"),
      recipient: address,
    });
  } catch (error) {
    await fundFromLocalWallet(address);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const balance = await getMistBalance(address);
    if (balance > 0n) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Faucet funding did not appear for ${address}`);
}

async function getMistBalance(owner: string): Promise<bigint> {
  const { balance } = await client.core.getBalance({ owner });
  return BigInt(balance.balance);
}

function fundFromLocalWallet(recipient: string) {
  const configPath = createWritableSuiConfig();

  try {
    const coins = JSON.parse(
      execFileSync("sui", ["client", "--client.config", configPath, "--json", "gas"], {
        encoding: "utf8",
      }),
    ) as { gasCoinId?: string; mistBalance?: string }[];
    const coin = coins
      .filter((candidate) => BigInt(candidate.mistBalance ?? "0") > 20_000_000n)
      .sort((left, right) => Number(BigInt(right.mistBalance ?? "0") - BigInt(left.mistBalance ?? "0")))[0];

    if (!coin?.gasCoinId) {
      throw new Error("No local testnet gas coin has enough MIST to fund passkey smoke test");
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
        recipient,
        "--sui-coin-object-id",
        coin.gasCoinId,
        "--amount",
        "10000000",
        "--gas-budget",
        "5000000",
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(configPath.replace(/\/client\.yaml$/, ""), { recursive: true, force: true });
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
