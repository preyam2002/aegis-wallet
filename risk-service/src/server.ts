import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { assessTransaction, DEFAULT_MODEL } from "./assess";
import { createDecisionLog, type DecisionInput } from "./decisions";
import { runVaultDemo } from "./vault-demo";
import type { AssessInput } from "./verdict";

const PORT = Number(process.env.AEGIS_RISK_PORT ?? 8787);
const MAX_BODY = 1_000_000;

const client = new Anthropic();
const decisions = createDecisionLog();

const readBody = (
	req: import("node:http").IncomingMessage,
	onDone: (body: string) => void,
) => {
	let body = "";
	req.on("data", (chunk) => {
		body += chunk;
		if (body.length > MAX_BODY) {
			req.destroy();
		}
	});
	req.on("end", () => onDone(body));
};

const json = (
	res: import("node:http").ServerResponse,
	status: number,
	body: unknown,
) => {
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
};

const server = createServer((req, res) => {
	// Background-script fetch with host_permissions bypasses CORS, but be permissive anyway.
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Headers", "content-type");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}
	if (req.method === "GET" && req.url === "/health") {
		json(res, 200, { status: "ok", model: DEFAULT_MODEL });
		return;
	}
	if (req.method === "POST" && req.url === "/assess") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > MAX_BODY) {
				req.destroy();
			}
		});
		req.on("end", () => {
			let input: AssessInput;
			try {
				input = JSON.parse(body) as AssessInput;
			} catch {
				json(res, 400, { error: "invalid JSON body" });
				return;
			}
			if (!input || typeof input !== "object" || !input.summary) {
				json(res, 400, {
					error: "invalid request: missing simulation summary",
				});
				return;
			}
			assessTransaction(input, { client })
				.then((verdict) => json(res, 200, verdict))
				.catch((err: unknown) =>
					json(res, 502, {
						error: err instanceof Error ? err.message : "assessment failed",
					}),
				);
		});
		return;
	}
	if (req.method === "POST" && req.url === "/decisions") {
		readBody(req, (body) => {
			let input: DecisionInput;
			try {
				input = JSON.parse(body) as DecisionInput;
			} catch {
				json(res, 400, { error: "invalid JSON body" });
				return;
			}
			if (!input || typeof input.origin !== "string") {
				json(res, 400, { error: "invalid decision" });
				return;
			}
			json(res, 200, decisions.record(input));
		});
		return;
	}
	if (req.method === "GET" && req.url === "/decisions") {
		json(res, 200, decisions.recent());
		return;
	}
	if (req.method === "POST" && req.url === "/vault-demo") {
		runVaultDemo()
			.then((result) => json(res, 200, result))
			.catch((err: unknown) =>
				json(res, 502, {
					error: err instanceof Error ? err.message : "vault demo failed",
				}),
			);
		return;
	}
	if (req.method === "GET" && req.url === "/stream") {
		res.writeHead(200, {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		});
		for (const decision of decisions.recent()) {
			res.write(`data: ${JSON.stringify(decision)}\n\n`);
		}
		const unsubscribe = decisions.subscribe((decision) => {
			res.write(`data: ${JSON.stringify(decision)}\n\n`);
		});
		const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
		req.on("close", () => {
			clearInterval(heartbeat);
			unsubscribe();
		});
		return;
	}
	json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.warn("warning: ANTHROPIC_API_KEY is not set — /assess will fail");
	}
	console.log(`Aegis risk service listening on http://127.0.0.1:${PORT}`);
});
