import Homey from 'homey';
import { ConnectedControllerDevice } from '../drivers/connected-controller/device';
import { clearInterval } from 'node:timers';
import { NikoDeviceWithOwner } from './niko/NikoMqttClient';

import { NikoMqttDevice } from './niko/NikoTypes';
import { NikoPropertyRecord, toPropertyRecord } from './niko/NikoProperties';
import { onControllerChanged, onDeviceUpdate } from './niko/NikoEvents';
import { DeviceStore } from './NikoDriver';

const SYNC_SAFETY_NET_MS = 5 * 60_000;

export abstract class NikoDevice<K extends NikoMqttDevice> extends Homey.Device {
  private _connectedControllerId!: string;
  private _device!: K;
  private _properties: NikoPropertyRecord<K> = {};
  private interval!: NodeJS.Timeout;
  private unsubscribers: (() => void)[] = [];

  async onInit(): Promise<void> {
    await super.onInit();
    const { connectedControllerId, device } = await this.resolveDeviceWithOwner();
    this.setDevice(device as K);
    this._connectedControllerId = connectedControllerId;
    this.unsubscribers.push(
      onDeviceUpdate(this.homey, this._device.Uuid, this.onDeviceUpdate),
      onControllerChanged(this.homey, connectedControllerId, this.onControllerChanged),
    );
    // The controller pushes its changes; this only recovers from a missed event.
    this.interval = this.homey.setInterval(this.onControllerChanged, SYNC_SAFETY_NET_MS);
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

  private onControllerChanged = () => {
    this.syncWithController().catch(this.error);
  };

  /**
   * Takes the current state of this device from the Connected Controller, or marks the device
   * unavailable with the reason. Call this at the end of `onInit()` instead of `updateStatus()`,
   * so a device never starts from the (stale) properties stored at pairing time.
   */
  protected async syncWithController(): Promise<void> {
    const controller = this.getConnectedController();
    if (controller === undefined) {
      return this.setUnavailable('The Connected Controller no longer found.');
    }
    if (!controller.isOnline()) {
      return this.setUnavailable('The Connected Controller found, but is offline.');
    }
    const device = controller.getNikoDevice(this._device.Uuid);
    if (
      device === undefined ||
      device.Type !== this._device.Type ||
      device.Model !== this._device.Model
    ) {
      return this.setUnavailable(
        'The Connected Controller is available, but the device is not found in the list. Please check the Niko programming software.',
      );
    }
    this.setDevice(device as K);
    return this.updateStatus();
  }

  protected getConnectedController(): ConnectedControllerDevice | undefined {
    let controllerDevices: ConnectedControllerDevice[];
    try {
      const controllerDriver = this.homey.drivers.getDriver('connected-controller');
      controllerDevices = controllerDriver.getDevices() as ConnectedControllerDevice[];
    } catch {
      // The controller driver may not be initialized yet during app start. The controller
      // notifies its devices once it is connected.
      return undefined;
    }
    return controllerDevices.find(
      (controllerDevice) => controllerDevice.getData().id === this._connectedControllerId,
    );
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
    this.unload();
    return super.onUninit();
  }

  onDeleted() {
    this.unload();
    super.onDeleted();
  }

  private unload(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    clearInterval(this.interval);
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
