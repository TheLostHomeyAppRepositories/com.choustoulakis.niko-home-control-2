import { NikoDevice } from '../../src/NikoDevice';

import { NikoModel, NikoProperty, RelayMqttDevice } from '../../src/niko/NikoTypes';

export class NikoLightDevice extends NikoDevice<RelayMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    await this.updateDeviceClassIfNeeded();
    this.registerCapabilityListener('onoff', this.onValueChange);
    await this.syncWithController();
  }

  private onValueChange = async (value: boolean) => {
    this.setNikoDeviceProps([{ Status: value ? 'On' : 'Off' }]);
  };

  async updateStatus(): Promise<void> {
    const status = this.getProperty(NikoProperty.STATUS);
    if (status === undefined) {
      return this.setUnavailable('Device is misconfigured, please re-create it.');
    }
    await this.setAvailable();
    await this.setCapabilityValue('onoff', status === 'On');
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
