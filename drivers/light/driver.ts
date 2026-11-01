import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';

class NikoLightDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return super.getDevicesByAction({
      types: NikoType.ACTION,
      // Sockets, switched fans and switched outputs have their own drivers.
      models: [NikoModel.LIGHT],
    });
  }
}

module.exports = NikoLightDriver;
