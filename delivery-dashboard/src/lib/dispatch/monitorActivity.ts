type DispatchMonitorSocketStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

type MonitorActivityInput = {
  active: boolean;
  accessToken: string | null;
  zonesLoading: boolean;
  connectionStatus: DispatchMonitorSocketStatus;
};

type MonitorActivityState = {
  shouldLoadSnapshot: boolean;
  socketToken: string | null;
  shouldPollFallback: boolean;
};

export function monitorActivityState({
  active,
  accessToken,
  zonesLoading,
  connectionStatus,
}: MonitorActivityInput): MonitorActivityState {
  const canUseNetwork = active && Boolean(accessToken) && !zonesLoading;
  return {
    shouldLoadSnapshot: canUseNetwork,
    socketToken: canUseNetwork ? accessToken : null,
    shouldPollFallback: canUseNetwork && connectionStatus !== 'live',
  };
}
