import { NikoDevice } from '../../src/NikoDevice';
import { EnergyHomeMqttDevice, NikoProperty } from '../../src/niko/NikoTypes';

// Spaced out, so updates arriving before Niko confirms a request don't send duplicates.
const LIVE_POWER_REQUEST_INTERVAL_MS = 10_000;

function toWatt(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const watt = Number(value);
  return Number.isFinite(watt) ? watt : undefined;
}

class NikoEnergyHomeDevice extends NikoDevice<EnergyHomeMqttDevice> {
  private lastLivePowerRequest = 0;

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

    if (this.getProperty(NikoProperty.REPORT_INSTANT_USAGE) !== 'True') {
      this.requestLivePower();
    }
  }

  // Niko resets ReportInstantUsage after 30 s and reports that as an update, which re-requests it.
  private requestLivePower(): void {
    if (Date.now() - this.lastLivePowerRequest < LIVE_POWER_REQUEST_INTERVAL_MS) return;
    this.lastLivePowerRequest = Date.now();
    this.setNikoDeviceProps([{ [NikoProperty.REPORT_INSTANT_USAGE]: 'True' }]);
  }
}

module.exports = NikoEnergyHomeDevice;
