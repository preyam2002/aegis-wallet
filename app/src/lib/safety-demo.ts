import {
	analyzeTransaction,
	detectAddressPoisoning,
	type TransactionAnalysis,
	type TransactionPreviewInput,
} from "./transaction-analysis";

const WALLET =
	"0xa1a1000000000000000000000000000000000000000000000000000000000001";
const DRAINER =
	"0xdead000000000000000000000000000000000000000000000000000000000bad";
const UNVERIFIED_PACKAGE =
	"0xbad9000000000000000000000000000000000000000000000000000000000bad";
const TRUSTED_RECIPIENT =
	"0xf00d000000000000000000000000000000000000000000000000000000000f00";
const TREASURY =
	"0x9999aaaa000000000000000000000000000000000000000000000000aaaa0001";
const POISONED_LOOKALIKE =
	"0x9999aaaa111111111111111111111111111111111111111111111111aaaa0001";

const basePolicy: TransactionPreviewInput["policy"] = {
	knownRecipients: [TRUSTED_RECIPIENT],
	trustedPackages: ["0x2"],
	knownDrainers: [DRAINER],
	previouslyInteractedPackages: ["0x2"],
	brandNewPackages: [],
	maxOutflowBps: 5_000,
};

export type SafetyDemoScenario = {
	title: string;
	description: string;
	analysis: TransactionAnalysis;
};

export const buildSafetyDemoScenarios = (): SafetyDemoScenario[] => [
	{
		title: "Known drainer",
		description: "A transfer targets an address on the configured blocklist.",
		analysis: analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{ owner: WALLET, coinType: "0x2::sui::SUI", amount: "-1000000000" },
					{ owner: DRAINER, coinType: "0x2::sui::SUI", amount: "1000000000" },
				],
				objectChanges: [],
				packagesTouched: ["0x2"],
			},
			policy: basePolicy,
			addressBook: [],
		}),
	},
	{
		title: "Wallet sweep",
		description: "A single PTB tries to empty the wallet's SUI balance.",
		analysis: analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{
						owner: WALLET,
						coinType: "0x2::sui::SUI",
						amount: "-10000000000",
					},
					{
						owner: TRUSTED_RECIPIENT,
						coinType: "0x2::sui::SUI",
						amount: "10000000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0x2"],
			},
			policy: { ...basePolicy, maxOutflowBps: 10_000 },
			addressBook: [],
		}),
	},
	{
		title: "Untrusted package",
		description:
			"A move call touches a package the wallet has not marked trusted.",
		analysis: analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [],
				objectChanges: [],
				packagesTouched: [UNVERIFIED_PACKAGE],
			},
			policy: basePolicy,
			addressBook: [],
		}),
	},
	{
		title: "Poisoned address",
		description: "A pasted recipient mimics a saved Treasury contact.",
		analysis: analyzeTransaction({
			walletAddress: WALLET,
			totalMist: 10_000_000_000n,
			effects: {
				balanceChanges: [
					{ owner: WALLET, coinType: "0x2::sui::SUI", amount: "-1000000000" },
					{
						owner: POISONED_LOOKALIKE,
						coinType: "0x2::sui::SUI",
						amount: "1000000000",
					},
				],
				objectChanges: [],
				packagesTouched: ["0x2"],
			},
			policy: basePolicy,
			addressBook: [{ label: "Treasury", address: TREASURY }],
		}),
	},
];

export const demoPoisoningCheck = () =>
	detectAddressPoisoning(POISONED_LOOKALIKE, [
		{ label: "Treasury", address: TREASURY },
	]);
