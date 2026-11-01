import { NikoDevice } from '../../src/NikoDevice';
import { EnergyHomeMqttDevice, NikoProperty } from '../../src/niko/NikoTypes';
import { LivePowerRequester, toWatt } from '../../src/shared/LivePower';

class NikoEnergyHomeDevice extends NikoDevice<EnergyHomeMqttDevice> {
  private readonly livePower = new LivePowerRequester(() =>
    this.setNikoDeviceProps([{ [NikoProperty.REPORT_INSTANT_USAGE]: 'True' }]),
  );

  async onInit(): Promise<void> {
    await super.onInit();
    await this.syncWithController();
  }

  async updateStatus(): Promise<void> {
    await this.setAvailable();

    const fromGrid = toWatt(this.getProperty(NikoProperty.ELECTRICAL_POWER_FROM_GRID));
    const toGrid = toWatt(this.getProperty(NikoProperty.ELECTRICAL_POWER_TO_GRID));
    if (fromGrid !== undefined || toGrid !== undefined) {
      // Homey expects the home's net power: positive while importing, negative while exporting.
      await this.setCapabilityValue('measure_power', (fromGrid ?? 0) - (toGrid ?? 0));
    }

    const monthlyPeak = toWatt(
      this.getProperty(NikoProperty.ELECTRICAL_MONTHLY_PEAK_POWER_FROM_GRID),
    );
    if (monthlyPeak !== undefined) {
      await this.setCapabilityValue('measure_power.monthly_peak', monthlyPeak);
    }

    this.livePower.onUpdate(this.getProperty(NikoProperty.REPORT_INSTANT_USAGE));
  }
}

module.exports = NikoEnergyHomeDevice;
