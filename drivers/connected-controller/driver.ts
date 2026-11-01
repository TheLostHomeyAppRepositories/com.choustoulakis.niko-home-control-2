import Homey, { DiscoveryResultMDNSSD } from 'homey';
import { randomUUID } from 'node:crypto';
import { GenericDevicePairingData } from '../../src/NikoDriver';
import type { NikoConnectionSettings } from '../../src/niko/NikoMqttClient';
import type { ConnectedControllerDevice } from './device';
import { DEFAULT_PORT, DEFAULT_USERNAME, testConnection } from '../../src/niko/NikoConnection';

export interface ConnectedControllerSettings extends NikoConnectionSettings {
  name: string;
  debugReport: string;
  /** Missing on controllers paired before this setting existed; treat as enabled. */
  jwtReminders?: boolean;
}

export interface ConnectedControllerPairingData extends GenericDevicePairingData {
  settings: ConnectedControllerSettings;
}

type JwtFlowArgs = { device: ConnectedControllerDevice; days: number };
type DiscoveredController = { id: string; name: string; address: string; alreadyAdded: boolean };
// Niko fixes the Hobby API port and username, so pairing only asks for the IP and token. Both
// remain in the device settings for unusual setups.
type PairingConnection = { controllerId?: string; ip: string; jwt: string };

function toConnectionSettings(
  connection: PairingConnection,
  fixed: Pick<NikoConnectionSettings, 'port' | 'username'> = {
    port: DEFAULT_PORT,
    username: DEFAULT_USERNAME,
  },
): NikoConnectionSettings {
  return { ...fixed, ip: connection.ip.trim(), jwt: connection.jwt.trim() };
}

export class ConnectedControllerDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.homey.flow
      .getDeviceTriggerCard('jwt_expiring')
      .registerRunListener(
        async (args: JwtFlowArgs, state: { days: number }) => state.days <= args.days,
      );
    this.homey.flow
      .getConditionCard('jwt_expires_within')
      .registerRunListener(async (args: JwtFlowArgs) => args.device.isJwtExpiringWithin(args.days));
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    session.setHandler('discover', async () => this.getDiscoveredControllers());
    session.setHandler('test', async (connection: PairingConnection) =>
      this.testConnection(toConnectionSettings(connection)),
    );
    session.setHandler('create', async (connection: PairingConnection) =>
      this.toPairingData(connection),
    );
  }

  // Reuses the connect view. Port and username keep the device's values, also when customized.
  async onRepair(session: Homey.Driver.PairSession, device: Homey.Device): Promise<void> {
    const controller = device as ConnectedControllerDevice;
    const fixed = {
      port: controller.getSetting('port'),
      username: controller.getSetting('username'),
    };
    session.setHandler('repairContext', async () => ({
      name: controller.getName(),
      ip: controller.getSetting('ip'),
    }));
    session.setHandler('test', async (connection: PairingConnection) =>
      this.testConnection(toConnectionSettings(connection, fixed)),
    );
    session.setHandler('save', async (connection: PairingConnection) => {
      const { ip, jwt } = toConnectionSettings(connection, fixed);
      await controller.applyConnection({ ip, jwt });
    });
  }

  private testConnection(settings: NikoConnectionSettings) {
    return testConnection(settings, {
      setTimeout: (callback, ms, ...args) => this.homey.setTimeout(callback, ms, ...args),
      setInterval: (callback, ms, ...args) => this.homey.setInterval(callback, ms, ...args),
    });
  }

  // Paired controllers are always listed, also when discovery doesn't see them right now, so the
  // list never claims there is no controller while one is set up.
  private getDiscoveredControllers(): DiscoveredController[] {
    const results = this.homey.discovery.getStrategy('niko_home_control').getDiscoveryResults() as {
      [id: string]: DiscoveryResultMDNSSD;
    };
    const paired = new Map(
      (this.getDevices() as ConnectedControllerDevice[]).map((device) => [
        device.getData().id,
        device,
      ]),
    );
    const discovered = Object.values(results).map((result) => ({
      id: result.name,
      name: paired.get(result.name)?.getName() ?? result.name,
      address: result.address,
      alreadyAdded: paired.has(result.name),
    }));
    const discoveredIds = new Set(discovered.map((controller) => controller.id));
    const pairedOnly = [...paired.entries()]
      .filter(([id]) => !discoveredIds.has(id))
      .map(([id, device]) => ({
        id,
        name: device.getName(),
        address: String(device.getSetting('ip') ?? ''),
        alreadyAdded: true,
      }));
    return [...discovered, ...pairedOnly];
  }

  private toPairingData(connection: PairingConnection): ConnectedControllerPairingData {
    const settings = toConnectionSettings(connection);
    // A manually entered IP that discovery also found gets the controller's own ID, so later IP
    // changes are picked up by discovery.
    const discoveredId = this.getDiscoveredControllers().find(
      (controller) => controller.address === settings.ip,
    )?.id;
    const id = connection.controllerId ?? discoveredId ?? `manual_entry_${randomUUID()}`;
    return {
      name: `${this.homey.__('pair.deviceName')} (${settings.ip})`,
      data: { id },
      settings: { ...settings, name: id, debugReport: 'no report yet.' },
    };
  }
}

module.exports = ConnectedControllerDriver;
