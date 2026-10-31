import Homey, { DiscoveryResultMDNSSD } from 'homey';
import type DiscoveryStrategy from 'homey/lib/DiscoveryStrategy';
import { ConnectedControllerSettings } from './driver';
import {
  NikoClientState,
  NikoDeviceWithOwner,
  NikoMqttClient,
} from '../../src/niko/NikoMqttClient';
import { clearInterval } from 'node:timers';
import { NikoModel, NikoMqttDevice, NikoType } from '../../src/niko/NikoTypes';
import { emitControllerChanged } from '../../src/niko/NikoEvents';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTHORIZATION_RETRY_MS = 5 * 60_000;
const JWT_REMINDER_DAYS = [30, 7, 1];
const EXPIRED_STAGE = -1;

/** Last timeline reminder, stored per controller. Stages count down: 30, 7, 1, then expired. */
type JwtReminder = { expiresAt: number; stage: number };

function getRemainingDays(expiresAt: number): number {
  return Math.max(0, Math.floor((expiresAt - Date.now()) / DAY_MS));
}

function getJwtExpiresAt(jwt: string | undefined): number | undefined {
  const parts = jwt?.trim().split('.');
  if (parts?.length !== 3) return undefined;
  try {
    const { exp } = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export class ConnectedControllerDevice extends Homey.Device {
  private settings!: ConnectedControllerSettings;
  private client?: NikoMqttClient;

  private remainingDaysInterval!: NodeJS.Timeout;
  private reconnectInterval!: NodeJS.Timeout;
  private isUnloaded = false;
  private connectQueue: Promise<void> = Promise.resolve();
  private pendingConnects = 0;
  private lastConnectAt = 0;
  private writtenDebugReport?: string;
  private jwtCheckQueue: Promise<void> = Promise.resolve();

  async onInit() {
    // Add capability if it doesn't exist (for existing devices)
    if (!this.hasCapability('jwt_remaining_days')) {
      await this.addCapability('jwt_remaining_days');
    }

    this.settings = this.getSettings();
    // Start the intervals first, so a failing initial connect is retried.
    this.remainingDaysInterval = this.homey.setInterval(this.updateJwtRemainingDays, 3_600_000);
    this.reconnectInterval = this.homey.setInterval(this.reconnectIfNeeded, 30_000);
    await this.updateJwtRemainingDays();
    await this.connect().catch(this.error);
    await super.onInit();
  }

  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.settings = newSettings as any as ConnectedControllerSettings;
    await this.updateDebugInfo();
    await this.updateJwtRemainingDays();
    if (
      changedKeys.includes('ip') ||
      changedKeys.includes('port') ||
      changedKeys.includes('username') ||
      changedKeys.includes('jwt')
    ) {
      this.homey.setTimeout(() => this.connect().catch(this.error), 0);
    }
    return await super.onSettings({ oldSettings, newSettings, changedKeys });
  }

  async onUninit() {
    this.unload();
    return await super.onUninit();
  }

  /**
   * Connects are queued, so overlapping calls (settings change, reconnect interval) never leave
   * a previous MQTT client running in the background.
   */
  connect(): Promise<void> {
    this.pendingConnects++;
    const run = this.connectQueue
      .then(() => this.connectNow())
      .finally(() => this.pendingConnects--);
    this.connectQueue = run.catch(() => undefined);
    return run;
  }

  private async connectNow(): Promise<void> {
    this.disconnect();
    if (this.isUnloaded) return;

    await this.updateJwtRemainingDays();

    // Discovery can fill in a missing or outdated IP, so validate the settings afterwards.
    await this.discoverIpIfNeeded();

    const settingsError = this.checkSettingsForErrors();
    if (settingsError) {
      await this.updateDebugInfoAndSettings();
      return await this.setUnavailable(settingsError);
    }

    if (this.isJwtExpired()) {
      await this.updateDebugInfoAndSettings();
      return await this.setUnavailable(
        "The provided JWT has expired. Please enter a valid JWT in the device's settings menu.",
      );
    }

    if (this.isUnloaded) return;
    this.lastConnectAt = Date.now();
    const client = new NikoMqttClient({
      settings: this.settings,
      homey: this.homey,
      connectedControllerId: this.getData().id,
    });
    this.client = client;
    client.addListener('statechange', this.onMqttStateChange);
    client.addListener('devicelist', this.onDeviceList);
    client.connect();
    await this.updateDebugInfoAndSettings();
  }

  private checkSettingsForErrors(): string | undefined {
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!this.settings.ip || !ipRegex.test(this.settings.ip)) {
      return "Invalid IP address in the device's settings menu.";
    }
    if (!this.settings.port || isNaN(this.settings.port)) {
      return "Invalid port number in the device's settings menu.";
    }
    if (!this.settings.username || this.settings.username.trim() === '') {
      return "Username cannot be empty in the device's settings menu.";
    }
    if (!this.settings.jwt || this.settings.jwt.trim() === '') {
      return "Please enter the JWT in the device's settings menu.";
    }
  }

  /** Checks are queued, so overlapping calls never trigger Flows or reminders twice. */
  private readonly updateJwtRemainingDays = (): Promise<void> => {
    this.jwtCheckQueue = this.jwtCheckQueue.then(() => this.checkJwt()).catch(this.error);
    return this.jwtCheckQueue;
  };

  private async checkJwt(): Promise<void> {
    if (this.isUnloaded) return;
    const expiresAt = getJwtExpiresAt(this.settings.jwt);
    const remainingDays = expiresAt === undefined ? 0 : getRemainingDays(expiresAt);
    const previousDays = this.getCapabilityValue('jwt_remaining_days');
    await this.setCapabilityValue('jwt_remaining_days', remainingDays);
    if (expiresAt === undefined) return;

    // The remaining days only change once a day, so this trigger runs at most once a day.
    if (remainingDays !== previousDays) {
      await this.homey.flow
        .getDeviceTriggerCard('jwt_expiring')
        .trigger(this, { days: remainingDays }, { days: remainingDays });
    }
    await this.remindIfNeeded(expiresAt, remainingDays);
  }

  /**
   * Writes a timeline notification at 30, 7 and 1 days left and once expired, once per token.
   * Users can forward timeline notifications as push notifications in Homey.
   */
  private async remindIfNeeded(expiresAt: number, remainingDays: number): Promise<void> {
    if (this.settings.jwtReminders === false) return;
    const expired = expiresAt <= Date.now();
    const stage = expired
      ? EXPIRED_STAGE
      : Math.min(...JWT_REMINDER_DAYS.filter((days) => remainingDays <= days));
    if (stage === Infinity) return;

    const last: JwtReminder | undefined = this.getStoreValue('jwtReminder');
    if (last?.expiresAt === expiresAt && last.stage <= stage) return;
    await this.setStoreValue('jwtReminder', { expiresAt, stage } satisfies JwtReminder);

    const name = `**${this.getName()}**`;
    const when =
      remainingDays === 0
        ? 'within a day'
        : `in ${remainingDays} day${remainingDays === 1 ? '' : 's'}`;
    await this.homey.notifications.createNotification({
      excerpt: expired
        ? `The Niko Hobby API token of ${name} has expired. Enter a new token in its settings to reconnect.`
        : `The Niko Hobby API token of ${name} expires **${when}**. Renew it in the Niko Home Control programming software.`,
    });
  }

  isJwtExpiringWithin(days: number): boolean {
    const expiresAt = getJwtExpiresAt(this.settings.jwt);
    return expiresAt !== undefined && getRemainingDays(expiresAt) <= days;
  }

  private isJwtExpired(): boolean {
    const expiresAt = getJwtExpiresAt(this.settings.jwt);
    return expiresAt !== undefined && expiresAt <= Date.now();
  }

  /**
   * mqtt.js retries network errors by itself, so a new client is only created when retrying
   * cannot help: there is no client (invalid settings, expired JWT), the controller moved to
   * another IP, or the JWT was rejected.
   */
  private readonly reconnectIfNeeded = async () => {
    if (this.isUnloaded || this.pendingConnects > 0) return;
    const client = this.client;
    const discoveredIp = this.getDiscoveredIp();
    const shouldConnect =
      client === undefined ||
      (client.getState() !== NikoClientState.CONNECTED &&
        ((discoveredIp !== undefined && discoveredIp !== this.settings.ip) ||
          (client.isAuthorizationFailed() &&
            Date.now() - this.lastConnectAt >= AUTHORIZATION_RETRY_MS)));
    if (shouldConnect) {
      await this.connect().catch(this.error);
    }
  };

  private getDiscoveredIp(): string | undefined {
    try {
      const strategy = this.homey.discovery.getStrategy('niko_home_control') as DiscoveryStrategy;
      const result = strategy.getDiscoveryResults()[this.getData().id];
      return result && 'address' in result ? (result as DiscoveryResultMDNSSD).address : undefined;
    } catch (e) {
      this.error('Failed to run MDNS discovery for connected controller.', e);
      return undefined;
    }
  }

  private async discoverIpIfNeeded() {
    const discoveredIp = this.getDiscoveredIp();
    if (discoveredIp && this.settings.ip !== discoveredIp) {
      this.log(`Discovered new IP address: ${discoveredIp}. Updating settings...`);
      await this.setSettings({ ip: discoveredIp });
      this.settings = { ...this.settings, ip: discoveredIp };
    }
  }

  disconnect() {
    if (!this.client) return;
    this.client.removeListener('statechange', this.onMqttStateChange);
    this.client.removeListener('devicelist', this.onDeviceList);
    this.client.disconnect();
    this.client = undefined;
    this.notifyDevices();
  }

  /**
   * Whether the MQTT connection is up and the device list was received. Niko devices use this
   * instead of `getAvailable()`, which only updates after an async `setAvailable()`.
   */
  isOnline(): boolean {
    return !this.isUnloaded && this.client?.getState() === NikoClientState.CONNECTED;
  }

  getNikoDevice(uuid: string): NikoMqttDevice | undefined {
    return this.isOnline() ? this.client?.getDevices().find((d) => d.Uuid === uuid) : undefined;
  }

  private notifyDevices(): void {
    emitControllerChanged(this.homey, this.getData().id);
  }

  private onDeviceList = () => {
    this.notifyDevices();
    this.updateDebugInfoAndSettings().catch(this.error);
  };

  unload() {
    this.isUnloaded = true;
    clearInterval(this.remainingDaysInterval);
    clearInterval(this.reconnectInterval);
    this.disconnect();
  }

  async onDeleted() {
    this.unload();
    super.onDeleted();
  }

  private onMqttStateChange = (state: NikoClientState, message?: string) => {
    this.notifyDevices();
    this.handleMqttStateChange(state, message).catch(this.error);
  };

  private async handleMqttStateChange(state: NikoClientState, message?: string): Promise<void> {
    if (this.isUnloaded) return;
    switch (state) {
      case NikoClientState.CONNECTED:
        await this.setAvailable();
        break;
      case NikoClientState.DISCONNECTED:
        await this.setUnavailable('Disconnected from Niko Home Control Controller.');
        break;
      case NikoClientState.ERROR:
        await this.setUnavailable(
          message || 'An unknown error occurred with the Niko Home Control Controller connection.',
        );
        break;
    }
    await this.updateDebugInfoAndSettings();
  }

  getNikoByTypeAndModel(type: NikoType, models: NikoModel[]): NikoDeviceWithOwner[] {
    if (!this.getAvailable()) {
      return [];
    }
    const devices = this.client?.getNikoByTypeAndModel(type, models) ?? [];
    return devices.map((device) => ({
      device,
      connectedControllerId: this.getData().id,
    }));
  }

  /**
   * Returns false when the controller is offline, which is an expected state, not an error.
   */
  setDeviceProps(uuid: string, props: NikoMqttDevice['Properties']): boolean {
    return this.client?.setDeviceProps(uuid, props) ?? false;
  }

  async updateDebugInfo(): Promise<void> {
    this.settings = {
      ...this.settings,
      debugReport: this.buildDebugReport(),
    };
  }

  async updateDebugInfoAndSettings(): Promise<void> {
    await this.updateDebugInfo();
    const { debugReport } = this.settings;
    if (debugReport === this.writtenDebugReport) return;
    await this.setSettings({ debugReport });
    this.writtenDebugReport = debugReport;
  }

  private buildDebugReport(): string {
    // Redact JWT because this will be shared by users on the forum, probably.
    const jwt = this.settings.jwt || '';
    const visibleLength = 4;
    const redactedJwt =
      jwt.length > visibleLength * 2
        ? `${jwt.substring(0, visibleLength)}...${jwt.substring(jwt.length - visibleLength)}`
        : '***invalid_or_short_jwt***';

    const lines = [
      '[Connection Details]',
      `name: ${this.settings.name}`,
      `ip: ${this.settings.ip || 'Missing'}`,
      `port: ${this.settings.port || 'Missing'}`,
      `username: ${this.settings.username}`,
      `jwt: ${redactedJwt}`,
      '',
      '[MQTT State]',
    ];

    const validationError = this.checkSettingsForErrors();
    const isExpired = this.isJwtExpired();
    if (!this.client || validationError || isExpired) {
      lines.push(
        'status: NOT_INITIALIZED',
        `error: ${validationError || (isExpired ? 'JWT Expired' : 'Awaiting initialization/discovery...')}`,
      );
      return lines.join('\n');
    }

    lines.push(
      `status: ${this.client.getState()}`,
      `error: ${this.client.getLastErrorMessage() || 'None'}`,
      '',
      '[Niko Devices]',
    );
    const devices = this.client.getDevices();
    if (devices.length === 0) {
      lines.push('No devices received yet.');
    }
    for (const device of devices) {
      lines.push(`• ${device.Name} [${device.Type} - ${device.Model}]`);
    }
    return lines.join('\n');
  }
}

module.exports = ConnectedControllerDevice;
