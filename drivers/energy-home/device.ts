import { NikoDevice } from '../../src/NikoDevice';
import { EnergyHomeMqttDevice, NikoProperty } from '../../src/niko/NikoTypes';

// Niko confirms a live power request within a second and resets it after 30 s. Re-requests are
// spaced out, so a burst of updates before the confirmation does not send duplicates.
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
    const peakLimit = toWatt(this.getProperty(NikoProperty.CONFIGURED_MONTHLY_PEAK_W));
    if (peakLimit !== undefined) {
      await this.setCapabilityValue('measure_power.peak_limit', peakLimit);
    }

    if (this.getProperty(NikoProperty.REPORT_INSTANT_USAGE) !== 'True') {
      this.requestLivePower();
    }
  }

  /**
   * Power is only reported while ReportInstantUsage is True. Niko resets it after 30 s and
   * reports that as a status update, which brings us back here to request it again.
   */
  private requestLivePower(): void {
    if (Date.now() - this.lastLivePowerRequest < LIVE_POWER_REQUEST_INTERVAL_MS) return;
    this.lastLivePowerRequest = Date.now();
    this.setNikoDeviceProps([{ [NikoProperty.REPORT_INSTANT_USAGE]: 'True' }]);
  }
}

module.exports = NikoEnergyHomeDevice;
