import type { AddressBookEntry } from "./transaction-analysis";

const STORAGE_KEY = "aegis.addressbook.v1";

type AddressBookStore = {
	entries: AddressBookEntry[];
	knownRecipients: string[];
};

const empty: AddressBookStore = { entries: [], knownRecipients: [] };

const load = (): AddressBookStore => {
	if (typeof window === "undefined") {
		return empty;
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as AddressBookStore) : empty;
	} catch {
		return empty;
	}
};

const save = (store: AddressBookStore): void => {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const loadAddressBook = (): AddressBookEntry[] => load().entries;

export const loadKnownRecipients = (): string[] => load().knownRecipients;

/** Mark a recipient as trusted after a successful send, so repeat sends are clean. */
export const rememberRecipient = (address: string, label?: string): void => {
	const store = load();
	const normalized = address.toLowerCase();
	const knownRecipients = store.knownRecipients.some(
		(known) => known.toLowerCase() === normalized,
	)
		? store.knownRecipients
		: [...store.knownRecipients, address];
	const entries =
		label && !store.entries.some((entry) => entry.address === address)
			? [...store.entries, { label, address }]
			: store.entries;
	save({ entries, knownRecipients });
};
