export type ExtensionBridgeState = {
	activeAddress?: string;
	sessions: Map<string, DappSession>;
	pendingReviews: Map<string, PendingSignReview>;
};

export type DappSession = {
	origin: string;
	siteName: string;
	connectedAt: number;
};

export type PendingSignReview = {
	requestId: string;
	origin: string;
	address?: string;
	txBytes: string;
	createdAt: number;
};

export type ReviewDecision =
	| {
			requestId: string;
			decision: "approve";
			signature: string;
	  }
	| {
			requestId: string;
			decision: "reject";
			reason: string;
	  };

export type ExtensionBridgeInput = {
	activeAddress?: string;
	now?: () => number;
};

export type ExtensionRequest =
	| {
			type: "aegis:connect";
			origin: string;
			siteName: string;
	  }
	| {
			type: "aegis:disconnect";
			origin: string;
	  }
	| {
			type: "aegis:simulate-and-sign";
			origin: string;
			txBytes: string;
	  };

export type ExtensionResponse =
	| {
			type: "aegis:connected";
			origin: string;
			siteName: string;
			sessionId: string;
	  }
	| {
			type: "aegis:disconnected";
			origin: string;
	  }
	| {
			type: "aegis:sign-review-required";
			origin: string;
			requestId: string;
			address?: string;
			txBytes: string;
	  }
	| {
			type: "aegis:error";
			origin: string;
			reason: string;
	  }
	| {
			type: "aegis:sign-approved";
			requestId: string;
			signature: string;
	  }
	| {
			type: "aegis:sign-rejected";
			requestId: string;
			reason: string;
	  };

export const createExtensionBridge = ({
	activeAddress,
	now = Date.now,
}: ExtensionBridgeInput = {}) => {
	const state: ExtensionBridgeState = {
		activeAddress,
		sessions: new Map(),
		pendingReviews: new Map(),
	};

	return {
		state,
		handle(request: ExtensionRequest): ExtensionResponse {
			if (request.type === "aegis:connect") {
				const session = {
					origin: request.origin,
					siteName: request.siteName,
					connectedAt: now(),
				};
				state.sessions.set(request.origin, session);
				return {
					type: "aegis:connected",
					origin: request.origin,
					siteName: request.siteName,
					sessionId: sessionIdFor(request.origin),
				};
			}

			if (request.type === "aegis:disconnect") {
				state.sessions.delete(request.origin);
				return {
					type: "aegis:disconnected",
					origin: request.origin,
				};
			}

			if (!state.sessions.has(request.origin)) {
				return {
					type: "aegis:error",
					origin: request.origin,
					reason: "origin is not connected",
				};
			}

			const requestId = `${sessionIdFor(request.origin)}:${now()}`;
			state.pendingReviews.set(requestId, {
				requestId,
				origin: request.origin,
				address: state.activeAddress,
				txBytes: request.txBytes,
				createdAt: now(),
			});

			return {
				type: "aegis:sign-review-required",
				origin: request.origin,
				requestId,
				address: state.activeAddress,
				txBytes: request.txBytes,
			};
		},
		pendingReviews: () => Array.from(state.pendingReviews.values()),
		resolveReview(decision: ReviewDecision): ExtensionResponse {
			if (!state.pendingReviews.has(decision.requestId)) {
				return {
					type: "aegis:error",
					origin: "",
					reason: "signing review was not found",
				};
			}

			state.pendingReviews.delete(decision.requestId);
			if (decision.decision === "approve") {
				return {
					type: "aegis:sign-approved",
					requestId: decision.requestId,
					signature: decision.signature,
				};
			}

			return {
				type: "aegis:sign-rejected",
				requestId: decision.requestId,
				reason: decision.reason,
			};
		},
	};
};

const sessionIdFor = (origin: string) =>
	`session:${Buffer.from(origin).toString("base64url")}`;
