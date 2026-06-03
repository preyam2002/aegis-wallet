import { describe, expect, it } from "vitest";
import {
	createMobileSignReview,
	createMobileWalletShell,
	parseMobileQrPayload,
	resolveMobileAction,
	resolveMobileSignReview,
} from "./shell";

describe("Aegis mobile shell", () => {
	it("declares the mobile daily-driver tabs and wallet capabilities", () => {
		const shell = createMobileWalletShell();

		expect(shell.tabs.map((tab) => tab.id)).toEqual([
			"portfolio",
			"activity",
			"actions",
			"dapps",
			"settings",
		]);
		expect(shell.capabilities).toEqual([
			"portfolio",
			"activity",
			"send",
			"receive-qr",
			"qr-scan",
			"swap",
			"stake",
			"dapp-browser",
			"safe-signing",
			"vault-mode",
			"guardian-recovery",
			"notifications",
		]);
	});

	it("requires biometric unlock for high-risk mobile actions", () => {
		const locked = createMobileWalletShell({ biometricUnlocked: false });
		const unlocked = createMobileWalletShell({ biometricUnlocked: true });

		expect(resolveMobileAction(locked, { type: "sign-transaction" })).toEqual({
			status: "biometric-required",
			action: "sign-transaction",
		});
		expect(resolveMobileAction(locked, { type: "receive" })).toEqual({
			status: "ready",
			action: "receive",
		});
		expect(resolveMobileAction(unlocked, { type: "sign-transaction" })).toEqual(
			{
				status: "ready",
				action: "sign-transaction",
			},
		);
	});

	it("parses scanned Sui recipient QR payloads for send", () => {
		expect(
			parseMobileQrPayload(
				"sui://pay?recipient=0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a&amount=1000000",
			),
		).toEqual({
			kind: "send",
			recipient:
				"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a",
			amountMist: "1000000",
		});
	});

	it("requires biometric unlock before resolving mobile safe-signing reviews", () => {
		const review = createMobileSignReview({
			requestId: "sign-1",
			origin: "https://app.example",
			summary: "Sends 2 SUI",
			worstRiskLevel: "high",
			txBytes: "AAECAw==",
		});

		expect(
			resolveMobileSignReview(createMobileWalletShell(), review, {
				decision: "approve",
				signature: "user-signature",
			}),
		).toEqual({
			status: "biometric-required",
			requestId: "sign-1",
		});
	});

	it("resolves mobile safe-signing reviews after biometric unlock", () => {
		const shell = createMobileWalletShell({ biometricUnlocked: true });
		const review = createMobileSignReview({
			requestId: "sign-2",
			origin: "https://app.example",
			summary: "Receives 1 SUI",
			worstRiskLevel: "low",
			txBytes: "AAECAw==",
		});

		expect(
			resolveMobileSignReview(shell, review, {
				decision: "approve",
				signature: "user-signature",
			}),
		).toEqual({
			status: "approved",
			requestId: "sign-2",
			signature: "user-signature",
		});
		expect(
			resolveMobileSignReview(shell, review, {
				decision: "reject",
				reason: "Simulation risk was too high.",
			}),
		).toEqual({
			status: "rejected",
			requestId: "sign-2",
			reason: "Simulation risk was too high.",
		});
	});
});
