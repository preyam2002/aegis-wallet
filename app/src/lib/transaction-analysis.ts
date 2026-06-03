import type { SimSummary } from "@aegis/shared";
import { explainWalletError, type WalletErrorCopy } from "./error-copy";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type BalanceChange = {
	owner: string;
	coinType: string;
	amount: string;
};

export type ObjectChange = {
	type: "transferred" | "created" | "mutated" | "deleted";
	objectId: string;
	objectType?: string;
	recipient?: string;
};

export type SimulatedEffects = {
	balanceChanges: BalanceChange[];
	objectChanges: ObjectChange[];
	packagesTouched: string[];
};

export type WalletPolicy = {
	knownRecipients: string[];
	trustedPackages: string[];
	knownDrainers: string[];
	previouslyInteractedPackages?: string[];
	brandNewPackages?: string[];
	maxOutflowBps: number;
};

export type AddressBookEntry = {
	label: string;
	address: string;
};

export type TransactionPreviewInput = {
	walletAddress: string;
	totalMist: bigint;
	effects: SimulatedEffects;
	policy: WalletPolicy;
	addressBook: AddressBookEntry[];
};

export type RiskFinding = {
	kind:
		| "large-outflow"
		| "coin-sweep"
		| "unknown-recipient"
		| "known-drainer"
		| "untrusted-package"
		| "brand-new-package"
		| "never-interacted-package"
		| "address-poisoning"
		| "simulation-risk";
	level: Exclude<RiskLevel, "low">;
	title: string;
	detail: string;
};

export type ActivityDirection = "inbound" | "outbound" | "internal";

export type ActivityEvent = {
	id: string;
	direction: ActivityDirection;
	amountMist: string;
	label: string;
};

export type AddressPoisoningFinding = {
	label: string;
	address: string;
	reason: string;
};

export type TransactionAnalysis = {
	netMist: bigint;
	netObjects: ObjectChange[];
	recipients: string[];
	riskLevel: RiskLevel;
	summary: string;
	findings: RiskFinding[];
	gasMist: bigint;
	failed?: WalletErrorCopy;
};

export type SimSummaryAnalysisInput = {
	walletAddress: string;
	totalMist: bigint;
	summary: SimSummary;
	packagesTouched: string[];
	policy: WalletPolicy;
	addressBook: AddressBookEntry[];
};

const MIST_PER_SUI = 1_000_000_000n;

export const formatMist = (mist: bigint): string => {
	const sign = mist < 0n ? "-" : "";
	const abs = mist < 0n ? -mist : mist;
	const whole = abs / MIST_PER_SUI;
	const fraction = abs % MIST_PER_SUI;

	if (fraction === 0n) {
		return `${sign}${whole.toString()} SUI`;
	}

	const trimmedFraction = fraction
		.toString()
		.padStart(9, "0")
		.replace(/0+$/, "");
	return `${sign}${whole.toString()}.${trimmedFraction} SUI`;
};

export const detectAddressPoisoning = (
	recipient: string,
	addressBook: AddressBookEntry[],
): AddressPoisoningFinding | null => {
	const normalizedRecipient = normalizeAddress(recipient);

	for (const entry of addressBook) {
		const normalizedKnown = normalizeAddress(entry.address);
		if (normalizedRecipient === normalizedKnown) {
			continue;
		}

		const samePrefix =
			normalizedRecipient.slice(0, 8) === normalizedKnown.slice(0, 8);
		const sameSuffix =
			normalizedRecipient.slice(-8) === normalizedKnown.slice(-8);

		if (samePrefix || sameSuffix) {
			return {
				label: entry.label,
				address: entry.address,
				reason: [
					samePrefix ? "same prefix" : null,
					sameSuffix ? "same suffix" : null,
				]
					.filter(Boolean)
					.join(" and "),
			};
		}
	}

	return null;
};

export const analyzeTransaction = (
	input: TransactionPreviewInput,
): TransactionAnalysis => {
	const wallet = normalizeAddress(input.walletAddress);
	const netMist = input.effects.balanceChanges
		.filter((change) => normalizeAddress(change.owner) === wallet)
		.reduce((sum, change) => sum + BigInt(change.amount), 0n);
	const netObjects = input.effects.objectChanges.filter(
		(change) => change.type === "transferred",
	);
	const recipients = collectRecipients(input, wallet);
	const findings = collectFindings(input, netMist, recipients);
	const riskLevel = scoreRisk(findings);

	return {
		netMist,
		netObjects,
		recipients,
		riskLevel,
		summary: summarize(netMist, netObjects.length),
		findings,
		gasMist: 0n,
	};
};

