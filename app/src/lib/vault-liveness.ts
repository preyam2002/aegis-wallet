export type VaultLivenessInput = {
	enclaveReachable: boolean;
	recoveryRequestedAtMs: number | null;
	timelockMs: number;
	nowMs: number;
};

export type VaultLivenessState = {
	status: "active" | "request-recovery" | "timelocked" | "escape-available";
	remainingMs: number;
};

export const getVaultLivenessState = ({
	enclaveReachable,
	recoveryRequestedAtMs,
	timelockMs,
	nowMs,
}: VaultLivenessInput): VaultLivenessState => {
	if (enclaveReachable) {
		return { status: "active", remainingMs: 0 };
	}

	if (recoveryRequestedAtMs === null) {
		return { status: "request-recovery", remainingMs: timelockMs };
	}

	const escapeAt = recoveryRequestedAtMs + timelockMs;
	const remainingMs = Math.max(0, escapeAt - nowMs);
	return remainingMs === 0
		? { status: "escape-available", remainingMs }
		: { status: "timelocked", remainingMs };
};
