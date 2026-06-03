export type SecuritySettingsModel = {
	autoLockMinutes: number;
	requireBiometricForHighRisk: boolean;
	simulationAlertsEnabled: boolean;
	addressPoisoningProtectionEnabled: boolean;
	hideDustInbound: boolean;
	accountType: "passkey-zklogin" | "seed";
};

export type AutoLockState = {
	locked: boolean;
	remainingMs: number;
};

export type SecretExportPolicy = {
	allowed: boolean;
	reason: string;
};

export function buildSecuritySettingsModel(
	overrides: Partial<SecuritySettingsModel> = {},
): SecuritySettingsModel {
	return {
		autoLockMinutes: 5,
		requireBiometricForHighRisk: true,
		simulationAlertsEnabled: true,
		addressPoisoningProtectionEnabled: true,
		hideDustInbound: true,
		accountType: "passkey-zklogin",
		...overrides,
	};
}

export function getAutoLockState(
	model: SecuritySettingsModel,
	{
		unlockedAtMs,
		nowMs,
	}: {
		unlockedAtMs: number;
		nowMs: number;
	},
): AutoLockState {
	const durationMs = model.autoLockMinutes * 60_000;
	const elapsedMs = Math.max(0, nowMs - unlockedAtMs);
	const remainingMs = Math.max(0, durationMs - elapsedMs);

	return {
		locked: remainingMs === 0,
		remainingMs,
	};
}

export function getSecretExportPolicy(
	model: SecuritySettingsModel,
): SecretExportPolicy {
	if (model.accountType === "seed") {
		return {
			allowed: true,
			reason: "Seed export is available for imported seed accounts.",
		};
	}

	return {
		allowed: false,
		reason: "Seed export is disabled for passkey and zkLogin accounts.",
	};
}
