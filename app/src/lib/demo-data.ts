import type { SimSummary } from "@aegis/shared";
import type { PermissionState } from "./permissions";
import type { PolicyReceipt } from "./policy-receipts";
import { buildSealShareIdentity } from "./recovery";
import type { SubAccount } from "./subaccounts";
import type {
	ActivityEvent,
	TransactionPreviewInput,
} from "./transaction-analysis";
import {
	createNotification,
	createWatchOnlyAccount,
	type PerSiteAccount,
	type WalletNotification,
} from "./wallet-workflows";

export const demoPreview: TransactionPreviewInput = {
	walletAddress:
		"0xaeg15000000000000000000000000000000000000000000000000000000000001",
	totalMist: 18_420_000_000n,
	effects: {
		balanceChanges: [
			{
				owner:
					"0xaeg15000000000000000000000000000000000000000000000000000000000001",
				coinType: "0x2::sui::SUI",
				amount: "-17400000000",
			},
			{
				owner:
					"0x7afe00000000000000000000000000000000000000000000000000000000beef",
				coinType: "0x2::sui::SUI",
				amount: "17400000000",
			},
		],
		objectChanges: [
			{
				type: "transferred",
				objectId: "0xobj1",
				objectType: "0xtrusted::kiosk::TransferCap",
				recipient:
					"0x7afe00000000000000000000000000000000000000000000000000000000beef",
			},
			{
				type: "transferred",
				objectId: "0xobj2",
				objectType: "0xtrusted::collectible::SuiFrens",
				recipient:
					"0x7afe00000000000000000000000000000000000000000000000000000000beef",
			},
		],
		packagesTouched: [
			"0x6adbad0000000000000000000000000000000000000000000000000000000000",
		],
	},
	policy: {
		knownRecipients: [
			"0x32d4000000000000000000000000000000000000000000000000000000000001",
			"0x7afe00000000000000000000000000000000000000000000000000000000beee",
		],
		trustedPackages: ["0x2", "0xtrusted", "0xdee9"],
		knownDrainers: [],
		previouslyInteractedPackages: ["0x2", "0xtrusted", "0xdee9"],
		brandNewPackages: [
			"0x6adbad0000000000000000000000000000000000000000000000000000000000",
		],
		maxOutflowBps: 2_500,
	},
	addressBook: [
		{
			label: "Primary cold vault",
			address:
				"0x7afe00000000000000000000000000000000000000000000000000000000beee",
		},
		{
			label: "Navi strategy",
			address:
				"0x32d4000000000000000000000000000000000000000000000000000000000001",
		},
	],
};

export const demoSimSummary: SimSummary = {
	sends: [
		{
			coinType: "0x2::sui::SUI",
			amount: "-17400000000",
			to: "0x7afe00000000000000000000000000000000000000000000000000000000beef",
		},
	],
	receives: [],
	objectsLeaving: [
		{
			objectId: "0xobj1",
			type: "0xtrusted::kiosk::TransferCap",
			to: "0x7afe00000000000000000000000000000000000000000000000000000000beef",
		},
		{
			objectId: "0xobj2",
			type: "0xtrusted::collectible::SuiFrens",
			to: "0x7afe00000000000000000000000000000000000000000000000000000000beef",
		},
	],
	gas: "6400000",
	risk: [{ level: "warn", reason: "Package was marked as newly published." }],
};

export const portfolioRows = [
	{
		symbol: "SUI",
		name: "Sui",
		value: "$64,921",
		amount: "18.42",
		tone: "mint",
	},
	{
		symbol: "DEEP",
		name: "DeepBook",
		value: "$12,480",
		amount: "42,180",
		tone: "ink",
	},
	{
		symbol: "haSUI",
		name: "Haedal staked SUI",
		value: "$9,106",
		amount: "2.46",
		tone: "amber",
	},
];

export const activityRows: (ActivityEvent & {
	value: string;
	status: string;
})[] = [
	{
		id: "navi-top-up",
		direction: "inbound",
		amountMist: "2400000000",
		label: "Navi collateral top-up",
		value: "+2.4 SUI",
		status: "Passed",
	},
	{
		id: "poison-zero",
		direction: "inbound",
		amountMist: "0",
		label: "0x7afe...beef dust ping",
		value: "0 SUI",
		status: "Hidden",
	},
	{
		id: "cetus-mint",
		direction: "internal",
		amountMist: "0",
		label: "Cetus LP position minted",
		value: "2 objects",
		status: "Passed",
	},
	{
		id: "blocked-drain",
		direction: "outbound",
		amountMist: "17400000000",
		label: "Unknown package request",
		value: "-17.4 SUI",
		status: "Blocked",
	},
];

