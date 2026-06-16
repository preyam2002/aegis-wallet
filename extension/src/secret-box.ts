import { fromBase64, toBase64 } from "@mysten/sui/utils";

export type EncryptedSecret = {
	v: 1;
	salt: string;
	iv: string;
	iterations: number;
	data: string;
};

const ITERATIONS = 210_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const deriveKey = async (
	password: string,
	salt: Uint8Array,
): Promise<CryptoKey> => {
	const baseKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: new Uint8Array(salt),
			iterations: ITERATIONS,
			hash: "SHA-256",
		},
		baseKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
};

export const encryptSecret = async (
	secret: string,
	password: string,
): Promise<EncryptedSecret> => {
	if (!password) {
		throw new Error("a password is required");
	}
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: new Uint8Array(iv) },
		key,
		encoder.encode(secret),
	);
	return {
		v: 1,
		salt: toBase64(salt),
		iv: toBase64(iv),
		iterations: ITERATIONS,
		data: toBase64(new Uint8Array(ciphertext)),
	};
};

export const decryptSecret = async (
	blob: EncryptedSecret,
	password: string,
): Promise<string> => {
	const key = await deriveKey(password, fromBase64(blob.salt));
	try {
		const plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: new Uint8Array(fromBase64(blob.iv)) },
			key,
			new Uint8Array(fromBase64(blob.data)),
		);
		return decoder.decode(plaintext);
	} catch {
		throw new Error("incorrect password");
	}
};
