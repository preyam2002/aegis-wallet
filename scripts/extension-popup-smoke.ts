import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { writeExtensionBundle } from "../extension/src/bundle";

const outDir = new URL("../extension/dist", import.meta.url).pathname;
await writeExtensionBundle(outDir);

type RuntimeMessage = Record<string, unknown>;

class FakeElement {
	className = "";
	dataset: Record<string, string> = {};
	innerHTML = "";
	textContent = "";
	children: FakeElement[] = [];
	listeners = new Map<
		string,
		(event: { target: FakeElement }) => Promise<void>
	>();

	constructor(readonly tagName: string) {}

	addEventListener(
		type: string,
		listener: (event: { target: FakeElement }) => Promise<void>,
	) {
		this.listeners.set(type, listener);
	}

	append(...children: FakeElement[]) {
		this.children.push(...children);
	}

	closest(selector: string) {
		if (selector === "button[data-decision]" && this.dataset.decision) {
			return this;
		}
		return null;
	}
}

const reviewList = new FakeElement("section");
const documentListeners = new Map<string, () => Promise<void>>();
const runtimeMessages: RuntimeMessage[] = [];
let pendingReviews = [
	{
		requestId: "review-1",
		origin: "https://app.example",
		txBytes: "AAECAw==",
		createdAt: 1_700_000_000,
	},
];

const popupJs = await readFile(
	new URL("../extension/dist/popup.js", import.meta.url),
	"utf8",
);

vm.runInNewContext(popupJs, {
	chrome: {
		runtime: {
			sendMessage(
				message: RuntimeMessage,
				callback: (response: unknown) => void,
			) {
				runtimeMessages.push(JSON.parse(JSON.stringify(message)));
				if (message.type === "aegis:list-reviews") {
					callback({
						type: "aegis:pending-reviews",
						reviews: pendingReviews,
					});
					return;
				}

				if (message.type === "aegis:resolve-review") {
					pendingReviews = pendingReviews.filter(
						(review) => review.requestId !== message.requestId,
					);
					callback(
						message.decision === "approve"
							? {
									type: "aegis:sign-approved",
									requestId: message.requestId,
									signature: message.signature,
								}
							: {
									type: "aegis:sign-rejected",
									requestId: message.requestId,
									reason: message.reason,
								},
					);
					return;
				}

				callback({ type: "aegis:error", reason: "unsupported request" });
			},
		},
	},
	document: {
		addEventListener(type: string, listener: () => Promise<void>) {
			documentListeners.set(type, listener);
		},
		createElement(tagName: string) {
			return new FakeElement(tagName);
		},
		getElementById(id: string) {
			return id === "aegis-review-list" ? reviewList : null;
		},
	},
});

const onReady = documentListeners.get("DOMContentLoaded");
if (!onReady) {
	throw new Error("generated popup did not register DOMContentLoaded handler");
}

await onReady();

assert.deepEqual(runtimeMessages.at(-1), { type: "aegis:list-reviews" });
assert.equal(reviewList.children.length, 1);
assert.match(collectText(reviewList.children[0]), /https:\/\/app\.example/);
assert.match(collectText(reviewList.children[0]), /AAECAw==/);

const click = reviewList.listeners.get("click");
if (!click) {
	throw new Error("generated popup did not register click handler");
}

const approveButton = new FakeElement("button");
approveButton.dataset = {
	decision: "approve",
	requestId: "review-1",
};
await click({ target: approveButton });

assert.deepEqual(runtimeMessages.at(-2), {
	type: "aegis:resolve-review",
	requestId: "review-1",
	decision: "approve",
	signature: "popup-approved-placeholder",
});
assert.deepEqual(runtimeMessages.at(-1), { type: "aegis:list-reviews" });
assert.equal(pendingReviews.length, 0);
assert.match(reviewList.innerHTML, /No pending simulations/);

console.log(
	JSON.stringify(
		{
			surface: "extension-popup",
			status: "passed",
			checked: [
				"list-reviews",
				"render-review-card",
				"approve-review",
				"refresh-empty-state",
			],
		},
		null,
		2,
	),
);

function collectText(element: FakeElement | undefined): string {
	if (!element) return "";
	return `${element.textContent}${element.children.map(collectText).join("")}`;
}
