import type { SimSummary } from "@aegis/shared/sim-summary";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskFinding = {
	level: Exclude<RiskLevel, "low">;
	title: string;
	detail: string;
};

export type TxAssessment = {
	riskLevel: RiskLevel;
	findings: RiskFinding[];
	netOutMist: string;
	gasMist: string;
	objectsLeaving: number;
};

const SUI = "0x2::sui::SUI";

/**
 * The bouncer for dApp transactions: derives plain-English risk from a live
 * simulation. Focused on what hurts a wallet — failed sims, owned objects
 * leaving, and large SUI outflows relative to balance.
 */
export const assessTransaction = (
	summary: SimSummary,
	{ totalMist }: { totalMist?: bigint } = {},
): TxAssessment => {
	const findings: RiskFinding[] = [];

	if (summary.failed) {
		findings.push({
			level: "critical",
			title: "Simulation failed",
			detail: summary.failed.error,
		});
	}
	for (const risk of summary.risk) {
		if (risk.level === "block") {
			findings.push({
				level: "critical",
				title: "Simulation blocked",
				detail: risk.reason,
			});
		} else if (risk.level === "warn") {
			findings.push({
				level: "high",
				title: "Simulation warning",
				detail: risk.reason,
			});
		}
	}

	if (summary.objectsLeaving.length > 0) {
		findings.push({
			level: "high",
			title: `${summary.objectsLeaving.length} object${summary.objectsLeaving.length === 1 ? "" : "s"} leaving your wallet`,
			detail: "This transaction transfers owned objects out of your wallet.",
		});
	}

	const netOut = summary.sends
		.filter((send) => send.coinType === SUI)
		.reduce((sum, send) => sum - BigInt(send.amount), 0n);

	if (totalMist && totalMist > 0n && netOut > 0n) {
		const bps = Number((netOut * 10_000n) / totalMist);
		if (bps >= 9_000) {
			findings.push({
				level: "critical",
				title: "Drains most of your balance",
				detail: `Sends about ${Math.round(bps / 100)}% of your SUI in one transaction.`,
			});
		} else if (bps >= 5_000) {
			findings.push({
				level: "high",
				title: "Large outflow",
				detail: `Sends about ${Math.round(bps / 100)}% of your SUI.`,
			});
		}
	}

	const riskLevel: RiskLevel = findings.some((f) => f.level === "critical")
		? "critical"
		: findings.some((f) => f.level === "high")
			? "high"
			: findings.some((f) => f.level === "medium")
				? "medium"
				: "low";

	return {
		riskLevel,
		findings,
		netOutMist: netOut.toString(),
		gasMist: summary.gas,
		objectsLeaving: summary.objectsLeaving.length,
	};
};
