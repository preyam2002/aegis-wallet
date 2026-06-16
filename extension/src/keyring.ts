import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { WalletAccountInfo } from "./messaging";
import {
	decryptSecret,
	type EncryptedSecret,
	encryptSecret,
} from "./secret-box";

const LOCAL_KEY = "aegis.ext.accounts.v1";
const ORIGINS_KEY = "aegis.ext.origins.v1";
const SESSION_KEY = "aegis.ext.unlocked.v1";

type StoredAccount = {
	address: string;
	label: string;
	publicKey: string;
	encrypted: EncryptedSecret;
};

const localGet = async (): Promise<StoredAccount[]> => {
	const data = await chrome.storage.local.get(LOCAL_KEY);
	return (data[LOCAL_KEY] as StoredAccount[]) ?? [];
};

const localSet = (accounts: StoredAccount[]): Promise<void> =>
	chrome.storage.local.set({ [LOCAL_KEY]: accounts });

const sessionSecrets = async (): Promise<Record<string, string>> => {
	const data = await chrome.storage.session.get(SESSION_KEY);
	return (data[SESSION_KEY] as Record<string, string>) ?? {};
};

const setSessionSecrets = (secrets: Record<string, string>): Promise<void> =>
	chrome.storage.session.set({ [SESSION_KEY]: secrets });

const toInfo = (account: StoredAccount): WalletAccountInfo => ({
	address: account.address,
	publicKey: account.publicKey,
	label: account.label,
});

const adopt = async (
	keypair: Ed25519Keypair,
	label: string,
	password: string,
): Promise<WalletAccountInfo> => {
	const address = keypair.toSuiAddress();
	const account: StoredAccount = {
		address,
		label,
		publicKey: keypair.getPublicKey().toBase64(),
		encrypted: await encryptSecret(keypair.getSecretKey(), password),
	};
	const accounts = [
		...(await localGet()).filter((existing) => existing.address !== address),
		account,
	];
	await localSet(accounts);
	await setSessionSecrets({
		...(await sessionSecrets()),
		[address]: keypair.getSecretKey(),
	});
	return toInfo(account);
};

export const createAccount = (input: {
	label: string;
	password: string;
}): Promise<WalletAccountInfo> =>
	adopt(Ed25519Keypair.generate(), input.label, input.password);

export const importAccount = (input: {
	label: string;
	secretKey: string;
	password: string;
}): Promise<WalletAccountInfo> =>
	adopt(
		Ed25519Keypair.fromSecretKey(input.secretKey.trim()),
		input.label,
		input.password,
	);

export const listAccounts = async (): Promise<WalletAccountInfo[]> =>
	(await localGet()).map(toInfo);

export const hasAccounts = async (): Promise<boolean> =>
	(await localGet()).length > 0;

export const unlock = async (password: string): Promise<number> => {
	const accounts = await localGet();
	const secrets: Record<string, string> = {};
	for (const account of accounts) {
		try {
			secrets[account.address] = await decryptSecret(
				account.encrypted,
				password,
			);
		} catch {
			// account encrypted under a different password; leave it locked
		}
	}
	if (Object.keys(secrets).length === 0) {
		throw new Error("incorrect password");
	}
	await setSessionSecrets({ ...(await sessionSecrets()), ...secrets });
	return Object.keys(secrets).length;
};

export const lock = (): Promise<void> =>
	chrome.storage.session.remove(SESSION_KEY);

export const isLocked = async (): Promise<boolean> => {
	if (!(await hasAccounts())) {
		return false;
	}
	return Object.keys(await sessionSecrets()).length === 0;
};

export const unlockedAccounts = async (): Promise<WalletAccountInfo[]> => {
	const secrets = await sessionSecrets();
	return (await listAccounts()).filter((account) => secrets[account.address]);
};

export const getSigner = async (
	address: string,
): Promise<Ed25519Keypair | null> => {
	const secret = (await sessionSecrets())[address];
	return secret ? Ed25519Keypair.fromSecretKey(secret) : null;
};

export const getApprovedAddresses = async (
	origin: string,
): Promise<string[]> => {
	const data = await chrome.storage.local.get(ORIGINS_KEY);
	const map = (data[ORIGINS_KEY] as Record<string, string[]>) ?? {};
	return map[origin] ?? [];
};

export const approveOrigin = async (
	origin: string,
	addresses: string[],
): Promise<void> => {
	const data = await chrome.storage.local.get(ORIGINS_KEY);
	const map = (data[ORIGINS_KEY] as Record<string, string[]>) ?? {};
	map[origin] = addresses;
	await chrome.storage.local.set({ [ORIGINS_KEY]: map });
};

export const revokeOrigin = async (origin: string): Promise<void> => {
	const data = await chrome.storage.local.get(ORIGINS_KEY);
	const map = (data[ORIGINS_KEY] as Record<string, string[]>) ?? {};
	delete map[origin];
	await chrome.storage.local.set({ [ORIGINS_KEY]: map });
};
