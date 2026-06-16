"use client";

import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	decryptSecret,
	type EncryptedKeystore,
	encryptSecret,
} from "./secret-box";
import {
	createBrowserSuiClient,
	type WalletNetwork,
} from "./sui-browser-client";

const STORAGE_KEY = "aegis.wallet.v1";
const NETWORK: WalletNetwork = "testnet";

type StoredAccount = {
	address: string;
	label: string;
	encrypted: EncryptedKeystore;
};

type WalletStore = {
	accounts: StoredAccount[];
	activeAddress: string | null;
};

export type WalletAccountMeta = {
	address: string;
	label: string;
};

export type WalletStatus = "loading" | "empty" | "locked" | "unlocked";

export type WalletAccountContextValue = {
	status: WalletStatus;
	accounts: WalletAccountMeta[];
	activeAddress: string | null;
	network: WalletNetwork;
	client: SuiJsonRpcClient;
	signer: Ed25519Keypair | null;
	createAccount: (input: { label: string; password: string }) => Promise<void>;
	importAccount: (input: {
		label: string;
		secretKey: string;
		password: string;
	}) => Promise<void>;
	unlock: (password: string) => Promise<void>;
	lock: () => void;
	setActive: (address: string) => void;
	removeAccount: (address: string) => void;
};

const loadStore = (): WalletStore => {
	if (typeof window === "undefined") {
		return { accounts: [], activeAddress: null };
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return { accounts: [], activeAddress: null };
		}
		return JSON.parse(raw) as WalletStore;
	} catch {
		return { accounts: [], activeAddress: null };
	}
};

const saveStore = (store: WalletStore): void => {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

const WalletAccountContext = createContext<WalletAccountContextValue | null>(
	null,
);

export const WalletAccountProvider = ({
	children,
}: {
	children: ReactNode;
}): ReactNode => {
	const [store, setStore] = useState<WalletStore>({
		accounts: [],
		activeAddress: null,
	});
	const [hydrated, setHydrated] = useState(false);
	const [signer, setSigner] = useState<Ed25519Keypair | null>(null);

	useEffect(() => {
		setStore(loadStore());
		setHydrated(true);
	}, []);

	const client = useMemo(() => createBrowserSuiClient(NETWORK), []);

	const persist = useCallback((next: WalletStore) => {
		setStore(next);
		saveStore(next);
	}, []);

	const adoptKeypair = useCallback(
		async (keypair: Ed25519Keypair, label: string, password: string) => {
			const address = keypair.toSuiAddress();
			const encrypted = await encryptSecret(keypair.getSecretKey(), password);
			const next = loadStore();
			const accounts = [
				...next.accounts.filter((account) => account.address !== address),
				{ address, label, encrypted },
			];
			persist({ accounts, activeAddress: address });
			setSigner(keypair);
		},
		[persist],
	);

	const createAccount = useCallback(
		async ({ label, password }: { label: string; password: string }) => {
			await adoptKeypair(Ed25519Keypair.generate(), label, password);
		},
		[adoptKeypair],
	);

	const importAccount = useCallback(
		async ({
			label,
			secretKey,
			password,
		}: {
			label: string;
			secretKey: string;
			password: string;
		}) => {
			const keypair = Ed25519Keypair.fromSecretKey(secretKey.trim());
			await adoptKeypair(keypair, label, password);
		},
		[adoptKeypair],
	);

	const unlock = useCallback(
		async (password: string) => {
			const active = store.accounts.find(
				(account) => account.address === store.activeAddress,
			);
			if (!active) {
				throw new Error("no active account to unlock");
			}
			const secretKey = await decryptSecret(active.encrypted, password);
			setSigner(Ed25519Keypair.fromSecretKey(secretKey));
		},
		[store],
	);

	const lock = useCallback(() => setSigner(null), []);

	const setActive = useCallback(
		(address: string) => {
			setSigner(null);
			persist({ ...loadStore(), activeAddress: address });
		},
		[persist],
	);

	const removeAccount = useCallback(
		(address: string) => {
			const next = loadStore();
			const accounts = next.accounts.filter(
				(account) => account.address !== address,
			);
			const activeAddress =
				next.activeAddress === address
					? (accounts[0]?.address ?? null)
					: next.activeAddress;
			setSigner(null);
			persist({ accounts, activeAddress });
		},
		[persist],
	);

	const status: WalletStatus = !hydrated
		? "loading"
		: store.accounts.length === 0
			? "empty"
			: signer
				? "unlocked"
				: "locked";

	const value: WalletAccountContextValue = {
		status,
		accounts: store.accounts.map(({ address, label }) => ({ address, label })),
		activeAddress: store.activeAddress,
		network: NETWORK,
		client,
		signer,
		createAccount,
		importAccount,
		unlock,
		lock,
		setActive,
		removeAccount,
	};

	return (
		<WalletAccountContext.Provider value={value}>
			{children}
		</WalletAccountContext.Provider>
	);
};

export const useWalletAccount = (): WalletAccountContextValue => {
	const value = useContext(WalletAccountContext);
	if (!value) {
		throw new Error(
			"useWalletAccount must be used within a WalletAccountProvider",
		);
	}
	return value;
};
