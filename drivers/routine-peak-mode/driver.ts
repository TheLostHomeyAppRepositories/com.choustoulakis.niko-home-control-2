import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoPeakModeDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.ACTION,
      models: [NikoModel.PEAK_MODE],
    });
  }
}

module.exports = NikoPeakModeDriver;
