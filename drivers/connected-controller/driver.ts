import Homey, { DiscoveryResultMDNSSD } from 'homey';
import { randomUUID } from 'node:crypto';
import { GenericDevicePairingData } from '../../src/NikoDriver';
import type { NikoConnectionSettings } from '../../src/niko/NikoMqttClient';

export interface ConnectedControllerSettings extends NikoConnectionSettings {
  name: string;
  debugReport: string;
}

export interface ConnectedControllerPairingData extends GenericDevicePairingData {
  settings: ConnectedControllerSettings;
}

export class ConnectedControllerDriver extends Homey.Driver {
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
