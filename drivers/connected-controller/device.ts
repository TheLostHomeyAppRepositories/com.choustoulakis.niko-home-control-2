import Homey from 'homey';
import type DiscoveryStrategy from 'homey/lib/DiscoveryStrategy';
import { ConnectedControllerSettings } from './driver';
import { NikoClientState, NikoDeviceWithOwner, NikoMqttClient } from './NikoMqttClient';
import { clearInterval } from 'node:timers';
import { NikoModel, NikoType } from './NikoTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

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
    const client = new NikoMqttClient({
      settings: this.settings,
      homey: this.homey,
      connectedControllerId: this.getData().id,
    });
    this.client = client;
    client.addListener('statechange', this.onMqttStateChange);
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

  private readonly updateJwtRemainingDays = async () => {
    if (this.isUnloaded) return;
    const expiresAt = getJwtExpiresAt(this.settings.jwt);
    const remainingDays =
      expiresAt === undefined ? 0 : Math.max(0, Math.floor((expiresAt - Date.now()) / DAY_MS));
    await this.setCapabilityValue('jwt_remaining_days', remainingDays).catch(this.error);
  };

  private isJwtExpired(): boolean {
    const expiresAt = getJwtExpiresAt(this.settings.jwt);
    return expiresAt !== undefined && expiresAt <= Date.now();
  }

  private readonly reconnectIfNeeded = async () => {
    if (this.isUnloaded || this.pendingConnects > 0) return;
    const state = this.client?.getState();
    if (
      state === undefined ||
      state === NikoClientState.ERROR ||
      state === NikoClientState.DISCONNECTED
    ) {
      await this.connect().catch(this.error);
    }
  };

  private async discoverIpIfNeeded() {
    try {
      const strategy = this.homey.discovery.getStrategy('niko_home_control') as DiscoveryStrategy;
      const results = strategy.getDiscoveryResults();
      const fpId = this.getData().id;

      if (results[fpId] && 'address' in results[fpId]) {
        const discoveredIp = (results[fpId] as any).address;
        if (discoveredIp && this.settings.ip !== discoveredIp) {
          this.log(`Discovered new IP address: ${discoveredIp}. Updating settings...`);
          await this.setSettings({ ip: discoveredIp });
          this.settings = { ...this.settings, ip: discoveredIp };
        }
      }
    } catch (e) {
      this.error('Failed to run MDNS discovery for connected controller.', e);
    }
  }

  disconnect() {
    this.client?.removeListener('statechange', this.onMqttStateChange);
    this.client?.disconnect();
    this.client = undefined;
  }

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

  setDeviceProps(uuid: string, props: Record<string, any>[]): void {
    this.client?.setDeviceProps(uuid, props);
  }

  async updateDebugInfo(): Promise<void> {
    this.settings = {
      ...this.settings,
      debugReport: this.buildDebugReport(),
    };
  }

  async updateDebugInfoAndSettings(): Promise<void> {
    await this.updateDebugInfo();
    await this.setSettings({ debugReport: this.settings.debugReport });
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
