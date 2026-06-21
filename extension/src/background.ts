import { summarizeDryRun } from "@aegis/shared/dry-run-summary";
import type { SimSummary } from "@aegis/shared/sim-summary";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import {
	type AiVerdict,
	fetchAiVerdict,
	mergeRiskLevel,
	primaryRecipient,
} from "./ai-risk";
import * as keyring from "./keyring";
import type {
	RuntimeMessage,
	WalletAccountInfo,
	WalletRequest,
	WalletResponse,
} from "./messaging";
import { assessTransaction, type TxAssessment } from "./risk";

const client = new SuiJsonRpcClient({
	url: getJsonRpcFullnodeUrl("testnet"),
	network: "testnet",
});

export type PendingPreview = {
	origin: string;
	method: WalletRequest["method"];
	sim?: SimSummary;
	assessment?: TxAssessment;
	/** AI judge verdict (advisory). Absent when the risk service is unreachable. */
	ai?: AiVerdict;
	/** True when the AI judge could not be reached and only rules were applied. */
	aiUnavailable?: boolean;
	message?: string;
};

type Pending = {
	request: WalletRequest;
	preview: PendingPreview;
	resolve: (approved: boolean) => void;
	windowId?: number;
};

const pending = new Map<string, Pending>();

const requestApproval = async (
	request: WalletRequest,
	preview: PendingPreview,
): Promise<boolean> =>
	new Promise<boolean>((resolve) => {
		pending.set(request.id, { request, preview, resolve });
		chrome.windows
			.create({
				url: chrome.runtime.getURL(`popup.html?request=${request.id}`),
				type: "popup",
				width: 400,
				height: 640,
			})
			.then((win) => {
				const entry = pending.get(request.id);
				if (entry) {
					entry.windowId = win?.id;
				}
			});
	});

const settlePending = (id: string, approved: boolean): void => {
	const entry = pending.get(id);
	if (!entry) {
		return;
	}
	pending.delete(id);
	entry.resolve(approved);
	if (entry.windowId !== undefined) {
		chrome.windows.remove(entry.windowId).catch(() => {});
	}
};

// If the user closes the approval window, treat it as a rejection.
chrome.windows.onRemoved.addListener((windowId) => {
	for (const [id, entry] of pending) {
		if (entry.windowId === windowId) {
			pending.delete(id);
			entry.resolve(false);
		}
	}
});

const handleConnect = async (
	request: WalletRequest,
): Promise<WalletAccountInfo[]> => {
	const approvedAddresses = await keyring.getApprovedAddresses(request.origin);
	const needsApproval =
		!(await keyring.hasAccounts()) ||
		(await keyring.isLocked()) ||
		approvedAddresses.length === 0;

	if (needsApproval) {
		const approved = await requestApproval(request, {
			origin: request.origin,
			method: "connect",
		});
		if (!approved) {
			throw new Error("Connection request rejected");
		}
	}

	const accounts = await keyring.unlockedAccounts();
	if (accounts.length === 0) {
		throw new Error("No unlocked accounts");
	}
	await keyring.approveOrigin(
		request.origin,
		accounts.map((account) => account.address),
	);
	return accounts;
};

const simulate = async (
	bytes: Uint8Array,
	sender: string,
	origin: string,
): Promise<{
	sim: SimSummary;
	assessment: TxAssessment;
	ai?: AiVerdict;
	aiUnavailable: boolean;
}> => {
	const dryRun = await client.dryRunTransactionBlock({
		transactionBlock: bytes,
	});
	const sim = summarizeDryRun(dryRun as never, sender);
	let totalMist: bigint | undefined;
	try {
		totalMist = BigInt(
			(await client.getBalance({ owner: sender })).totalBalance,
		);
	} catch {
		totalMist = undefined;
	}

	// Deterministic rules are the hard-floor + fallback; the AI judge is advisory.
	const deterministic = assessTransaction(sim, { totalMist });
	const ai = await fetchAiVerdict(sim, {
		origin,
		sender,
		recipient: primaryRecipient(sim),
		knownRecipient: false,
	});
	const riskLevel = ai
		? mergeRiskLevel(deterministic.riskLevel, ai.riskLevel)
		: deterministic.riskLevel;

	return {
		sim,
		assessment: { ...deterministic, riskLevel },
		ai: ai ?? undefined,
		aiUnavailable: ai === null,
	};
};

