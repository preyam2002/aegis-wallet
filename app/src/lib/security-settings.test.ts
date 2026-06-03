import { describe, expect, it } from "vitest";
import {
	buildSecuritySettingsModel,
	getAutoLockState,
	getSecretExportPolicy,
} from "./security-settings";

describe("security settings", () => {
	it("enables safe defaults for a daily-driver wallet", () => {
		const model = buildSecuritySettingsModel();

		expect(model.autoLockMinutes).toBe(5);
		expect(model.requireBiometricForHighRisk).toBe(true);
		expect(model.simulationAlertsEnabled).toBe(true);
		expect(model.addressPoisoningProtectionEnabled).toBe(true);
		expect(model.hideDustInbound).toBe(true);
		expect(getSecretExportPolicy(model)).toEqual({
			allowed: false,
			reason: "Seed export is disabled for passkey and zkLogin accounts.",
		});
	});

	it("reports when an unlocked session should auto-lock", () => {
		const model = buildSecuritySettingsModel({ autoLockMinutes: 2 });

		expect(
			getAutoLockState(model, {
				unlockedAtMs: 1_000,
				nowMs: 60_000,
			}),
		).toEqual({ locked: false, remainingMs: 61_000 });
		expect(
			getAutoLockState(model, {
				unlockedAtMs: 1_000,
				nowMs: 122_000,
			}),
		).toEqual({ locked: true, remainingMs: 0 });
	});
});
