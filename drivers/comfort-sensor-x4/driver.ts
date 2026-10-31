import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoFourfoldComfortSensorDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({
      types: NikoType.MULTISENSOR,
      models: [NikoModel.THERMO_X4_FEEDBACK, NikoModel.THERMO_VENTILATION_FEEDBACK],
    });
  }
}

module.exports = NikoFourfoldComfortSensorDriver;
