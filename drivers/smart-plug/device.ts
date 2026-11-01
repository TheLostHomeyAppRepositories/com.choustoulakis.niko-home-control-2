import { NikoDevice } from '../../src/NikoDevice';
import { NikoProperty, SmartPlugMqttDevice } from '../../src/niko/NikoTypes';
import { getPropertyDefinition } from '../../src/niko/NikoProperties';
import { LivePowerRequester, toWatt } from '../../src/shared/LivePower';

class NikoSmartPlugDevice extends NikoDevice<SmartPlugMqttDevice> {
  private readonly livePower = new LivePowerRequester(() =>
    this.setNikoDeviceProps([{ [NikoProperty.REPORT_INSTANT_USAGE]: 'True' }]),
  );

  async onInit(): Promise<void> {
    await super.onInit();
    // Plugs set to switching only may not report power at all.
    const measuresPower = getPropertyDefinition(this.device, NikoProperty.ELECTRICAL_POWER);
    if (!measuresPower && this.hasCapability('measure_power')) {
      await this.removeCapability('measure_power');
    }
    this.registerCapabilityListener('onoff', this.onValueChange);
    await this.syncWithController();
  }

  private onValueChange = async (value: boolean) => {
    this.setNikoDeviceProps([{ [NikoProperty.STATUS]: value ? 'On' : 'Off' }]);
  };

  async updateStatus(): Promise<void> {
    const status = this.getProperty(NikoProperty.STATUS);
    if (status === undefined) {
      return this.setUnavailable(this.homey.__('device.misconfigured'));
    }
    await this.setAvailable();
    await this.setCapabilityValue('onoff', status === 'On');

    if (!this.hasCapability('measure_power')) return;
    const power = toWatt(this.getProperty(NikoProperty.ELECTRICAL_POWER));
    if (power !== undefined) {
      await this.setCapabilityValue('measure_power', power);
    }
    if (getPropertyDefinition(this.device, NikoProperty.REPORT_INSTANT_USAGE)) {
      this.livePower.onUpdate(this.getProperty(NikoProperty.REPORT_INSTANT_USAGE));
    }
  }
}

module.exports = NikoSmartPlugDevice;
