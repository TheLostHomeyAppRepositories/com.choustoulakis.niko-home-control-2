import Homey from 'homey';
import { ConnectedControllerDevice } from '../drivers/connected-controller/device';
import { clearInterval } from 'node:timers';
import { NikoDeviceWithOwner } from './niko/NikoMqttClient';

import { NikoMqttDevice } from './niko/NikoTypes';
import { NikoPropertyRecord, toPropertyRecord } from './niko/NikoProperties';
import { DeviceStore } from './NikoDriver';

export abstract class NikoDevice<K extends NikoMqttDevice> extends Homey.Device {
  private _connectedControllerId!: string;
  private _device!: K;
  private _properties: NikoPropertyRecord<K> = {};
  private interval!: NodeJS.Timeout;

  async onInit(): Promise<void> {
    await super.onInit();
    const { connectedControllerId, device } = await this.resolveDeviceWithOwner();
    this.setDevice(device as K);
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

  protected getProperty<TKey extends keyof NikoPropertyRecord<K>>(
    key: TKey,
  ): NikoPropertyRecord<K>[TKey] {
    return this._properties[key];
  }

  private setDevice(device: K): void {
    this._device = device;
    this._properties = toPropertyRecord<K>(device.Properties);
  }

  private onDeviceUpdate = (update: NikoDeviceWithOwner) => {
    this.setDevice(update.device as K);
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

  /**
   * An offline or missing controller is expected (e.g. a user pressing a button while the
   * installation is down), so mark the device unavailable instead of throwing. Throwing here
   * would surface as an error notification in Homey and look like a bug.
   */
  protected setNikoDeviceProps(props: Partial<K['Properties'][number]>[]): void {
    const controller = this.getConnectedController();
    if (controller === undefined) {
      this.setUnavailable('The Connected Controller no longer found.').catch(this.error);
      return;
    }
    if (!controller.setDeviceProps(this._device.Uuid, props)) {
      this.setUnavailable(
        'Failed to send command to Niko Home Control Controller. Please check the connection and try again.',
      ).catch(this.error);
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
