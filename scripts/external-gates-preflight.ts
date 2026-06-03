import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getSuiBalance } from "@aegis/shared";

type GateReport = {
	gate: string;
	ready: boolean;
	detail: string;
	data?: Record<string, unknown>;
};

const requiredStakeMist = 1_050_000_000n;
const activeAddress = readActiveSuiAddress();
const stakingBalance = activeAddress
	? await readMistBalance(activeAddress).catch((error: unknown) => ({
			error: String(error),
		}))
	: { error: "active Sui address was not found" };

const nitroTools = ["oyster", "marlin", "nitro-cli", "aws", "docker"];
const missingNitroTools = nitroTools.filter((tool) => !hasCommand(tool));
const missingEnokiEnv = [
	"NEXT_PUBLIC_ENOKI_API_KEY",
	"NEXT_PUBLIC_GOOGLE_CLIENT_ID",
	"ENOKI_PRIVATE_API_KEY",
].filter((name) => !process.env[name]);

const gates: GateReport[] = [
	{
		gate: "nitro-marlin-attestation",
		ready: missingNitroTools.length === 0,
		detail:
			missingNitroTools.length === 0
				? "Nitro/Marlin tooling is available locally."
				: "Real Nautilus registration remains external until these tools are installed.",
		data: {
			requiredTools: nitroTools,
			missingTools: missingNitroTools,
		},
	},
	{
		gate: "enoki-zklogin-sponsored-gas",
		ready: missingEnokiEnv.length === 0,
		detail:
			missingEnokiEnv.length === 0
				? "Enoki and OAuth environment variables are present."
				: "Live zkLogin and sponsored transaction execution require these environment variables.",
		data: {
			missingEnv: missingEnokiEnv,
		},
	},
	{
		gate: "testnet-native-staking-execution",
		ready:
			"balanceMist" in stakingBalance &&
			BigInt(stakingBalance.balanceMist) >= requiredStakeMist,
		detail:
			"balanceMist" in stakingBalance
				? "Live staking requires at least 1 SUI plus gas in the active local testnet wallet."
				: "Could not read active local testnet staking balance.",
		data: {
			activeAddress,
			requiredMist: requiredStakeMist.toString(),
			...stakingBalance,
		},
	},
	{
		gate: "mainnet-deploy-and-swap-execution",
		ready: process.env.AEGIS_ALLOW_MAINNET_SPEND === "true",
		detail:
			"Mainnet deploy and live swap execution spend real SUI and require explicit approval.",
		data: {
			approvalEnv: "AEGIS_ALLOW_MAINNET_SPEND=true",
		},
	},
	{
		gate: "browser-and-native-device-proof",
		ready: process.env.AEGIS_ALLOW_BROWSER_AUTOMATION === "true",
		detail:
			process.env.AEGIS_ALLOW_BROWSER_AUTOMATION === "true"
				? "Browser automation is approved for this run; attach to a browser/device harness before claiming live UI proof."
				: "Browser/native-device proof is intentionally disabled unless the user re-enables browser automation.",
		data: {
			approvalEnv: "AEGIS_ALLOW_BROWSER_AUTOMATION=true",
		},
	},
];

console.log(
	JSON.stringify(
		{
			status: gates.every((gate) => gate.ready) ? "ready" : "blocked",
			gates,
		},
		null,
		2,
	),
);

function hasCommand(command: string): boolean {
	const result = spawnSync("zsh", ["-lc", `command -v ${command}`], {
		encoding: "utf8",
	});
	return result.status === 0 && result.stdout.trim().length > 0;
}

function readActiveSuiAddress(): string | null {
	const configPath = join(homedir(), ".sui", "sui_config", "client.yaml");
	if (!existsSync(configPath)) {
		return null;
	}

	const config = readFileSync(configPath, "utf8");
	return (
		config.match(/active[-_]address:\s*"?([^"\n]+)"?/)?.[1]?.trim() ?? null
	);
}

async function readMistBalance(address: string) {
	const balance = await getSuiBalance(address);
	return {
		balanceMist: balance.totalBalance,
	};
}
