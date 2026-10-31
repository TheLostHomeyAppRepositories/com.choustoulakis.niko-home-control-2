import Homey, { DiscoveryResultMDNSSD } from 'homey';
import { randomUUID } from 'node:crypto';
import { GenericDevicePairingData } from '../../src/NikoDriver';
import type { NikoConnectionSettings } from '../../src/niko/NikoMqttClient';
import type { ConnectedControllerDevice } from './device';

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

  async onPairListDevices(): Promise<ConnectedControllerPairingData[]> {
    const discoveryStrategy = this.homey.discovery.getStrategy('niko_home_control');
    const results = discoveryStrategy.getDiscoveryResults() as {
      [x: string]: DiscoveryResultMDNSSD;
    };

    const devicesFound: ConnectedControllerPairingData[] = Object.values(results).map((result) => ({
      name: `Connected Controller (${result.address})`,
      data: {
        id: result.name, // Must be unique, this is how Homey identifies the device.
      },
      settings: {
        name: result.name,
        ip: result.address,
        port: 8884,
        username: 'hobby',
        jwt: '',
        debugReport: 'no report yet.',
      },
    }));
    devicesFound.push({
      name: 'Manual Configuration',
      data: {
        id: 'manual_entry_' + randomUUID(),
      },
      settings: {
        name: 'Connected Controller',
        ip: '',
        port: 8884,
        username: 'hobby',
        jwt: '',
        debugReport: 'no report yet.',
      },
    });

    return devicesFound;
  }
}

module.exports = ConnectedControllerDriver;
