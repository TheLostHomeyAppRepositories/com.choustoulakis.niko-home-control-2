import { NikoRelayDevice } from '../../src/shared/RelayDevice';
import { NikoModel } from '../../src/niko/NikoTypes';

// Before the socket, switched fan and switched output drivers existed, this driver paired all relay
// models. Those devices stay here: paired devices cannot move to another driver.
const NEWER_DRIVER_NAME_KEYS: Partial<Record<NikoModel, string>> = {
  [NikoModel.SOCKET]: 'driverName.socket',
  [NikoModel.SWITCHED_FAN]: 'driverName.switchedFan',
  [NikoModel.SWITCHED_GENERIC]: 'driverName.switchedGeneric',
};

export class NikoLightDevice extends NikoRelayDevice {
  async onInit(): Promise<void> {
    await super.onInit();
    await this.updateDeviceClassIfNeeded();
    await this.updateNewerDriverWarning();
  }

  private async updateDeviceClassIfNeeded(): Promise<void> {
    const isLight = this.device.Model === NikoModel.LIGHT;
    const currentClass = this.getClass();
    if (isLight && currentClass !== 'light') {
      await this.setClass('light');
    } else if (!isLight && currentClass !== 'socket') {
      // Users can select through the UI what device type is plugged in.
      await this.setClass('socket');
    }
  }

  private async updateNewerDriverWarning(): Promise<void> {
    const driverNameKey = NEWER_DRIVER_NAME_KEYS[this.device.Model];
    if (driverNameKey === undefined) {
      await this.unsetWarning();
      return;
    }
    await this.setWarning(
      this.homey.__('device.readdWithNewerDriver', { driver: this.homey.__(driverNameKey) }),
    );
  }
}

module.exports = NikoLightDevice;
