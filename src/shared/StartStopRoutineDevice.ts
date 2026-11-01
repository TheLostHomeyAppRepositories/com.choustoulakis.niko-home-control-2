import { NikoDevice } from '../NikoDevice';
import { NikoMqttDevice, NikoProperty, StartStopRoutineMqttDevice } from '../niko/NikoTypes';
import { getPropertyDefinition, parseChoice } from '../niko/NikoProperties';

/** A routine with a start and stop part. "Triggered" toggles it, so only send it on a change. */
export class NikoStartStopRoutineDevice extends NikoDevice<StartStopRoutineMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('onoff', this.onValueChange);
    await this.syncWithController();
  }

  private isActive(): boolean {
    const state = this.getProperty(NikoProperty.BASIC_STATE);
    return state !== undefined && state !== 'Off';
  }

  private onValueChange = async (value: boolean) => {
    if (value !== this.isActive()) {
      this.setNikoDeviceProps([{ [NikoProperty.BASIC_STATE]: 'Triggered' }]);
    }
  };

  async updateStatus(): Promise<void> {
    if (this.getProperty(NikoProperty.BASIC_STATE) === undefined) {
      return this.setUnavailable(this.homey.__('device.misconfigured'));
    }
    await this.setAvailable();
    await this.setCapabilityValue('onoff', this.isActive());
  }
}

/**
 * The presence alert (intruder alarm) and the warning mode (panic) are both model `alarms`. Per the
 * Hobby API spec only the intruder alarm has an Intermediate state (arming).
 */
export function isIntruderAlarm(device: NikoMqttDevice): boolean {
  return parseChoice(getPropertyDefinition(device, NikoProperty.BASIC_STATE)).includes(
    'Intermediate',
  );
}
