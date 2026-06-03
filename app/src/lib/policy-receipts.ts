import type { SuiClientTypes } from "@mysten/sui/client";

type SuiEvent = Pick<
	SuiClientTypes.Event,
	"eventType" | "json" | "module" | "packageId" | "sender" | "bcs"
>;

export type PolicyReceipt = {
	digest: string;
	status: "passed" | "rejected";
	policyId: string;
	txDigest: string;
	reason: string;
};

export type PolicyReceiptClient = {
	core: {
		getTransaction(options: {
			digest: string;
			include: { events: true };
		}): Promise<
			| { Transaction: { events: SuiEvent[] } }
			| { FailedTransaction: { events: SuiEvent[] } }
		>;
	};
};

export const extractPolicyReceipts = (
	digest: string,
	events: SuiEvent[],
): PolicyReceipt[] =>
	events.flatMap((event) => {
		if (event.module !== "policy" || !event.json) {
			return [];
		}

		const status = statusFromEventType(event.eventType);
		if (!status) {
			return [];
		}

		return [
			{
				digest,
				status,
				policyId: stringifyEventField(event.json.policy_id),
				txDigest: stringifyVectorField(event.json.tx_digest, "digest"),
				reason: stringifyVectorField(event.json.reason, "text"),
			},
		];
	});

export const fetchPolicyReceipts = async (
	client: PolicyReceiptClient,
	digests: string[],
): Promise<PolicyReceipt[]> => {
	const receipts = await Promise.all(
		digests.map(async (digest) => {
			const result = await client.core.getTransaction({
				digest,
				include: { events: true },
			});
			const transaction =
				"Transaction" in result ? result.Transaction : result.FailedTransaction;
			return extractPolicyReceipts(digest, transaction.events ?? []);
		}),
	);

	return receipts.flat();
};

const statusFromEventType = (
	eventType: string,
): PolicyReceipt["status"] | null => {
	if (eventType.endsWith("::policy::PolicyPassed")) {
		return "passed";
	}
	if (eventType.endsWith("::policy::PolicyRejected")) {
		return "rejected";
	}
	return null;
};

const stringifyEventField = (value: unknown): string => {
	if (typeof value === "string") {
		return value;
	}
	return stringifyVectorField(value, "text");
};

const stringifyVectorField = (
	value: unknown,
	mode: "digest" | "text",
): string => {
	if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
		return bytesToDisplay(new Uint8Array(value));
	}
	if (typeof value === "string" && shouldDecodeBase64(value, mode)) {
		return bytesToDisplay(base64ToBytes(value));
	}
	return typeof value === "string" ? value : "";
};

const shouldDecodeBase64 = (
	value: string,
	mode: "digest" | "text",
): boolean => {
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
		return false;
	}
	if (mode === "text") {
		return value.includes("=");
	}

	const bytes = base64ToBytes(value);
	return value.includes("=") || !isPrintableAscii(bytes);
};

const base64ToBytes = (value: string): Uint8Array =>
	Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const bytesToDisplay = (bytes: Uint8Array): string =>
	isPrintableAscii(bytes)
		? new TextDecoder().decode(bytes)
		: `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const isPrintableAscii = (bytes: Uint8Array): boolean =>
	bytes.every((byte) => byte >= 0x20 && byte <= 0x7e);
