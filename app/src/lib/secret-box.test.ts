// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

const SECRET =
	"suiprivkey1qg9q0e0y9wz4z9q0e0y9wz4z9q0e0y9wz4z9q0e0y9wz4z9q0e0y9wz4z";

describe("keystore", () => {
	it("round-trips a secret through encrypt/decrypt with the right password", async () => {
		const blob = await encryptSecret(SECRET, "correct horse battery");
		expect(blob.cipher).toBe("AES-GCM");
		expect(blob.data).not.toContain(SECRET);
		await expect(decryptSecret(blob, "correct horse battery")).resolves.toBe(
			SECRET,
		);
	});

	it("rejects an incorrect password", async () => {
		const blob = await encryptSecret(SECRET, "correct horse battery");
		await expect(decryptSecret(blob, "wrong password")).rejects.toThrow(
			"incorrect password",
		);
	});

	it("uses a fresh salt and iv per encryption", async () => {
		const a = await encryptSecret(SECRET, "pw");
		const b = await encryptSecret(SECRET, "pw");
		expect(a.salt).not.toBe(b.salt);
		expect(a.iv).not.toBe(b.iv);
		expect(a.data).not.toBe(b.data);
	});

	it("refuses to encrypt with an empty password", async () => {
		await expect(encryptSecret(SECRET, "")).rejects.toThrow();
	});
});
