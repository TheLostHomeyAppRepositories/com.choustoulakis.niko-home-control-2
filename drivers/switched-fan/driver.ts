import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoSwitchedFanDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.ACTION,
      models: [NikoModel.SWITCHED_FAN],
    });
  }
}

module.exports = NikoSwitchedFanDriver;
