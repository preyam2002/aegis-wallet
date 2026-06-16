// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

const SECRET = "suiprivkey1qg9q0e0y9wz4z9q0e0y9wz4z9q0e0y9wz4z9q0e0y9wz4z9q0e0";

describe("extension secret-box", () => {
	it("round-trips a secret with the correct password", async () => {
		const blob = await encryptSecret(SECRET, "open sesame please");
		expect(blob.data).not.toContain(SECRET);
		await expect(decryptSecret(blob, "open sesame please")).resolves.toBe(
			SECRET,
		);
	});

	it("rejects the wrong password", async () => {
		const blob = await encryptSecret(SECRET, "open sesame please");
		await expect(decryptSecret(blob, "nope")).rejects.toThrow(
			"incorrect password",
		);
	});
});
