export type DappSession = {
	id: string;
	origin: string;
	account: string;
	connectedAt: string;
	active: boolean;
};

export type WalletCapability = {
	objectId: string;
	label: string;
	dappOrigin: string;
	expiresAt?: string;
	revoked: boolean;
};

export type PermissionState = {
	sessions: DappSession[];
	capabilities: WalletCapability[];
};

export const disconnectSession = (
	state: PermissionState,
	sessionId: string,
): PermissionState => ({
	...state,
	sessions: state.sessions.map((session) =>
		session.id === sessionId ? { ...session, active: false } : session,
	),
});

export const revokeCapability = (
	state: PermissionState,
	objectId: string,
): PermissionState => ({
	...state,
	capabilities: state.capabilities.map((capability) =>
		capability.objectId === objectId
			? { ...capability, revoked: true }
			: capability,
	),
});
