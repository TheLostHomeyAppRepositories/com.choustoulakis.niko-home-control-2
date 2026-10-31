import Homey from 'homey';
import { NikoDeviceWithOwner } from './niko/NikoMqttClient';
import { ConnectedControllerDevice } from '../drivers/connected-controller/device';
import { NikoModel, NikoMqttDevice, NikoType } from './niko/NikoTypes';

export interface LegacyNikoDeviceWithOwner extends NikoMqttDevice {
  ownerControllerId: string;
}

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
  protected getDevicesByAction(groups: DeviceGroup | DeviceGroup[]): DevicePairingData[] {
    const controllerDriver = this.homey.drivers.getDriver('connected-controller');
    const controllerDevices = controllerDriver.getDevices() as ConnectedControllerDevice[];

    if (controllerDevices.length === 0) {
      throw new Error(this.homey.__('pair.noController'));
    }

    const allDevices: NikoDeviceWithOwner[] = [];
    for (const controllerDevice of controllerDevices) {
      for (const group of Array.isArray(groups) ? groups : [groups]) {
        allDevices.push(...controllerDevice.getNikoByTypeAndModel(group.types, group.models));
      }
    }
    return allDevices.map(
      (deviceWithOwner: NikoDeviceWithOwner): DevicePairingData => ({
        name: deviceWithOwner.device.Name,
        data: {
          id: deviceWithOwner.device.Uuid,
        },
        store: {
          deviceWithOwner: deviceWithOwner,
        },
      }),
    );
  }
}
