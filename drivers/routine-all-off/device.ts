import { NikoDevice } from '../../src/NikoDevice';

import { AllOffMqttDevice, NikoProperty } from '../../src/niko/NikoTypes';

class AllOffDevice extends NikoDevice<AllOffMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('onoff', this.onValueChange);
    await this.syncWithController();
  }

  private onValueChange = async (value: boolean) => {
    if (value) {
      this.setNikoDeviceProps([{ BasicState: 'Triggered' }]);
    }
  };

  async updateStatus(): Promise<void> {
    const allActive = this.getProperty(NikoProperty.ALL_OFF_ACTIVE);
    const basicState = this.getProperty(NikoProperty.BASIC_STATE);
    if (!allActive || !basicState) {
      return this.setUnavailable('Device is misconfigured, please re-create it.');
    }
    await this.setAvailable();
    const isActive = allActive === 'True' || basicState === 'Triggered';
    await this.setCapabilityOptions('onoff', { setable: !isActive });
    await this.setCapabilityValue('onoff', isActive);
  }
}

module.exports = AllOffDevice;
