import {
  NikoClientHost,
  NikoClientState,
  NikoConnectionSettings,
  NikoMqttClient,
} from './NikoMqttClient';

export const DEFAULT_PORT = 8884;
export const DEFAULT_USERNAME = 'hobby';
const DAY_MS = 24 * 60 * 60 * 1000;
const CONNECTION_TEST_TIMEOUT_MS = 15_000;
const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export type ConnectionSettingsError =
  | 'invalidIp'
  | 'invalidPort'
  | 'missingUsername'
  | 'missingJwt';

export type ConnectionTestResult =
  | { ok: true; deviceCount: number; jwtDaysLeft?: number }
  | {
      ok: false;
      error: ConnectionSettingsError | 'jwtExpired' | 'authorizationFailed' | 'unreachable';
      detail?: string;
    };

export function getConnectionSettingsError(
  settings: Partial<NikoConnectionSettings>,
): ConnectionSettingsError | undefined {
  if (!settings.ip || !IP_REGEX.test(settings.ip)) return 'invalidIp';
  if (!settings.port || isNaN(settings.port)) return 'invalidPort';
  if (!settings.username?.trim()) return 'missingUsername';
  if (!settings.jwt?.trim()) return 'missingJwt';
  return undefined;
}

export function getJwtExpiresAt(jwt: string | undefined): number | undefined {
  const parts = jwt?.trim().split('.');
  if (parts?.length !== 3) return undefined;
  try {
    const { exp } = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function getRemainingDays(expiresAt: number): number {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / DAY_MS));
}

/** Connects with the same client the app uses and waits for the device list or the first error. */
export async function testConnection(
  settings: NikoConnectionSettings,
  host: Omit<NikoClientHost, 'emit'>,
): Promise<ConnectionTestResult> {
  const settingsError = getConnectionSettingsError(settings);
  if (settingsError) return { ok: false, error: settingsError };
  const expiresAt = getJwtExpiresAt(settings.jwt);
  if (expiresAt !== undefined && expiresAt <= Date.now()) return { ok: false, error: 'jwtExpired' };

  // No-op emit: a test connection must not push device updates into the running app.
  const client = new NikoMqttClient({
    settings,
    homey: { ...host, emit: () => false },
    connectedControllerId: 'connection-test',
  });
  try {
    return await new Promise<ConnectionTestResult>((resolve) => {
      const timeout = host.setTimeout(
        () => resolve({ ok: false, error: 'unreachable' }),
        CONNECTION_TEST_TIMEOUT_MS,
      );
      client.on('statechange', (state: NikoClientState, message?: string) => {
        if (state === NikoClientState.CONNECTED) {
          clearTimeout(timeout);
          resolve({
            ok: true,
            deviceCount: client.getDevices().length,
            jwtDaysLeft: expiresAt === undefined ? undefined : getRemainingDays(expiresAt),
          });
        } else if (state === NikoClientState.ERROR) {
          clearTimeout(timeout);
          resolve(
            client.isAuthorizationFailed()
              ? { ok: false, error: 'authorizationFailed' }
              : { ok: false, error: 'unreachable', detail: message },
          );
        }
      });
      client.connect();
    });
  } finally {
    client.disconnect();
  }
}
