import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { assessTransaction, DEFAULT_MODEL } from "./assess";
import type { AssessInput } from "./verdict";

const PORT = Number(process.env.AEGIS_RISK_PORT ?? 8787);
const MAX_BODY = 1_000_000;

const client = new Anthropic();

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
	json(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.warn("warning: ANTHROPIC_API_KEY is not set — /assess will fail");
	}
	console.log(`Aegis risk service listening on http://127.0.0.1:${PORT}`);
});
