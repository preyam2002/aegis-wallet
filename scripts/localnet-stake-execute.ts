import { requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { buildStakeTransaction } from "../app/src/lib/wallet-workflows";

const rpcUrl = process.env.AEGIS_LOCALNET_RPC_URL ?? "http://127.0.0.1:9000";
const faucetHost =
	process.env.AEGIS_LOCALNET_FAUCET_URL ?? "http://127.0.0.1:9123";
const stakeMist = BigInt(process.env.AEGIS_STAKE_MIST ?? "1000000000");
const requiredMist = stakeMist + 50_000_000n;
const client = new SuiJsonRpcClient({ url: rpcUrl, network: "localnet" });
const signer = new Ed25519Keypair();
const sender = signer.toSuiAddress();

await ensureLocalnetReachable();
await ensureFunded(sender, requiredMist);

const validatorAddress =
	process.env.AEGIS_LOCALNET_VALIDATOR_ADDRESS ??
	(await selectActiveValidator());
const tx = buildStakeTransaction({ validatorAddress, amountMist: stakeMist });
tx.setSender(sender);

const result = await client.signAndExecuteTransaction({
	signer,
	transaction: tx,
	options: {
		showEffects: true,
		showBalanceChanges: true,
	},
});

if (result.effects?.status?.status !== "success") {
	throw new Error(
		`localnet staking transaction failed: ${result.effects?.status?.error}`,
	);
}

console.log(
	JSON.stringify(
		{
			network: "localnet",
			rpcUrl,
			faucetHost,
			sender,
			validatorAddress,
			stakeMist: stakeMist.toString(),
			digest: result.digest,
			status: result.effects.status,
			balanceChanges: result.balanceChanges,
		},
		null,
		2,
	),
);

async function ensureLocalnetReachable() {
	try {
		await client.getLatestSuiSystemState();
	} catch (error) {
		throw new Error(
			`localnet RPC is not reachable at ${rpcUrl}; start it with: sui start --force-regenesis --with-faucet --fullnode-rpc-port 9000`,
			{ cause: error },
		);
	}
}

async function ensureFunded(address: string, minimumMist: bigint) {
	const starting = await getMistBalance(address);
	if (starting >= minimumMist) {
		return;
	}

	await requestSuiFromFaucetV2({
		host: faucetHost,
		recipient: address,
	});

	for (let attempt = 0; attempt < 30; attempt += 1) {
		const next = await getMistBalance(address);
		if (next >= minimumMist) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1_000));
	}

	throw new Error(
		`localnet faucet funded ${address}, but balance stayed below ${minimumMist.toString()} MIST`,
	);
}

async function getMistBalance(owner: string): Promise<bigint> {
	const balance = await client.getBalance({ owner });
	return BigInt(balance.totalBalance);
}

async function selectActiveValidator(): Promise<string> {
	const state = await client.getLatestSuiSystemState();
	const validator = state.activeValidators
		.filter((candidate) => /^0x[0-9a-fA-F]{64}$/.test(candidate.suiAddress))
		.sort((left, right) =>
			Number(
				BigInt(right.stakingPoolSuiBalance) -
					BigInt(left.stakingPoolSuiBalance),
			),
		)[0];

	if (!validator?.suiAddress) {
		throw new Error("localnet returned no active validators");
	}

	return validator.suiAddress;
}
