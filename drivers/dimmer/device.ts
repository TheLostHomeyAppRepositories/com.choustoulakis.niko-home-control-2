import { NikoDevice } from '../../src/NikoDevice';

import { DimmerMqttDevice, NikoProperty, NikoRange } from '../../src/niko/NikoTypes';

class NikoDimmer extends NikoDevice<DimmerMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('onoff', this.onValueChange);
    this.registerCapabilityListener('dim', this.onDimValueChange);
    await this.syncWithController();
  }

  private onValueChange = async (value: boolean) => {
    this.setNikoDeviceProps([{ Status: value ? 'On' : 'Off' }]);
  };

  private onDimValueChange = async (value: number) => {
    this.setNikoDeviceProps([{ Brightness: String((value * 100).toFixed(0)) as NikoRange }]);
  };

  async updateStatus(): Promise<void> {
    const status = this.getProperty(NikoProperty.STATUS);
    const brightness = this.getProperty(NikoProperty.BRIGHTNESS);

    if (!status || !brightness) {
      return this.setUnavailable(this.homey.__('device.misconfigured'));
    }
    await this.setAvailable();
    await this.setCapabilityValue('onoff', status === 'On');
    await this.setCapabilityValue('dim', Number(brightness) / 100);
  }
}

module.exports = NikoDimmer;
