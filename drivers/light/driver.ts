import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoLightDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return super.getDevicesByAction({
      types: NikoType.ACTION,
      models: [
        NikoModel.LIGHT,
        NikoModel.SOCKET,
        NikoModel.SWITCHED_FAN,
        NikoModel.SWITCHED_GENERIC,
      ],
    });
  }
}

module.exports = NikoLightDriver;
