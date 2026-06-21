import { describe, expect, it, vi } from "vitest";
import { createDecisionLog } from "./decisions";

const input = {
	origin: "https://drainer.example",
	method: "signAndExecuteTransaction",
	riskLevel: "critical" as const,
	blocked: true,
	approved: false,
};

describe("createDecisionLog", () => {
	it("records, stamps, and returns decisions newest-last in recent()", () => {
		let clock = 1000;
		const log = createDecisionLog({ now: () => clock++ });
		const a = log.record(input);
		const b = log.record({
			...input,
			origin: "https://ok.example",
			riskLevel: "low",
		});
		expect(a.id).toBe("1");
		expect(b.id).toBe("2");
		expect(a.ts).toBe(1000);
		expect(log.recent().map((d) => d.origin)).toEqual([
			"https://drainer.example",
			"https://ok.example",
		]);
	});

	it("caps the buffer at max", () => {
		const log = createDecisionLog({ max: 2 });
		log.record(input);
		log.record(input);
		log.record(input);
		expect(log.recent()).toHaveLength(2);
		expect(log.recent()[0]?.id).toBe("2");
	});

	it("notifies subscribers and unsubscribes cleanly", () => {
		const log = createDecisionLog();
		const seen = vi.fn();
		const off = log.subscribe(seen);
		log.record(input);
		expect(seen).toHaveBeenCalledTimes(1);
		off();
		log.record(input);
		expect(seen).toHaveBeenCalledTimes(1);
	});

	it("isolates a throwing subscriber from the others", () => {
		const log = createDecisionLog();
		const good = vi.fn();
		log.subscribe(() => {
			throw new Error("boom");
		});
		log.subscribe(good);
		expect(() => log.record(input)).not.toThrow();
		expect(good).toHaveBeenCalledTimes(1);
	});
});
