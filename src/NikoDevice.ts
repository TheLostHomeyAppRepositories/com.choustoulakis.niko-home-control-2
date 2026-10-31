import Homey from 'homey';
import { ConnectedControllerDevice } from '../drivers/connected-controller/device';
import { clearInterval } from 'node:timers';
import { NikoDeviceWithOwner } from './niko/NikoMqttClient';

import { NikoMqttDevice } from './niko/NikoTypes';
import { DeviceStore } from './NikoDriver';

type KeysOfUnion<T> = T extends T ? keyof T : never;
type ValueOfKeyInUnion<T, K extends PropertyKey> = T extends Record<K, infer V> ? V : never;
type PayloadProps<K extends NikoMqttDevice> = K['Properties'][number];

export abstract class NikoDevice<K extends NikoMqttDevice> extends Homey.Device {
  private _connectedControllerId!: string;
  private _device!: K;
  private interval!: NodeJS.Timeout;

  async onInit(): Promise<void> {
    await super.onInit();
    const { connectedControllerId, device } = await this.resolveDeviceWithOwner();
    this._device = device as K;
    this._connectedControllerId = connectedControllerId;
    this.homey.addListener(this._device.Uuid, this.onDeviceUpdate);
    this.interval = this.homey.setInterval(
      () => this.updateDeviceAvailability().catch(this.error),
      30_000,
    );
  }

  override getStore(): DeviceStore {
    return super.getStore();
  }

  abstract updateStatus(): Promise<void>;

  get device(): K {
    return this._device;
  }

  protected getProperty<TKey extends KeysOfUnion<PayloadProps<K>>>(
    key: TKey,
  ): ValueOfKeyInUnion<PayloadProps<K>, TKey> | undefined {
    const properties = this.device.Properties;

    if (!Array.isArray(properties)) {
      return undefined;
    }

    const statusProp = properties.find((prop) => Object.prototype.hasOwnProperty.call(prop, key));

    return statusProp
      ? ((statusProp as Record<string, any>)[key as string] as ValueOfKeyInUnion<
          PayloadProps<K>,
          TKey
        >)
      : undefined;
  }

  private onDeviceUpdate = (update: NikoDeviceWithOwner) => {
    this._device = update.device as K;
    this.updateStatus().catch(this.error);
  };

  protected getConnectedController(): ConnectedControllerDevice | undefined {
    const controllerDriver = this.homey.drivers.getDriver('connected-controller');
    const controllerDevices = controllerDriver.getDevices() as ConnectedControllerDevice[];
    for (const controllerDevice of controllerDevices) {
      if (controllerDevice.getData().id === this._connectedControllerId) {
        return controllerDevice;
      }
    }
  }

  protected setNikoDeviceProps(props: Partial<K['Properties'][number]>[]): void {
    const controller = this.getConnectedController();
    if (controller === undefined) {
      void this.setUnavailable('The Connected Controller no longer found.');
      return;
    }
    try {
      controller.setDeviceProps(this._device.Uuid, props);
    } catch (error: any) {
      void this.setUnavailable(
        'Failed to send command to Niko Home Control Controller. Please check the connection and try again.',
      );
      return;
    }
  }

  onUninit(): Promise<void> {
    this.homey.removeListener(this._device.Uuid, this.onDeviceUpdate);
    clearInterval(this.interval);
    return super.onUninit();
  }

  onDeleted() {
    this.homey.removeListener(this._device.Uuid, this.onDeviceUpdate);
    clearInterval(this.interval);
    super.onDeleted();
  }

  private async updateDeviceAvailability(): Promise<void> {
    const connectedController = this.getConnectedController();
    if (connectedController === undefined) {
      return this.setUnavailable('The Connected Controller no longer found.');
    } else if (!connectedController.getAvailable()) {
      return this.setUnavailable('The Connected Controller found, but is offline.');
    }
    const device = connectedController
      .getNikoByTypeAndModel(this._device.Type, [this._device.Model])
      .find((d) => d.device.Uuid === this._device.Uuid);
    if (device === undefined) {
      return this.setUnavailable(
        'The Connected Controller is available, but the device is not found in the list. Please check the Niko programming software.',
      );
    }
    return this.updateStatus();
  }

  private async resolveDeviceWithOwner(): Promise<NikoDeviceWithOwner> {
    const store = this.getStore();
    if (store.deviceWithOwner) {
      return store.deviceWithOwner;
    }
    // Migrate the legacy value to the new format
    const deviceWithOwner: NikoDeviceWithOwner = {
      device: store.device!,
      connectedControllerId: store.device!.ownerControllerId,
    };
    await this.setStoreValue('deviceWithOwner', deviceWithOwner);
    // await this.unsetStoreValue('device'); TODO: Remove this when verified, don't want to brick devices
    return deviceWithOwner;
  }
}
