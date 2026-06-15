import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createExtensionManifest } from "./manifest";

export type ExtensionBundleFile = {
	path: string;
	content: string;
};

export const createExtensionBundle = (): ExtensionBundleFile[] => [
	{
		path: "manifest.json",
		content: `${JSON.stringify(createExtensionManifest(), null, 2)}\n`,
	},
	{
		path: "popup.html",
		content: popupHtml,
	},
	{
		path: "popup.js",
		content: popupJs,
	},
	{
		path: "background.js",
		content: backgroundJs,
	},
	{
		path: "content.js",
		content: contentJs,
	},
];

export const writeExtensionBundle = async (outDir: string) => {
	await mkdir(outDir, { recursive: true });

	await Promise.all(
		createExtensionBundle().map((file) =>
			writeFile(join(outDir, file.path), file.content, "utf8"),
		),
	);
};

const popupHtml = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>Aegis Wallet</title>
		<style>
			:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
			body { margin: 0; width: 360px; background: #f6f7f5; color: #111513; }
			#aegis-extension-popup { padding: 18px; display: grid; gap: 14px; }
			header { display: flex; justify-content: space-between; align-items: center; }
			strong { font-size: 15px; overflow-wrap: anywhere; }
			span, code { overflow-wrap: anywhere; }
			.card { border: 1px solid #d9ded8; border-radius: 8px; padding: 12px; background: white; }
			.reviewList { display: grid; gap: 10px; }
			.reviewActions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
			button { border: 0; border-radius: 8px; background: #111513; color: white; padding: 10px 12px; font-weight: 700; width: 100%; }
			button.secondary { background: #ecefeb; color: #111513; }
			.muted { color: #687064; font-size: 12px; }
		</style>
	</head>
	<body>
		<main id="aegis-extension-popup">
			<header><strong>Aegis Wallet</strong><span>Safe signing</span></header>
			<section class="reviewList" id="aegis-review-list" aria-live="polite">
				<div class="card muted">Loading pending simulations...</div>
			</section>
			<button type="button">Open wallet</button>
		</main>
		<script src="popup.js"></script>
	</body>
</html>
`;

const popupJs = `const reviewList = document.getElementById("aegis-review-list");

const sendRuntimeMessage = (message) =>
	new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));

const renderEmpty = () => {
	reviewList.innerHTML = '<div class="card muted">No pending simulations.</div>';
};

const renderReviews = (reviews) => {
	if (!reviews.length) {
		renderEmpty();
		return;
	}

	reviewList.innerHTML = "";
	for (const review of reviews) {
		const card = document.createElement("article");
		card.className = "card";
		card.append(
			textElement("strong", review.origin),
			textElement("div", \`Review \${review.requestId}\`, "muted"),
			textElement("code", review.txBytes),
			reviewActions(review.requestId),
		);
		reviewList.append(card);
	}
};

const textElement = (tagName, text, className) => {
	const element = document.createElement(tagName);
	if (className) element.className = className;
	element.textContent = text;
	return element;
};

const reviewActions = (requestId) => {
	const actions = document.createElement("div");
	actions.className = "reviewActions";
	actions.append(
		reviewButton("reject", requestId, "Reject", "secondary"),
		reviewButton("approve", requestId, "Approve"),
	);
	return actions;
};

const reviewButton = (decision, requestId, label, className) => {
	const button = document.createElement("button");
	button.type = "button";
	if (className) button.className = className;
	button.dataset.decision = decision;
	button.dataset.requestId = requestId;
	button.textContent = label;
	return button;
};

const refreshReviews = async () => {
	const response = await sendRuntimeMessage({ type: "aegis:list-reviews" });
	if (response?.type !== "aegis:pending-reviews") {
		reviewList.innerHTML = '<div class="card muted">Unable to load reviews.</div>';
		return;
	}
	renderReviews(response.reviews ?? []);
};

reviewList.addEventListener("click", async (event) => {
	const button = event.target.closest("button[data-decision]");
	if (!button) return;

	const decision = button.dataset.decision;
	const requestId = button.dataset.requestId;
	await sendRuntimeMessage({
		type: "aegis:resolve-review",
		requestId,
		decision,
		reason: decision === "reject" ? "Rejected in Aegis popup." : undefined,
	});
	await refreshReviews();
});

document.addEventListener("DOMContentLoaded", refreshReviews);
`;

const backgroundJs = `const sessions = new Map();
const pendingReviews = new Map();
const activeAddress = undefined;

const sessionIdFor = (origin) => \`session:\${btoa(origin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}\`;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
	if (request?.type === "aegis:connect") {
		sessions.set(request.origin, {
			origin: request.origin,
			siteName: request.siteName,
			connectedAt: Date.now(),
		});
		sendResponse({
			type: "aegis:connected",
			origin: request.origin,
			siteName: request.siteName,
			sessionId: sessionIdFor(request.origin),
		});
		return true;
	}

	if (request?.type === "aegis:disconnect") {
		sessions.delete(request.origin);
		sendResponse({ type: "aegis:disconnected", origin: request.origin });
		return true;
	}

	if (request?.type === "aegis:simulate-and-sign") {
		if (!sessions.has(request.origin)) {
			sendResponse({
				type: "aegis:error",
				origin: request.origin,
				reason: "origin is not connected",
			});
			return true;
		}

		const requestId = \`\${sessionIdFor(request.origin)}:\${Date.now()}\`;
		pendingReviews.set(requestId, {
			requestId,
			origin: request.origin,
			address: activeAddress,
			txBytes: request.txBytes,
			createdAt: Date.now(),
		});
		sendResponse({
			type: "aegis:sign-review-required",
			origin: request.origin,
			requestId,
			address: activeAddress,
			txBytes: request.txBytes,
		});
		return true;
	}

	if (request?.type === "aegis:list-reviews") {
		sendResponse({
			type: "aegis:pending-reviews",
			reviews: Array.from(pendingReviews.values()),
		});
		return true;
	}

	if (request?.type === "aegis:resolve-review") {
		if (!pendingReviews.has(request.requestId)) {
			sendResponse({
				type: "aegis:error",
				origin: request?.origin ?? "popup",
				reason: "signing review was not found",
			});
			return true;
		}

		if (request.decision === "approve") {
			if (typeof request.signature !== "string" || !request.signature.length) {
				sendResponse({
					type: "aegis:error",
					origin: "popup",
					reason: "wallet signer is not available in this generated shell",
				});
				return true;
			}

			pendingReviews.delete(request.requestId);
			sendResponse({
				type: "aegis:sign-approved",
				requestId: request.requestId,
				signature: request.signature,
			});
			return true;
		}

		pendingReviews.delete(request.requestId);
		sendResponse({
			type: "aegis:sign-rejected",
			requestId: request.requestId,
			reason: request.reason ?? "rejected",
		});
		return true;
	}

	sendResponse({
		type: "aegis:error",
		origin: request?.origin ?? "unknown",
		reason: "unsupported request",
	});
	return true;
});
`;

const contentJs = `const AEGIS_SOURCE = "aegis-wallet";

window.addEventListener("message", (event) => {
	if (event.source !== window || event.data?.source === AEGIS_SOURCE) return;

	const request = event.data;
	if (!["aegis:connect", "aegis:disconnect", "aegis:simulate-and-sign"].includes(request?.type)) return;

	chrome.runtime.sendMessage({ ...request, origin: window.location.origin }, (response) => {
		window.postMessage({ source: AEGIS_SOURCE, response }, window.location.origin);
	});
});

window.postMessage({ source: AEGIS_SOURCE, type: "aegis:ready" }, window.location.origin);
`;
