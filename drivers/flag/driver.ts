import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoFlagDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction([
      { types: NikoType.VIRTUAL, models: [NikoModel.FLAG] },
      { types: NikoType.ACTION, models: [NikoModel.FLAG] },
    ]);
  }
}

module.exports = NikoFlagDriver;
