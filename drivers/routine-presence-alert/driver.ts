import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoType } from '../../src/niko/NikoTypes';
import { isIntruderAlarm } from '../../src/shared/StartStopRoutineDevice';

class NikoPresenceAlertDriver extends NikoDriver {
  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction({ types: NikoType.ACTION, models: [NikoModel.ALARMS] }).filter(
      (pairing) => isIntruderAlarm(pairing.store.deviceWithOwner!.device) === true,
    );
  }
}

module.exports = NikoPresenceAlertDriver;
