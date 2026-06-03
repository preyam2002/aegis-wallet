import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createTestnetGrpcClient, NodePasskeyProvider } from "@aegis/shared";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { MultiSigPublicKey } from "@mysten/sui/multisig";
import { Transaction } from "@mysten/sui/transactions";

type CoSignResponse =
  | { ok: true; enclaveSig: string }
  | { ok: false; reason: string; rejectionReceipt?: string };

const client = createTestnetGrpcClient();
const LIVE_POLICY_OBJECT_ID =
  process.env.AEGIS_POLICY_OBJECT_ID ??
  "0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea";
const LIVE_POLICY_ALLOWED_RECIPIENT =
  process.env.AEGIS_TEST_RECIPIENT ??
  "0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const SEEDED_DRAIN_RECIPIENT = "0x000000000000000000000000000000000000000000000000000000000000dEaD";
const enclaveSeedHex = "07".repeat(32);
const enclaveKeypair = Ed25519Keypair.fromSecretKey(hexToBytes(enclaveSeedHex));
const passkeyProvider = await NodePasskeyProvider.create("aegis-testnet-vault");
const passkey = await PasskeyKeypair.getPasskeyInstance(passkeyProvider, "aegis-testnet-vault");
const multisig = MultiSigPublicKey.fromPublicKeys({
  threshold: 2,
  publicKeys: [
    { publicKey: passkey.getPublicKey(), weight: 1 },
    { publicKey: enclaveKeypair.getPublicKey(), weight: 1 },
  ],
});
const vaultAddress = multisig.toSuiAddress();

await ensureFunded(vaultAddress);

const port = "3319";
const server = spawn("cargo", ["run", "--quiet"], {
  cwd: new URL("../enclave/", import.meta.url),
  env: {
    ...process.env,
    CARGO_HOME: process.env.CARGO_HOME ?? "/private/tmp/aegis-cargo",
    AEGIS_ALLOWED_RECIPIENTS: LIVE_POLICY_ALLOWED_RECIPIENT,
    AEGIS_ALLOWED_PACKAGES: "0x2",
    AEGIS_ENCLAVE_PORT: port,
    AEGIS_MAX_OUTFLOW_BPS: "2500",
    AEGIS_POLICY_OBJECT_ID: LIVE_POLICY_OBJECT_ID,
    AEGIS_PER_TX_CAP_MIST: "1000000000",
    AEGIS_ROLLING_DAILY_CAP_MIST: "5000000000",
    AEGIS_SIGNING_SEED_HEX: enclaveSeedHex,
    AEGIS_TOTAL_MIST: "10000000000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitForHealth(port);

  const tx = new Transaction();
  tx.setSender(vaultAddress);
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(1n)]);
  tx.transferObjects([coin], tx.pure.address(LIVE_POLICY_ALLOWED_RECIPIENT));
  const txBytes = await tx.build({ client });
  const { signature: userSig } = await passkey.signTransaction(txBytes);
  const response = await coSign(port, {
    txBytes: Buffer.from(txBytes).toString("base64"),
    userSig,
    vaultAddress,
  });

  if (!response.ok) {
    throw new Error(`co_sign refused benign tx: ${response.reason}`);
  }

  const combined = multisig.combinePartialSignatures([userSig, response.enclaveSig]);
  const result = await client.core.executeTransaction({
    transaction: txBytes,
    signatures: [combined],
    include: { effects: true, transaction: true },
  });
  const txn = result.Transaction ?? result.FailedTransaction;
  if (!txn.status.success) {
    throw new Error(`vault multisig transaction failed: ${txn.status.error}`);
  }

  const drainTx = new Transaction();
  drainTx.setSender(vaultAddress);
  const [drainCoin] = drainTx.splitCoins(drainTx.gas, [drainTx.pure.u64(1n)]);
  drainTx.transferObjects([drainCoin], drainTx.pure.address(SEEDED_DRAIN_RECIPIENT));
  const drainBytes = await drainTx.build({ client });
  const { signature: drainUserSig } = await passkey.signTransaction(drainBytes);
  const refused = await coSign(port, {
    txBytes: Buffer.from(drainBytes).toString("base64"),
    userSig: drainUserSig,
    vaultAddress,
  });

  if (refused.ok || refused.reason !== "recipient is not allowlisted") {
    throw new Error(`expected server-side drain refusal, got ${JSON.stringify(refused)}`);
  }

  console.log(
    JSON.stringify(
      {
        network: "testnet",
        vaultAddress,
        digest: txn.digest,
        policyObjectId: LIVE_POLICY_OBJECT_ID,
        recipient: LIVE_POLICY_ALLOWED_RECIPIENT,
        refusalReason: refused.reason,
        status: txn.status,
        signer: "passkey+local-enclave-ed25519",
      },
      null,
      2,
    ),
  );
} finally {
  server.kill("SIGTERM");
}

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
    await delay(1_000);
  }

  throw new Error(`funding did not appear for vault ${address}`);
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
      .filter((candidate) => BigInt(candidate.mistBalance ?? "0") > 50_000_000n)
      .sort((left, right) => Number(BigInt(right.mistBalance ?? "0") - BigInt(left.mistBalance ?? "0")))[0];

    if (!coin?.gasCoinId) {
      throw new Error("No local testnet gas coin has enough MIST to fund vault smoke test");
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
        "30000000",
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

async function waitForHealth(port: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health_check`);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(100);
    }
  }

  throw new Error(`enclave server did not become healthy. stderr: ${stderr}`);
}

async function coSign(port: string, body: unknown): Promise<CoSignResponse> {
  const response = await fetch(`http://127.0.0.1:${port}/co_sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`co_sign HTTP ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as CoSignResponse;
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, "hex"));
}
