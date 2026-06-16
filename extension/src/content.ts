// Runs in the ISOLATED world. Bridges the page's inpage wallet (postMessage)
// to the background service worker (chrome.runtime).
import {
	CHANNEL,
	type ContentToInpage,
	type InpageToContent,
	type WalletResponse,
} from "./messaging";

window.addEventListener("message", (event: MessageEvent) => {
	if (event.source !== window) {
		return;
	}
	const data = event.data as InpageToContent | undefined;
	if (!data || data.channel !== CHANNEL || data.kind !== "request") {
		return;
	}

	const reply = (response: WalletResponse) => {
		const message: ContentToInpage = {
			channel: CHANNEL,
			kind: "response",
			response,
		};
		window.postMessage(message, window.location.origin);
	};

	chrome.runtime
		.sendMessage({ type: "dapp-request", request: data.request })
		.then((response: WalletResponse) => reply(response))
		.catch((error: unknown) =>
			reply({
				id: data.request.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
});
