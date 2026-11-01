import { NikoRelayDevice } from '../../src/shared/RelayDevice';
import { NikoModel } from '../../src/niko/NikoTypes';

// Before the socket, switched fan and switched output drivers existed, this driver paired all relay
// models. Those devices stay here (paired devices cannot move to another driver) and keep working.
export class NikoLightDevice extends NikoRelayDevice {
  async onInit(): Promise<void> {
    await super.onInit();
    await this.updateDeviceClassIfNeeded();
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
}

module.exports = NikoLightDevice;
