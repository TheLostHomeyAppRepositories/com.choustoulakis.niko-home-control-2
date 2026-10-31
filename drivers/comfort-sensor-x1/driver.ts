import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoSingleComfortSensorDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.MULTISENSOR,
      models: [NikoModel.THERMO_X1, NikoModel.THERMO_X1_FEEDBACK],
    });
  }
}

module.exports = NikoSingleComfortSensorDriver;
