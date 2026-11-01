import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoSmartPlugDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.SMART_PLUG,
      models: [NikoModel.NASO, NikoModel.GENERIC],
    });
  }
}

module.exports = NikoSmartPlugDriver;
