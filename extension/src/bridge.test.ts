import { describe, expect, it } from "vitest";
import { createExtensionBridge } from "./bridge";

describe("Aegis extension bridge", () => {
	it("creates origin-scoped sessions and disconnects them", () => {
		const bridge = createExtensionBridge();

		const connected = bridge.handle({
			type: "aegis:connect",
			origin: "https://app.example",
			siteName: "Example dApp",
		});

		expect(connected).toMatchObject({
			type: "aegis:connected",
			origin: "https://app.example",
			siteName: "Example dApp",
		});

		expect(
			bridge.handle({
				type: "aegis:disconnect",
				origin: "https://app.example",
			}),
		).toEqual({
			type: "aegis:disconnected",
			origin: "https://app.example",
		});
	});

	it("rejects sign requests before a dApp is connected", () => {
		const bridge = createExtensionBridge();

		expect(
			bridge.handle({
				type: "aegis:simulate-and-sign",
				origin: "https://app.example",
				txBytes: "AAECAw==",
			}),
		).toEqual({
			type: "aegis:error",
			origin: "https://app.example",
			reason: "origin is not connected",
		});
	});

	it("queues connected sign requests for the safe-signing UI", () => {
		const bridge = createExtensionBridge({ activeAddress: "0xabc" });
		bridge.handle({
			type: "aegis:connect",
			origin: "https://app.example",
			siteName: "Example dApp",
		});

		expect(
			bridge.handle({
				type: "aegis:simulate-and-sign",
				origin: "https://app.example",
				txBytes: "AAECAw==",
			}),
		).toMatchObject({
			type: "aegis:sign-review-required",
			origin: "https://app.example",
			address: "0xabc",
			txBytes: "AAECAw==",
		});
	});

	it("resolves pending safe-signing reviews from the popup decision", () => {
		const bridge = createExtensionBridge({
			activeAddress: "0xabc",
			now: () => 1_700_000_000,
		});
		bridge.handle({
			type: "aegis:connect",
			origin: "https://app.example",
			siteName: "Example dApp",
		});

		const queued = bridge.handle({
			type: "aegis:simulate-and-sign",
			origin: "https://app.example",
			txBytes: "AAECAw==",
		});

		expect(bridge.pendingReviews()).toEqual([
			{
				requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
				origin: "https://app.example",
				address: "0xabc",
				txBytes: "AAECAw==",
				createdAt: 1_700_000_000,
			},
		]);
		expect(
			bridge.resolveReview({
				requestId:
					queued.type === "aegis:sign-review-required"
						? queued.requestId
						: "missing",
				decision: "reject",
				reason: "User rejected the simulated drain.",
			}),
		).toEqual({
			type: "aegis:sign-rejected",
			requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
			reason: "User rejected the simulated drain.",
		});
		expect(bridge.pendingReviews()).toEqual([]);
	});

	it("returns the approved signature for a pending dApp sign review", () => {
		const bridge = createExtensionBridge({ now: () => 42 });
		bridge.handle({
			type: "aegis:connect",
			origin: "https://app.example",
			siteName: "Example dApp",
		});
		const queued = bridge.handle({
			type: "aegis:simulate-and-sign",
			origin: "https://app.example",
			txBytes: "AAECAw==",
		});

		expect(
			bridge.resolveReview({
				requestId:
					queued.type === "aegis:sign-review-required"
						? queued.requestId
						: "missing",
				decision: "approve",
				signature: "user-signature",
			}),
		).toEqual({
			type: "aegis:sign-approved",
			requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:42",
			signature: "user-signature",
		});
		expect(bridge.pendingReviews()).toEqual([]);
	});
});
