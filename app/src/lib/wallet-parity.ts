export type WalletPeer = "Slush" | "MetaMask" | "Phantom";

export type ParityStatus = "implemented" | "gated" | "planned";

export type WalletParityCapability = {
	id: string;
	category: string;
	capability: string;
	aegisStatus: ParityStatus;
	aegisEvidence: string;
	peers: Partial<Record<WalletPeer, string>>;
};

export const walletParityMatrix: WalletParityCapability[] = [
	{
		id: "portfolio-activity",
		category: "Core wallet",
		capability: "Portfolio, balances, token metadata, activity, notifications",
		aegisStatus: "implemented",
		aegisEvidence:
			"Live testnet portfolio/activity adapters, USD token valuation, notifications panel",
		peers: {
			Slush: "Portfolio and transaction history",
			MetaMask: "Tokens, NFTs, portfolio notifications",
			Phantom: "Balances, history, instant alerts",
		},
	},
	{
		id: "send-receive-qr",
		category: "Core wallet",
		capability: "Send, receive, QR receive, QR recipient scan",
		aegisStatus: "implemented",
		aegisEvidence:
			"Native Sui send PTB, canonical sui://pay receive URI, QR parser/generator",
		peers: {
			Slush: "Send, receive, Slush links and QR-style sharing",
			MetaMask: "Send and receive crypto",
			Phantom: "Send and receive tokens",
		},
	},
	{
		id: "swap-stake-defi",
		category: "Trading and earn",
		capability: "No-fee swap route, native staking, DeFi position inventory",
		aegisStatus: "gated",
		aegisEvidence:
			"Read-only swap quote and staking PTB implemented; live stake is gated by 1 SUI testnet minimum",
		peers: {
			Slush: "Swap, stake, DeFi opportunities",
			MetaMask: "Swap and stake flows",
			Phantom: "Swap, bridge, stake, explore DeFi",
		},
	},
	{
		id: "fiat-onramp",
		category: "Trading and earn",
		capability: "Buy and sell crypto through vetted fiat providers",
		aegisStatus: "gated",
		aegisEvidence:
			"Provider model covers Transak, Banxa, MoonPay, KYC handoff, and mainnet-only execution gates",
		peers: {
			Slush: "Buy/Sell provider handoff",
			MetaMask: "Buy and sell crypto",
			Phantom: "Buy and sell flows in Trade",
		},
	},
	{
		id: "nft-collectibles",
		category: "Assets",
		capability:
			"NFT gallery, collectible visibility, suspicious inbound filtering",
		aegisStatus: "implemented",
		aegisEvidence:
			"Owned-object inventory, NFT-like classification, gallery, dust/zero-value inbound hiding",
		peers: {
			Slush: "NFT support",
			MetaMask: "NFT tab and autodetect",
			Phantom: "Collectibles gallery, hide/report spam NFTs",
		},
	},
	{
		id: "dapp-extension-mobile",
		category: "dApp access",
		capability: "Wallet-standard dApp sessions, extension bridge, mobile shell",
		aegisStatus: "gated",
		aegisEvidence:
			"Generated MV3 extension and Expo shell pass fake-runtime integration tests; real browser/device proof remains open",
		peers: {
			Slush: "Web app, browser extension, mobile, dApp connection",
			MetaMask: "Extension, mobile, in-app browser",
			Phantom: "Extension, mobile, Explore dApp access",
		},
	},
	{
		id: "safe-signing",
		category: "Safety",
		capability:
			"Pre-sign simulation, risk scanner, malicious/new-domain warning analogs",
		aegisStatus: "implemented",
		aegisEvidence:
			"simulateTransaction summary, red net-outflow UI, package/recipient/drainer heuristics",
		peers: {
			MetaMask: "Security alerts and transaction simulation partners",
			Phantom: "Domain warnings and transaction simulation warnings",
		},
	},
	{
		id: "permissions-accounts",
		category: "Account control",
		capability:
			"Connected-dApp manager, per-site accounts, watch-only, sub-account budgets",
		aegisStatus: "implemented",
		aegisEvidence:
			"dApp session disconnect, capability revoke, per-site account rows, watch-only signing block",
		peers: {
			Slush: "dApp approval surface",
			MetaMask: "Connected sites and multiple accounts",
			Phantom: "Default wallet selection and dApp connections",
		},
	},
	{
		id: "network-settings",
		category: "Account control",
		capability: "Network selector, testnet/localnet/mainnet safety rails",
		aegisStatus: "implemented",
		aegisEvidence:
			"Network settings model and dashboard panel expose testnet, localnet, mainnet, and mainnet spend guardrails",
		peers: {
			MetaMask: "Network management and custom networks",
			Phantom: "Multichain network support",
		},
	},
	{
		id: "security-settings",
		category: "Safety",
		capability: "Auto-lock, privacy settings, recovery/import/export settings",
		aegisStatus: "implemented",
		aegisEvidence:
			"Security settings model and dashboard panel expose auto-lock, biometric, simulation, poisoning, dust, and seed-export policy",
		peers: {
			MetaMask: "Security/privacy settings and secret recovery phrase flows",
			Phantom: "Auto-lock, recovery phrase guidance, spam controls",
		},
	},
	{
		id: "passkey-zklogin-sponsored",
		category: "Onboarding",
		capability: "Passkey, zkLogin, Enoki sponsored gas",
		aegisStatus: "gated",
		aegisEvidence:
			"Passkey signing and Enoki payload/control-plane tests pass; live OAuth and sponsorship need credentials",
		peers: {
			Slush: "Social login and seed phrase",
			MetaMask: "Seed phrase and account import",
			Phantom: "Seed phrase, social login with PIN",
		},
	},
	{
		id: "vault-recovery",
		category: "Security moat",
		capability: "TEE Vault Mode, policy receipts, Seal guardian recovery",
		aegisStatus: "gated",
		aegisEvidence:
			"Local multisig co-sign/refusal and Seal recovery tests pass; real Nitro/Marlin attestation remains open",
		peers: {
			Slush: "Account recovery surfaces",
			MetaMask: "Security alerts, seed phrase recovery",
			Phantom: "Self-custody security guidance and warnings",
		},
	},
	{
		id: "bridge-multichain",
		category: "Reach",
		capability: "Cross-chain bridge and multichain asset management",
		aegisStatus: "gated",
		aegisEvidence:
			"Bridge intent model covers Sui, Ethereum, Solana routes through Sui Bridge, Wormhole, and CCTP; live execution is provider-gated",
		peers: {
			MetaMask: "Multichain wallet, swaps and bridging",
			Phantom: "Multichain wallet and cross-chain swapper",
		},
	},
	{
		id: "advanced-consumer-trading",
		category: "Reach",
		capability: "Perps, prediction markets, tokenized stocks, chat, cash card",
		aegisStatus: "gated",
		aegisEvidence:
			"Advanced consumer catalog covers Phantom-class surfaces and keeps high-risk trading provider-gated",
		peers: {
			Phantom:
				"Perps, prediction markets, tokenized stocks, chat, and Phantom Cash",
		},
	},
];

export function summarizeWalletParity(
	rows: WalletParityCapability[] = walletParityMatrix,
) {
	const byStatus = rows.reduce<Record<ParityStatus, number>>(
		(counts, row) => {
			counts[row.aegisStatus] += 1;
			return counts;
		},
		{ implemented: 0, gated: 0, planned: 0 },
	);

	return {
		total: rows.length,
		...byStatus,
	};
}

export function getWalletParityGaps(
	rows: WalletParityCapability[] = walletParityMatrix,
) {
	return rows.filter((row) => row.aegisStatus !== "implemented");
}
