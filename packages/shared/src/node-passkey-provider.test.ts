import { PasskeyKeypair } from "@mysten/sui/keypairs/passkey";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { describe, expect, it } from "vitest";
import { NodePasskeyProvider } from "./node-passkey-provider";

describe("NodePasskeyProvider", () => {
	it("creates a PasskeyKeypair that produces verifier-compatible passkey signatures", async () => {
		const provider = await NodePasskeyProvider.create();
		const signer = await PasskeyKeypair.getPasskeyInstance(provider);
		const message = new TextEncoder().encode("aegis passkey smoke");

		const { signature } = await signer.signPersonalMessage(message);
		const publicKey = await verifyPersonalMessageSignature(message, signature, {
			address: signer.toSuiAddress(),
		});

		expect(publicKey.toSuiAddress()).toBe(signer.toSuiAddress());
		expect(signer.getCredentialId()).toBeDefined();
	});
});
