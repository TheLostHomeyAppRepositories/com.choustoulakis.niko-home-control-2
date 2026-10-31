import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoSixfoldComfortSensorDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.MULTISENSOR,
      models: [NikoModel.THERMO_X6_FEEDBACK],
    });
  }
}

module.exports = NikoSixfoldComfortSensorDriver;