export const analyzeSimSummary = (
	input: SimSummaryAnalysisInput,
): TransactionAnalysis => {
	const effects: SimulatedEffects = {
		balanceChanges: [
			...input.summary.sends.map((send) => ({
				owner: input.walletAddress,
				coinType: send.coinType,
				amount: send.amount,
			})),
			...input.summary.receives.map((receive) => ({
				owner: input.walletAddress,
				coinType: receive.coinType,
				amount: receive.amount,
			})),
			...input.summary.sends
				.filter((send) => send.to)
				.map((send) => ({
					owner: send.to ?? "",
					coinType: send.coinType,
					amount: trimNegative(send.amount),
				})),
		],
		objectChanges: input.summary.objectsLeaving.map((object) => ({
			type: "transferred" as const,
			objectId: object.objectId,
			objectType: object.type,
			recipient: object.to,
		})),
		packagesTouched: input.packagesTouched,
	};
	const base = analyzeTransaction({
		walletAddress: input.walletAddress,
		totalMist: input.totalMist,
		effects,
		policy: input.policy,
		addressBook: input.addressBook,
	});
	const simulationFindings = input.summary.risk.map(simulationRiskToFinding);
	const findings = dedupeFindings([...simulationFindings, ...base.findings]);

	return {
		...base,
		findings,
		riskLevel: scoreRisk(findings),
		gasMist: BigInt(input.summary.gas),
		...(input.summary.failed
			? { failed: explainWalletError(input.summary.failed.error) }
			: {}),
	};
};

const collectFindings = (
	input: TransactionPreviewInput,
	netMist: bigint,
	recipients: string[],
): RiskFinding[] => {
	const findings: RiskFinding[] = [];
	const outflow = netMist < 0n ? -netMist : 0n;
	const outflowBps =
		input.totalMist === 0n ? 0 : Number((outflow * 10_000n) / input.totalMist);
	const knownRecipients = input.policy.knownRecipients.map(normalizeAddress);
	const knownDrainers = input.policy.knownDrainers.map(normalizeAddress);
	const trustedPackages = input.policy.trustedPackages.map(normalizePackage);

	if (outflowBps > input.policy.maxOutflowBps) {
		findings.push({
			kind: "large-outflow",
			level: "critical",
			title: "Large net outflow",
			detail: `This transaction sends ${formatMist(outflow)}, ${outflowBps} bps of the wallet balance.`,
		});
	}

	if (outflow > 0n && input.totalMist > 0n && outflow >= input.totalMist) {
		findings.push({
			kind: "coin-sweep",
			level: "high",
			title: "Wallet sweep",
			detail: "This transaction empties the wallet's SUI balance.",
		});
	}

	for (const recipient of recipients) {
		const normalized = normalizeAddress(recipient);
		if (knownDrainers.includes(normalized)) {
			findings.push({
				kind: "known-drainer",
				level: "critical",
				title: "Known drainer recipient",
				detail: "The recipient is on the configured blocklist.",
			});
		} else if (!knownRecipients.includes(normalized)) {
			findings.push({
				kind: "unknown-recipient",
				level: "high",
				title: "Unknown recipient",
				detail: `${shortAddress(recipient)} is not in the wallet's trusted recipients.`,
			});
		}
	}

	const untrustedPackage = input.effects.packagesTouched.find(
		(pkg) => !trustedPackages.includes(normalizePackage(pkg)),
	);
	if (untrustedPackage) {
		findings.push({
			kind: "untrusted-package",
			level: "high",
			title: "Untrusted package",
			detail: `${shortAddress(untrustedPackage)} has not been marked trusted.`,
		});
	}

	const brandNewPackages = (input.policy.brandNewPackages ?? []).map(
		normalizePackage,
	);
	const brandNewPackage = input.effects.packagesTouched.find((pkg) =>
		brandNewPackages.includes(normalizePackage(pkg)),
	);
	if (brandNewPackage) {
		findings.push({
			kind: "brand-new-package",
			level: "high",
			title: "Brand-new package",
			detail: `${shortAddress(brandNewPackage)} was marked as newly published.`,
		});
	}

	const previouslyInteractedPackages = (
		input.policy.previouslyInteractedPackages ?? []
	).map(normalizePackage);
	const neverInteractedPackage = input.effects.packagesTouched.find((pkg) => {
		const normalized = normalizePackage(pkg);
		return (
			!trustedPackages.includes(normalized) &&
			!brandNewPackages.includes(normalized) &&
			!previouslyInteractedPackages.includes(normalized)
		);
	});
	if (neverInteractedPackage) {
		findings.push({
			kind: "never-interacted-package",
			level: "medium",
			title: "First package interaction",
			detail: `No prior wallet activity was found for ${shortAddress(neverInteractedPackage)}.`,
		});
	}

	for (const recipient of recipients) {
		const poisoning = detectAddressPoisoning(recipient, input.addressBook);
		if (poisoning) {
			findings.push({
				kind: "address-poisoning",
				level: "high",
				title: "Address looks like a saved contact",
				detail: `${shortAddress(recipient)} has the ${poisoning.reason} as ${poisoning.label}.`,
			});
		}
	}

	return dedupeFindings(findings);
};

