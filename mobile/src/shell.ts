export type MobileCapability =
	| "portfolio"
	| "activity"
	| "send"
	| "receive-qr"
	| "qr-scan"
	| "swap"
	| "stake"
	| "dapp-browser"
	| "safe-signing"
	| "vault-mode"
	| "guardian-recovery"
	| "notifications";

export type MobileTabId =
	| "portfolio"
	| "activity"
	| "actions"
	| "dapps"
	| "settings";

export type MobileWalletShell = {
	biometricUnlocked: boolean;
	tabs: { id: MobileTabId; capabilities: MobileCapability[] }[];
	capabilities: MobileCapability[];
};

export type MobileAction =
	| { type: "receive" }
	| { type: "sign-transaction" }
	| { type: "recover" }
	| { type: "vault-policy-edit" };

export type MobileActionResult =
	| { status: "ready"; action: MobileAction["type"] }
	| { status: "biometric-required"; action: MobileAction["type"] };

export type MobileQrPayload =
	| {
			kind: "send";
			recipient: string;
			amountMist?: string;
	  }
	| { kind: "unknown"; raw: string };

export type MobileRiskLevel = "low" | "medium" | "high" | "critical";

export type MobileSignReview = {
	requestId: string;
	origin: string;
	summary: string;
	worstRiskLevel: MobileRiskLevel;
	txBytes: string;
};

export type MobileSignReviewDecision =
	| {
			decision: "approve";
			signature: string;
	  }
	| {
			decision: "reject";
			reason: string;
	  };

export type MobileSignReviewResult =
	| {
			status: "biometric-required";
			requestId: string;
	  }
	| {
			status: "approved";
			requestId: string;
			signature: string;
	  }
	| {
			status: "rejected";
			requestId: string;
			reason: string;
	  };

const capabilities: MobileCapability[] = [
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
];

export const createMobileWalletShell = ({
	biometricUnlocked = false,
}: {
	biometricUnlocked?: boolean;
} = {}): MobileWalletShell => ({
	biometricUnlocked,
	capabilities,
	tabs: [
		{ id: "portfolio", capabilities: ["portfolio", "notifications"] },
		{ id: "activity", capabilities: ["activity", "safe-signing"] },
		{
			id: "actions",
			capabilities: ["send", "receive-qr", "qr-scan", "swap", "stake"],
		},
		{ id: "dapps", capabilities: ["dapp-browser", "safe-signing"] },
		{ id: "settings", capabilities: ["vault-mode", "guardian-recovery"] },
	],
});

export const resolveMobileAction = (
	shell: MobileWalletShell,
	action: MobileAction,
): MobileActionResult => {
	if (requiresBiometric(action) && !shell.biometricUnlocked) {
		return {
			status: "biometric-required",
			action: action.type,
		};
	}

	return {
		status: "ready",
		action: action.type,
	};
};

export const parseMobileQrPayload = (raw: string): MobileQrPayload => {
	try {
		const url = new URL(raw);
		if (url.protocol !== "sui:" || url.hostname !== "pay") {
			return { kind: "unknown", raw };
		}

		const recipient = url.searchParams.get("recipient");
		if (!recipient) {
			return { kind: "unknown", raw };
		}

		const amountMist = url.searchParams.get("amount") ?? undefined;
		return {
			kind: "send",
			recipient,
			...(amountMist ? { amountMist } : {}),
		};
	} catch {
		return { kind: "unknown", raw };
	}
};

export const createMobileSignReview = (
	review: MobileSignReview,
): MobileSignReview => review;

export const resolveMobileSignReview = (
	shell: MobileWalletShell,
	review: MobileSignReview,
	decision: MobileSignReviewDecision,
): MobileSignReviewResult => {
	if (!shell.biometricUnlocked) {
		return {
			status: "biometric-required",
			requestId: review.requestId,
		};
	}

	if (decision.decision === "approve") {
		return {
			status: "approved",
			requestId: review.requestId,
			signature: decision.signature,
		};
	}

	return {
		status: "rejected",
		requestId: review.requestId,
		reason: decision.reason,
	};
};

const requiresBiometric = (action: MobileAction) =>
	action.type === "sign-transaction" ||
	action.type === "recover" ||
	action.type === "vault-policy-edit";
