import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoMotorDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.ACTION,
      models: [NikoModel.SHUTTER, NikoModel.SUNBLIND, NikoModel.GATE, NikoModel.VENETIAN_BLIND],
    });
  }
}

module.exports = NikoMotorDriver;
