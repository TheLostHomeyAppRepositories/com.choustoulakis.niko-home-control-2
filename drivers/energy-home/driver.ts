import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoEnergyHomeDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.ENERGY_HOME,
      models: [NikoModel.GENERIC],
    });
  }
}

module.exports = NikoEnergyHomeDriver;
