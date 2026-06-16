// Runs in the page's MAIN world. Registers an Aegis wallet via the Sui Wallet
// Standard so any dApp using @mysten/dapp-kit detects it, and proxies every
// feature call to the extension background through the content script.
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import {
	ReadonlyWalletAccount,
	registerWallet,
	type StandardConnectFeature,
	type StandardDisconnectFeature,
	type StandardEventsFeature,
	type StandardEventsListeners,
	SUI_TESTNET_CHAIN,
	type SuiSignAndExecuteTransactionFeature,
	type SuiSignPersonalMessageFeature,
	type SuiSignTransactionFeature,
	type Wallet,
	type WalletAccount,
} from "@mysten/wallet-standard";
import { AEGIS_ICON } from "./icon";
import {
	CHANNEL,
	type ContentToInpage,
	type InpageToContent,
	type WalletAccountInfo,
	type WalletRequest,
} from "./messaging";

type Pending = {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
};
const CHAINS = [SUI_TESTNET_CHAIN] as const;
const pending = new Map<string, Pending>();

window.addEventListener("message", (event: MessageEvent) => {
	if (event.source !== window) {
		return;
	}
	const data = event.data as ContentToInpage | undefined;
	if (!data || data.channel !== CHANNEL || data.kind !== "response") {
		return;
	}
	const entry = pending.get(data.response.id);
	if (!entry) {
		return;
	}
	pending.delete(data.response.id);
	if (data.response.ok) {
		entry.resolve(data.response.result);
	} else {
		entry.reject(new Error(data.response.error));
	}
});

const request = <T>(
	method: WalletRequest["method"],
	extra: Record<string, unknown> = {},
): Promise<T> => {
	const id = crypto.randomUUID();
	const message: InpageToContent = {
		channel: CHANNEL,
		kind: "request",
		request: {
			id,
			origin: window.location.origin,
			method,
			...extra,
		} as WalletRequest,
	};
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
		window.postMessage(message, window.location.origin);
	});
};

const toAccount = (info: WalletAccountInfo): WalletAccount =>
	new ReadonlyWalletAccount({
		address: info.address,
		publicKey: fromBase64(info.publicKey),
		chains: CHAINS,
		features: [
			"sui:signTransaction",
			"sui:signAndExecuteTransaction",
			"sui:signPersonalMessage",
		],
		label: info.label,
	});

class AegisWallet implements Wallet {
	#accounts: readonly WalletAccount[] = [];
	#changeListeners: StandardEventsListeners["change"][] = [];

	get version() {
		return "1.0.0" as const;
	}
	get name() {
		return "Aegis";
	}
	get icon() {
		return AEGIS_ICON as Wallet["icon"];
	}
	get chains() {
		return CHAINS;
	}
	get accounts() {
		return this.#accounts;
	}

	get features(): StandardConnectFeature &
		StandardDisconnectFeature &
		StandardEventsFeature &
		SuiSignTransactionFeature &
		SuiSignAndExecuteTransactionFeature &
		SuiSignPersonalMessageFeature {
		return {
			"standard:connect": { version: "1.0.0", connect: this.#connect },
			"standard:disconnect": { version: "1.0.0", disconnect: this.#disconnect },
			"standard:events": { version: "1.0.0", on: this.#on },
			"sui:signTransaction": {
				version: "2.0.0",
				signTransaction: this.#signTransaction,
			},
			"sui:signAndExecuteTransaction": {
				version: "2.0.0",
				signAndExecuteTransaction: this.#signAndExecuteTransaction,
			},
			"sui:signPersonalMessage": {
				version: "1.1.0",
				signPersonalMessage: this.#signPersonalMessage,
			},
		};
	}

	#setAccounts(infos: WalletAccountInfo[]) {
		this.#accounts = infos.map(toAccount);
		for (const listener of this.#changeListeners) {
			listener({ accounts: this.#accounts });
		}
	}

	#connect = async () => {
		const { accounts } = await request<{ accounts: WalletAccountInfo[] }>(
			"connect",
		);
		this.#setAccounts(accounts);
		return { accounts: this.#accounts };
	};

	#disconnect = async () => {
		await request("disconnect");
		this.#setAccounts([]);
	};

	#on = <E extends keyof StandardEventsListeners>(
		event: E,
		listener: StandardEventsListeners[E],
	) => {
		if (event === "change") {
			const changeListener = listener as StandardEventsListeners["change"];
			this.#changeListeners.push(changeListener);
			return () => {
				this.#changeListeners = this.#changeListeners.filter(
					(candidate) => candidate !== changeListener,
				);
			};
		}
		return () => {};
	};

	#signTransaction = async (input: {
		transaction: { toJSON: () => Promise<string> };
		account: WalletAccount;
		chain: string;
	}) => {
		const transaction = await input.transaction.toJSON();
		return request<{ bytes: string; signature: string }>("signTransaction", {
			transaction,
			account: input.account.address,
			chain: input.chain,
		});
	};

	#signAndExecuteTransaction = async (input: {
		transaction: { toJSON: () => Promise<string> };
		account: WalletAccount;
		chain: string;
	}) => {
		const transaction = await input.transaction.toJSON();
		return request<{
			digest: string;
			bytes: string;
			signature: string;
			effects: string;
		}>("signAndExecuteTransaction", {
			transaction,
			account: input.account.address,
			chain: input.chain,
		});
	};

	#signPersonalMessage = async (input: {
		message: Uint8Array;
		account: WalletAccount;
	}) => {
		return request<{ bytes: string; signature: string }>(
			"signPersonalMessage",
			{ message: toBase64(input.message), account: input.account.address },
		);
	};
}

registerWallet(new AegisWallet());
