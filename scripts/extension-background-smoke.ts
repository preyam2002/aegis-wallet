import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { writeExtensionBundle } from "../extension/src/bundle";

const outDir = new URL("../extension/dist", import.meta.url).pathname;
await writeExtensionBundle(outDir);

let listener:
	| ((
			request: Record<string, unknown>,
			sender: unknown,
			sendResponse: (response: unknown) => void,
	  ) => boolean)
	| undefined;
const backgroundJs = await readFile(
	new URL("../extension/dist/background.js", import.meta.url),
	"utf8",
);

vm.runInNewContext(backgroundJs, {
	btoa,
	chrome: {
		runtime: {
			onMessage: {
				addListener(handler: NonNullable<typeof listener>) {
					listener = handler;
				},
			},
		},
	},
	Date: {
		now: () => 1_700_000_000,
	},
	Map,
	Array,
});

if (!listener) {
	throw new Error("generated background did not register onMessage listener");
}

const send = (request: Record<string, unknown>) => {
	let response: unknown;
	const keepAlive = listener?.(request, {}, (next) => {
		response = next;
	});
	assert.equal(keepAlive, true);
	if (!response) {
		throw new Error(`background returned no response for ${request.type}`);
	}
	return JSON.parse(JSON.stringify(response)) as Record<string, unknown>;
};

const connect = send({
	type: "aegis:connect",
	origin: "https://app.example",
	siteName: "Example dApp",
});
assert.deepEqual(connect, {
	type: "aegis:connected",
	origin: "https://app.example",
	siteName: "Example dApp",
	sessionId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ",
});

const queued = send({
	type: "aegis:simulate-and-sign",
	origin: "https://app.example",
	txBytes: "AAECAw==",
});
assert.deepEqual(queued, {
	type: "aegis:sign-review-required",
	origin: "https://app.example",
	requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
	txBytes: "AAECAw==",
});

assert.deepEqual(send({ type: "aegis:list-reviews" }), {
	type: "aegis:pending-reviews",
	reviews: [
		{
			requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
			origin: "https://app.example",
			txBytes: "AAECAw==",
			createdAt: 1_700_000_000,
		},
	],
});

assert.deepEqual(
	send({
		type: "aegis:resolve-review",
		requestId: queued.requestId,
		decision: "reject",
		reason: "Simulation risk was too high.",
	}),
	{
		type: "aegis:sign-rejected",
		requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
		reason: "Simulation risk was too high.",
	},
);
assert.deepEqual(send({ type: "aegis:list-reviews" }), {
	type: "aegis:pending-reviews",
	reviews: [],
});

send({
	type: "aegis:simulate-and-sign",
	origin: "https://app.example",
	txBytes: "AQIDBA==",
});
assert.deepEqual(
	send({
		type: "aegis:resolve-review",
		requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
		decision: "approve",
		signature: "user-signature",
	}),
	{
		type: "aegis:sign-approved",
		requestId: "session:aHR0cHM6Ly9hcHAuZXhhbXBsZQ:1700000000",
		signature: "user-signature",
	},
);

console.log(
	JSON.stringify(
		{
			surface: "extension-background",
			status: "passed",
			origin: "https://app.example",
			checked: [
				"connect",
				"simulate-and-sign",
				"list-reviews",
				"reject-review",
				"approve-review",
			],
		},
		null,
		2,
	),
);
