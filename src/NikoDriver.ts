import Homey from 'homey';
import { LegacyNikoDeviceWithOwner, NikoDeviceWithOwner } from './niko/NikoMqttClient';
import { ConnectedControllerDevice } from '../drivers/connected-controller/device';
import { NikoModel, NikoType } from './niko/NikoTypes';

export type DeviceGroup = {
  readonly types: NikoType;
  readonly models: NikoModel[];
};

export interface GenericDevicePairingData {
  name: string;
  data: {
    id: string;
  };
}

export interface DevicePairingData extends GenericDevicePairingData {
  store: DeviceStore;
}

export interface DeviceStore {
  /**
   * @deprecated
   */
  device?: LegacyNikoDeviceWithOwner;
  deviceWithOwner?: NikoDeviceWithOwner;
}

export abstract class NikoDriver extends Homey.Driver {
  protected getDevicesByAction(group: DeviceGroup): DevicePairingData[] {
    const controllerDriver = this.homey.drivers.getDriver('connected-controller');
    const controllerDevices = controllerDriver.getDevices() as ConnectedControllerDevice[];

    if (controllerDevices.length === 0) {
      throw new Error('⚠️ First add a Connected Controller.');
    }

    const allDevices: NikoDeviceWithOwner[] = [];
    for (const controllerDevice of controllerDevices) {
      allDevices.push(...controllerDevice.getNikoByTypeAndModel(group.types, group.models));
    }
    return allDevices.map(
      (deviceWithOwner: NikoDeviceWithOwner): DevicePairingData => ({
        name: deviceWithOwner.device.Name,
        data: {
          id: deviceWithOwner.device.Uuid,
        },
        store: {
          device: {
            ...deviceWithOwner.device,
            ownerControllerId: deviceWithOwner.connectedControllerId,
          },
          deviceWithOwner: deviceWithOwner,
        },
      }),
    );
  }
}
