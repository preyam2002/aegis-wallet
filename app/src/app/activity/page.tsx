"use client";

import { ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";

const RISK_SERVICE_URL = "http://127.0.0.1:8787";

type Decision = {
	id: string;
	ts: number;
	origin: string;
	method: string;
	riskLevel: "low" | "medium" | "high" | "critical";
	blocked: boolean;
	approved: boolean;
	headline?: string;
};

const hostOf = (origin: string): string => {
	try {
		return new URL(origin).host;
	} catch {
		return origin;
	}
};

const ActivityPage = () => {
	const [decisions, setDecisions] = useState<Decision[]>([]);
	const [status, setStatus] = useState<"connecting" | "live" | "offline">(
		"connecting",
	);

	useEffect(() => {
		const source = new EventSource(`${RISK_SERVICE_URL}/stream`);
		source.onopen = () => setStatus("live");
		source.onerror = () => setStatus("offline");
		source.onmessage = (event) => {
			try {
				const decision = JSON.parse(event.data) as Decision;
				setDecisions((prev) =>
					[decision, ...prev.filter((d) => d.id !== decision.id)].slice(0, 100),
				);
			} catch {
				// ignore malformed frames
			}
		};
		return () => source.close();
	}, []);

	return (
		<main className="logShell">
			<header className="logHeader">
				<div>
					<p className="eyebrow">Aegis · Live</p>
					<h1>Bouncer activity</h1>
					<p className="balanceSub">
						Every dApp transaction the Aegis extension assessed — blocked or
						approved — streamed here in real time.
					</p>
				</div>
				<span className={`logStatus ${status}`}>
					{status === "live"
						? "● Live"
						: status === "connecting"
							? "Connecting…"
							: "Risk service offline"}
				</span>
			</header>

			<div className="logFeed">
				{decisions.length === 0 && (
					<p className="muted">
						No decisions yet. Connect the Aegis extension to a dApp and trigger
						a transaction — blocks and approvals appear here instantly.
					</p>
				)}
				{decisions.map((decision) => (
					<div
						className={`logRow ${decision.blocked ? "blocked" : "accepted"}`}
						key={decision.id}
					>
						<div className="logIcon">
							{decision.blocked ? (
								<ShieldX size={18} />
							) : (
								<ShieldCheck size={18} />
							)}
						</div>
						<div className="logBody">
							<strong>
								{decision.headline ??
									(decision.blocked ? "Blocked a transaction" : "Approved")}
							</strong>
							<span>
								{hostOf(decision.origin)} · {decision.method}
							</span>
						</div>
						<div className="logMeta">
							<span className={`riskPill ${decision.riskLevel}`}>
								{decision.riskLevel}
							</span>
							<em className={decision.blocked ? "blocked" : ""}>
								{decision.blocked ? "BLOCKED" : "approved"}
							</em>
						</div>
					</div>
				))}
			</div>
		</main>
	);
};

export default ActivityPage;