export const permissionState: PermissionState = {
	sessions: [
		{
			id: "navi",
			origin: "app.naviprotocol.io",
			account: "0xaeg1...0001",
			connectedAt: "09:41",
			active: true,
		},
		{
			id: "hop",
			origin: "hop.ag",
			account: "0xaeg1...swap",
			connectedAt: "08:12",
			active: true,
		},
	],
	capabilities: [
		{
			objectId: "0xcap...91f3",
			label: "Scoped repay cap",
			dappOrigin: "app.naviprotocol.io",
			expiresAt: "24h",
			revoked: false,
		},
		{
			objectId: "0xcap...02ad",
			label: "Cetus mint cap",
			dappOrigin: "cetus.zone",
			revoked: true,
		},
	],
};

export const subaccountRows: SubAccount[] = [
	{
		id: "navi-budget",
		owner: "0xaeg1...0001",
		dapp: "app.naviprotocol.io",
		maxMist: 5_000_000_000n,
		spentMist: 1_200_000_000n,
		expiresAtMs: Date.now() + 86_400_000,
		revoked: false,
	},
	{
		id: "hop-swap",
		owner: "0xaeg1...swap",
		dapp: "hop.ag",
		maxMist: 2_000_000_000n,
		spentMist: 2_000_000_000n,
		expiresAtMs: Date.now() + 3_600_000,
		revoked: true,
	},
];

export const policyReceiptRows: PolicyReceipt[] = [
	{
		digest: "CYAb3vHi9W6EB2wQucSRKgqr1Vt65Rkt6vFSAQMRjThU",
		status: "passed",
		policyId:
			"0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea",
		txDigest: "0x010203",
		reason: "pass",
	},
	{
		digest: "G2pDdgmuJfUNGTk27CtgETgrFWnuwviR3pZkPHhJFjcE",
		status: "rejected",
		policyId:
			"0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea",
		txDigest: "0x090909",
		reason: "drain",
	},
];

export const demoRecoveryConfigId = `0x${"45".repeat(32)}`;

export const demoRecoverySetup = {
	guardians: ["Maya", "Ishan", "Rhea"],
	shamirThreshold: 2,
	sealKeyServerThreshold: 1,
	recoveryConfigId: demoRecoveryConfigId,
	encryptedShareIdentities: [
		buildSealShareIdentity(demoRecoveryConfigId, 1),
		buildSealShareIdentity(demoRecoveryConfigId, 2),
		buildSealShareIdentity(demoRecoveryConfigId, 3),
	],
};

export const perSiteAccounts: PerSiteAccount[] = [
	{ origin: "app.naviprotocol.io", address: "0xaeg1...0001" },
	{ origin: "hop.ag", address: "0xaeg1...swap" },
];

export const watchOnlyRows = [
	createWatchOnlyAccount({
		label: "Treasury cold vault",
		address: `0x${"89".repeat(32)}`,
		source: "address-book",
	}),
	createWatchOnlyAccount({
		label: "Founder multisig",
		address: `0x${"ab".repeat(32)}`,
		source: "manual",
	}),
];

export const notificationRows: WalletNotification[] = [
	createNotification({
		id: "policy-rejected",
		kind: "signing",
		title: "Transaction rejected",
		detail: "recipient is not allowlisted",
	}),
	createNotification({
		id: "stake-confirmed",
		kind: "stake",
		title: "Stake confirmed",
		detail: "2.46 SUI delegated",
	}),
];

export const nftRows = [
	{ name: "Aegis Pass #014", collection: "SuiFrens", tone: "mint" },
	{ name: "DeepBook Key", collection: "DeepBook", tone: "ink" },
	{ name: "Vault Badge", collection: "Aegis", tone: "amber" },
];

export const defiRows = [
	{ protocol: "Navi", label: "Collateral", value: "$28,420" },
	{ protocol: "Cetus", label: "LP position", value: "$9,884" },
	{ protocol: "Staking", label: "Native SUI", value: "2.46 SUI" },
];