export const filterVisibleActivity = <T extends ActivityEvent>(
	rows: T[],
	options: { dustMistThreshold?: bigint } = {},
): T[] => {
	const dustMistThreshold = options.dustMistThreshold ?? 10_000_000n;

	return rows.filter((row) => {
		if (row.direction !== "inbound") {
			return true;
		}

		const amount = BigInt(row.amountMist);
		return amount >= dustMistThreshold;
	});
};

const collectRecipients = (
	input: TransactionPreviewInput,
	wallet: string,
): string[] => {
	const recipients = new Set<string>();

	for (const change of input.effects.balanceChanges) {
		const amount = BigInt(change.amount);
		const owner = normalizeAddress(change.owner);
		if (owner !== wallet && amount > 0n) {
			recipients.add(change.owner);
		}
	}

	for (const change of input.effects.objectChanges) {
		if (change.type === "transferred" && change.recipient) {
			recipients.add(change.recipient);
		}
	}

	return [...recipients];
};

const scoreRisk = (findings: RiskFinding[]): RiskLevel => {
	if (findings.some((finding) => finding.level === "critical")) {
		return "critical";
	}
	if (findings.some((finding) => finding.level === "high")) {
		return "high";
	}
	if (findings.some((finding) => finding.level === "medium")) {
		return "medium";
	}
	return "low";
};

const summarize = (netMist: bigint, objectCount: number): string => {
	const parts: string[] = [];
	if (netMist < 0n) {
		parts.push(`Sends ${formatMist(-netMist)}`);
	} else if (netMist > 0n) {
		parts.push(`Receives ${formatMist(netMist)}`);
	} else {
		parts.push("No net SUI movement");
	}

	if (objectCount > 0) {
		parts.push(`${objectCount} object${objectCount === 1 ? "" : "s"}`);
	}

	return parts.join(" and ");
};

const simulationRiskToFinding = (
	risk: SimSummary["risk"][number],
): RiskFinding => {
	const detail = risk.reason.startsWith("Simulation failed: ")
		? explainWalletError(risk.reason.replace("Simulation failed: ", "")).detail
		: risk.reason;

	if (risk.level === "block") {
		return {
			kind: "simulation-risk",
			level: "critical",
			title: "Simulation blocked",
			detail,
		};
	}

	if (risk.level === "warn") {
		return {
			kind: "simulation-risk",
			level: "high",
			title: "Simulation warning",
			detail,
		};
	}

	return {
		kind: "simulation-risk",
		level: "medium",
		title: "Simulation note",
		detail,
	};
};

const trimNegative = (amount: string): string =>
	amount.startsWith("-") ? amount.slice(1) : amount;

const normalizeAddress = (address: string): string => address.toLowerCase();

const normalizePackage = (pkg: string): string =>
	pkg.split("::")[0].toLowerCase();

const shortAddress = (address: string): string => {
	if (address.length <= 14) {
		return address;
	}
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const dedupeFindings = (findings: RiskFinding[]): RiskFinding[] => {
	const seen = new Set<string>();
	return findings.filter((finding) => {
		const key = `${finding.kind}:${finding.title}:${finding.detail}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
};
