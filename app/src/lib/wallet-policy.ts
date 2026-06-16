import type { WalletPolicy } from "./transaction-analysis";

/**
 * Curated denylist of known-malicious recipients. Intentionally empty until wired
 * to a real threat feed — we do not fabricate "known drainer" addresses. The live
 * scanner still enforces unknown-recipient, wallet-sweep, large-outflow, and
 * address-poisoning checks without any external data.
 */
export const CURATED_DRAINERS: string[] = [];

const SYSTEM_PACKAGES = ["0x1", "0x2", "0x3"];

export type DefaultPolicyInput = {
	knownRecipients?: string[];
	knownDrainers?: string[];
	trustedPackages?: string[];
	maxOutflowBps?: number;
};

export const buildDefaultWalletPolicy = ({
	knownRecipients = [],
	knownDrainers = CURATED_DRAINERS,
	trustedPackages = SYSTEM_PACKAGES,
	maxOutflowBps = 9_000,
}: DefaultPolicyInput = {}): WalletPolicy => ({
	knownRecipients,
	trustedPackages,
	knownDrainers,
	previouslyInteractedPackages: trustedPackages,
	maxOutflowBps,
});
