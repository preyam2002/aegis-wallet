import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { writeExtensionBundle } from "../extension/src/bundle";

const outDir = new URL("../extension/dist", import.meta.url).pathname;
await writeExtensionBundle(outDir);

type PageMessageEvent = {
	source: unknown;
	data?: Record<string, unknown>;
};

type PostedMessage = {
	message: unknown;
	targetOrigin: string;
};

let messageListener: ((event: PageMessageEvent) => void) | undefined;
const postedMessages: PostedMessage[] = [];
const runtimeMessages: Record<string, unknown>[] = [];
const runtimeResponses: unknown[] = [];

const fakeWindow = {
	location: {
		origin: "https://dapp.example",
	},
	addEventListener(type: string, listener: (event: PageMessageEvent) => void) {
		if (type === "message") {
			messageListener = listener;
		}
	},
	postMessage(message: unknown, targetOrigin: string) {
		postedMessages.push(JSON.parse(JSON.stringify({ message, targetOrigin })));
	},
};

const contentJs = await readFile(
	new URL("../extension/dist/content.js", import.meta.url),
	"utf8",
);

vm.runInNewContext(contentJs, {
	chrome: {
		runtime: {
			sendMessage(
				message: Record<string, unknown>,
				callback: (response: unknown) => void,
			) {
				runtimeMessages.push(JSON.parse(JSON.stringify(message)));
				callback(runtimeResponses.shift());
			},
		},
	},
	window: fakeWindow,
});

if (!messageListener) {
	throw new Error(
		"generated content script did not register a message listener",
	);
}

assert.deepEqual(postedMessages, [
	{
		message: {
			source: "aegis-wallet",
			type: "aegis:ready",
		},
		targetOrigin: "https://dapp.example",
	},
]);

const dispatchPageMessage = (
	data: Record<string, unknown>,
	source = fakeWindow,
) => {
	messageListener?.({
		source,
		data,
	});
};

runtimeResponses.push({
	type: "aegis:connected",
	origin: "https://dapp.example",
	siteName: "Example dApp",
	sessionId: "session:dapp",
});
dispatchPageMessage({
	type: "aegis:connect",
	siteName: "Example dApp",
});

assert.deepEqual(runtimeMessages.at(-1), {
	type: "aegis:connect",
	siteName: "Example dApp",
	origin: "https://dapp.example",
});
assert.deepEqual(postedMessages.at(-1), {
	message: {
		source: "aegis-wallet",
		response: {
			type: "aegis:connected",
			origin: "https://dapp.example",
			siteName: "Example dApp",
			sessionId: "session:dapp",
		},
	},
	targetOrigin: "https://dapp.example",
});

runtimeResponses.push({
	type: "aegis:sign-review-required",
	origin: "https://dapp.example",
	requestId: "review-1",
	txBytes: "AAECAw==",
});
dispatchPageMessage({
	type: "aegis:simulate-and-sign",
	txBytes: "AAECAw==",
});

assert.deepEqual(runtimeMessages.at(-1), {
	type: "aegis:simulate-and-sign",
	txBytes: "AAECAw==",
	origin: "https://dapp.example",
});
assert.deepEqual(postedMessages.at(-1), {
	message: {
		source: "aegis-wallet",
		response: {
			type: "aegis:sign-review-required",
			origin: "https://dapp.example",
			requestId: "review-1",
			txBytes: "AAECAw==",
		},
	},
	targetOrigin: "https://dapp.example",
});

const forwardedCount = runtimeMessages.length;
dispatchPageMessage({
	source: "aegis-wallet",
	type: "aegis:connect",
	siteName: "Loopback",
});
dispatchPageMessage({
	type: "wallet:other",
});
dispatchPageMessage(
	{
		type: "aegis:connect",
		siteName: "Wrong source",
	},
	{},
);
assert.equal(runtimeMessages.length, forwardedCount);

console.log(
	JSON.stringify(
		{
			surface: "extension-content",
			status: "passed",
			origin: "https://dapp.example",
			checked: [
				"ready-event",
				"connect-forward",
				"sign-forward",
				"response-post",
				"loopback-ignore",
			],
		},
		null,
		2,
	),
);
