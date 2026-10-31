import { NikoDevice } from '../../src/NikoDevice';

import { FanMqttDevice, NikoProperty } from '../../src/niko/NikoTypes';

class NikoFanDevice extends NikoDevice<FanMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('fan_mode', this.onStateChange);
    await this.syncWithController();
  }

  private onStateChange = async (state: 'Low' | 'Medium' | 'High' | 'Boost') => {
    this.setNikoDeviceProps([{ FanSpeed: state }]);
  };

  async updateStatus(): Promise<void> {
    const fanSpeed = this.getProperty(NikoProperty.FAN_SPEED);
    if (!fanSpeed) {
      return this.setUnavailable(this.homey.__('device.incorrectState'));
    }
    await this.setAvailable();
    await this.setCapabilityValue('fan_mode', fanSpeed);
  }
}

module.exports = NikoFanDevice;
