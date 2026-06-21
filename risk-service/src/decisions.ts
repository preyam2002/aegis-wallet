import type { RiskLevel } from "./verdict";

/** A bouncer decision the website streams: what a dApp asked, and what happened. */
export type DecisionRecord = {
	id: string;
	ts: number;
	origin: string;
	method: string;
	riskLevel: RiskLevel;
	blocked: boolean;
	approved: boolean;
	headline?: string;
};

export type DecisionInput = Omit<DecisionRecord, "id" | "ts">;

export type DecisionLog = {
	record: (input: DecisionInput) => DecisionRecord;
	recent: () => DecisionRecord[];
	subscribe: (listener: (decision: DecisionRecord) => void) => () => void;
};

/**
 * An in-memory ring buffer of recent decisions plus a pub/sub fan-out. The
 * server keeps one instance; the website reads `recent()` then live-tails
 * `subscribe()` over SSE.
 */
export const createDecisionLog = (
	options: { max?: number; now?: () => number } = {},
): DecisionLog => {
	const max = options.max ?? 100;
	const now = options.now ?? (() => Date.now());
	const buffer: DecisionRecord[] = [];
	const listeners = new Set<(decision: DecisionRecord) => void>();
	let counter = 0;

	return {
		record(input) {
			counter += 1;
			const decision: DecisionRecord = {
				id: String(counter),
				ts: now(),
				...input,
			};
			buffer.push(decision);
			if (buffer.length > max) {
				buffer.shift();
			}
			for (const listener of listeners) {
				try {
					listener(decision);
				} catch {
					// a broken subscriber must not break the others
				}
			}
			return decision;
		},
		recent() {
			return [...buffer];
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
};
