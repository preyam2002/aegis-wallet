import { fromBase64, toBase64 } from "@mysten/sui/utils";

export type EncryptedKeystore = {
	v: 1;
	cipher: "AES-GCM";
	kdf: "PBKDF2";
	iterations: number;
	salt: string;
	iv: string;
	data: string;
};

const PBKDF2_ITERATIONS = 210_000;
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
			iterations: PBKDF2_ITERATIONS,
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
): Promise<EncryptedKeystore> => {
	if (password.length === 0) {
		throw new Error("a non-empty password is required to encrypt the wallet");
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
		cipher: "AES-GCM",
		kdf: "PBKDF2",
		iterations: PBKDF2_ITERATIONS,
		salt: toBase64(salt),
		iv: toBase64(iv),
		data: toBase64(new Uint8Array(ciphertext)),
	};
};

export const decryptSecret = async (
	blob: EncryptedKeystore,
	password: string,
): Promise<string> => {
	const key = await deriveKey(password, fromBase64(blob.salt));

	let plaintext: ArrayBuffer;
	try {
		plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: new Uint8Array(fromBase64(blob.iv)) },
			key,
			new Uint8Array(fromBase64(blob.data)),
		);
	} catch {
		throw new Error("incorrect password");
	}

	return decoder.decode(plaintext);
};
