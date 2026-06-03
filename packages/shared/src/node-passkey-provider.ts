import { webcrypto } from "node:crypto";
import type { PasskeyProvider } from "@mysten/sui/keypairs/passkey";

type Registration = Awaited<ReturnType<PasskeyProvider["create"]>>;
type Authentication = Awaited<ReturnType<PasskeyProvider["get"]>>;

export class NodePasskeyProvider implements PasskeyProvider {
	#keyPair: CryptoKeyPair;
	#credentialId: Uint8Array;
	#rpIdHash: Uint8Array;

	private constructor(
		keyPair: CryptoKeyPair,
		credentialId: Uint8Array,
		rpIdHash: Uint8Array,
	) {
		this.#keyPair = keyPair;
		this.#credentialId = credentialId;
		this.#rpIdHash = rpIdHash;
	}

	static async create(rpId = "aegis.local"): Promise<NodePasskeyProvider> {
		const keyPair = await webcrypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);
		const credentialId = webcrypto.getRandomValues(new Uint8Array(32));
		const rpIdHash = new Uint8Array(
			await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId)),
		);

		return new NodePasskeyProvider(keyPair, credentialId, rpIdHash);
	}

	async create(): Promise<Registration> {
		const publicKey = await webcrypto.subtle.exportKey(
			"spki",
			this.#keyPair.publicKey,
		);

		return {
			rawId: toArrayBuffer(this.#credentialId),
			response: {
				getPublicKey: () => publicKey,
			},
		} as Registration;
	}

	async get(
		challenge: Uint8Array,
		credentialId?: Uint8Array,
	): Promise<Authentication> {
		if (credentialId && !bytesEqual(credentialId, this.#credentialId)) {
			throw new Error("Unknown passkey credential id");
		}

		const clientDataJson = JSON.stringify({
			type: "webauthn.get",
			challenge: base64Url(challenge),
			origin: "https://aegis.local",
			crossOrigin: false,
		});
		const clientData = new TextEncoder().encode(clientDataJson);
		const clientDataHash = new Uint8Array(
			await webcrypto.subtle.digest("SHA-256", clientData),
		);
		const authenticatorData = new Uint8Array([
			...this.#rpIdHash,
			0x05,
			0x00,
			0x00,
			0x00,
			0x01,
		]);
		const signedPayload = new Uint8Array([
			...authenticatorData,
			...clientDataHash,
		]);
		const rawSignature = new Uint8Array(
			await webcrypto.subtle.sign(
				{ name: "ECDSA", hash: "SHA-256" },
				this.#keyPair.privateKey,
				signedPayload,
			),
		);

		return {
			rawId: toArrayBuffer(this.#credentialId),
			response: {
				authenticatorData: toArrayBuffer(authenticatorData),
				clientDataJSON: toArrayBuffer(clientData),
				signature: toArrayBuffer(ecdsaRawToDer(rawSignature)),
			},
		} as Authentication;
	}
}

const ecdsaRawToDer = (signature: Uint8Array): Uint8Array => {
	if (signature[0] === 0x30) {
		return signature;
	}
	if (signature.length !== 64) {
		throw new Error(`Unexpected ECDSA signature length: ${signature.length}`);
	}

	const r = derInteger(signature.slice(0, 32));
	const s = derInteger(signature.slice(32));
	return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
};

const derInteger = (value: Uint8Array): Uint8Array => {
	let offset = 0;
	while (offset < value.length - 1 && value[offset] === 0) {
		offset += 1;
	}

	const trimmed = value.slice(offset);
	const encoded =
		trimmed[0] & 0x80
			? new Uint8Array([0, ...trimmed])
			: new Uint8Array(trimmed);

	return new Uint8Array([0x02, encoded.length, ...encoded]);
};

const base64Url = (bytes: Uint8Array): string =>
	Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
	new Uint8Array(bytes).buffer;

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
	left.length === right.length &&
	left.every((byte, index) => byte === right[index]);
