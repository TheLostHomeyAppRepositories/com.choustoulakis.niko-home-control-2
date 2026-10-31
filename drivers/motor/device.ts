import { NikoDevice } from '../../src/NikoDevice';

import { MotorMqttDevice, NikoProperty, NikoRange } from '../../src/niko/NikoTypes';

class NikoMotor extends NikoDevice<MotorMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('windowcoverings_state', this.onStateChange as any);

    if (!this.hasCapability('windowcoverings_set')) {
      await this.addCapability('windowcoverings_set');
    }
    this.registerCapabilityListener('windowcoverings_set', this.onSetPosition as any);
    await this.syncWithController();
  }

  private onStateChange = async (state: 'up' | 'idle' | 'down') => {
    if (state === 'up') {
      return this.setNikoDeviceProps([{ Action: 'Open' }]);
    }
    if (state === 'down') {
      return this.setNikoDeviceProps([{ Action: 'Close' }]);
    }
    return this.setNikoDeviceProps([{ Action: 'Stop' }]);
  };

  private onSetPosition = async (position: number) => {
    return this.setNikoDeviceProps([
      { Position: String((position * 100).toFixed(0)) as NikoRange },
    ]);
  };

  async updateStatus(): Promise<void> {
    const moving = this.getProperty(NikoProperty.MOVING);
    const position = this.getProperty(NikoProperty.POSITION);
    await this.setAvailable();
    if (moving !== undefined && moving === 'False') {
      await this.setCapabilityValue('windowcoverings_state', 'idle');

      // Only set the position after moving is complete, because the sensor is not reporting
      // the correct position during movement.
      if (position !== undefined) {
        await this.setCapabilityValue('windowcoverings_set', Number(position) / 100);
      }
    }
  }
}

module.exports = NikoMotor;
