import { NikoDevice } from '../../src/NikoDevice';
import { FlagMqttDevice, NikoProperty } from '../../src/niko/NikoTypes';

class NikoFlagDevice extends NikoDevice<FlagMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('onoff', this.onValueChange);
    await this.syncWithController();
  }

  private onValueChange = async (value: boolean) => {
    this.setNikoDeviceProps([{ [NikoProperty.STATUS]: value ? 'True' : 'False' }]);
  };

  async updateStatus(): Promise<void> {
    const status = this.getProperty(NikoProperty.STATUS);
    if (status === undefined) {
      return this.setUnavailable(this.homey.__('device.misconfigured'));
    }
    await this.setAvailable();
    await this.setCapabilityValue('onoff', status === 'True');
  }
}

module.exports = NikoFlagDevice;
