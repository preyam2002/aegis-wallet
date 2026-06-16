// Message protocol shared across the three extension contexts:
//   page (inpage wallet) <-postMessage-> content script <-runtime-> background
export const CHANNEL = "aegis-wallet";

export type WalletRequest =
	| { id: string; origin: string; method: "connect" }
	| { id: string; origin: string; method: "disconnect" }
	| { id: string; origin: string; method: "getAccounts" }
	| {
			id: string;
			origin: string;
			method: "signTransaction";
			account: string;
			chain: string;
			transaction: string;
	  }
	| {
			id: string;
			origin: string;
			method: "signAndExecuteTransaction";
			account: string;
			chain: string;
			transaction: string;
	  }
	| {
			id: string;
			origin: string;
			method: "signPersonalMessage";
			account: string;
			message: string;
	  };

export type WalletAccountInfo = {
	address: string;
	publicKey: string; // base64
	label: string;
};

export type WalletResponse =
	| { id: string; ok: true; result: unknown }
	| { id: string; ok: false; error: string };

// page <-> content envelopes (postMessage)
export type InpageToContent = {
	channel: typeof CHANNEL;
	kind: "request";
	request: WalletRequest;
};
export type ContentToInpage =
	| { channel: typeof CHANNEL; kind: "response"; response: WalletResponse }
	| { channel: typeof CHANNEL; kind: "event"; event: WalletEvent };

export type WalletEvent =
	| { type: "accountsChanged"; accounts: WalletAccountInfo[] }
	| { type: "disconnect" };

// content/popup <-> background (chrome.runtime.sendMessage)
export type RuntimeMessage =
	| { type: "dapp-request"; request: WalletRequest }
	| { type: "popup:get-pending"; id: string }
	| { type: "popup:resolve"; id: string; approved: boolean }
	| { type: "popup:state" }
	| { type: "popup:create"; label: string; password: string }
	| { type: "popup:import"; label: string; secretKey: string; password: string }
	| { type: "popup:unlock"; password: string }
	| { type: "popup:lock" };