const handleSign = async (
	request: Extract<
		WalletRequest,
		{ method: "signTransaction" | "signAndExecuteTransaction" }
	>,
	execute: boolean,
): Promise<unknown> => {
	const tx = Transaction.from(request.transaction);
	tx.setSenderIfNotSet(request.account);
	const bytes = await tx.build({ client });
	const { sim, assessment, ai, aiUnavailable } = await simulate(
		bytes,
		request.account,
		request.origin,
	);

	const approved = await requestApproval(request, {
		origin: request.origin,
		method: request.method,
		sim,
		assessment,
		ai,
		aiUnavailable,
	});
	if (!approved) {
		throw new Error("Transaction rejected in Aegis");
	}

	const signer = await keyring.getSigner(request.account);
	if (!signer) {
		throw new Error("Wallet is locked");
	}
	const signed = await signer.signTransaction(bytes);

	if (!execute) {
		return { bytes: signed.bytes, signature: signed.signature };
	}

	const result = await client.executeTransactionBlock({
		transactionBlock: signed.bytes,
		signature: signed.signature,
		options: { showRawEffects: true, showEffects: true },
	});
	return {
		digest: result.digest,
		bytes: signed.bytes,
		signature: signed.signature,
		effects: result.rawEffects
			? toBase64(Uint8Array.from(result.rawEffects))
			: "",
	};
};

const handleSignMessage = async (
	request: Extract<WalletRequest, { method: "signPersonalMessage" }>,
): Promise<unknown> => {
	const approved = await requestApproval(request, {
		origin: request.origin,
		method: "signPersonalMessage",
		message: new TextDecoder().decode(fromBase64(request.message)),
	});
	if (!approved) {
		throw new Error("Message signing rejected in Aegis");
	}
	const signer = await keyring.getSigner(request.account);
	if (!signer) {
		throw new Error("Wallet is locked");
	}
	const { bytes, signature } = await signer.signPersonalMessage(
		fromBase64(request.message),
	);
	return { bytes, signature };
};

const handleRequest = async (
	request: WalletRequest,
): Promise<WalletResponse> => {
	try {
		switch (request.method) {
			case "connect":
				return {
					id: request.id,
					ok: true,
					result: { accounts: await handleConnect(request) },
				};
			case "getAccounts": {
				const approved = await keyring.getApprovedAddresses(request.origin);
				const unlocked = await keyring.unlockedAccounts();
				return {
					id: request.id,
					ok: true,
					result: {
						accounts: unlocked.filter((account) =>
							approved.includes(account.address),
						),
					},
				};
			}
			case "disconnect":
				await keyring.revokeOrigin(request.origin);
				return { id: request.id, ok: true, result: null };
			case "signTransaction":
				return {
					id: request.id,
					ok: true,
					result: await handleSign(request, false),
				};
			case "signAndExecuteTransaction":
				return {
					id: request.id,
					ok: true,
					result: await handleSign(request, true),
				};
			case "signPersonalMessage":
				return {
					id: request.id,
					ok: true,
					result: await handleSignMessage(request),
				};
		}
	} catch (error) {
		return {
			id: request.id,
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
};

const popupState = async () => ({
	hasAccounts: await keyring.hasAccounts(),
	locked: await keyring.isLocked(),
	accounts: await keyring.listAccounts(),
});

chrome.runtime.onMessage.addListener(
	(message: RuntimeMessage, _sender, sendResponse) => {
		(async () => {
			switch (message.type) {
				case "dapp-request":
					sendResponse(await handleRequest(message.request));
					return;
				case "popup:state":
					sendResponse(await popupState());
					return;
				case "popup:get-pending": {
					const entry = pending.get(message.id);
					sendResponse(entry ? entry.preview : null);
					return;
				}
				case "popup:resolve":
					settlePending(message.id, message.approved);
					sendResponse({ ok: true });
					return;
				case "popup:create":
					await keyring.createAccount(message);
					sendResponse(await popupState());
					return;
				case "popup:import":
					await keyring.importAccount(message);
					sendResponse(await popupState());
					return;
				case "popup:unlock":
					try {
						await keyring.unlock(message.password);
						sendResponse(await popupState());
					} catch {
						sendResponse({ error: "incorrect password" });
					}
					return;
				case "popup:lock":
					await keyring.lock();
					sendResponse(await popupState());
					return;
			}
		})().catch((error) => {
			sendResponse({
				error: error instanceof Error ? error.message : String(error),
			});
		});
		return true;
	},
);
