import { NikoDevice } from '../NikoDevice';
import { NikoProperty, RelayMqttDevice } from '../niko/NikoTypes';

/** A relay action (light, socket, switched fan or switched output): on/off via Status. */
export class NikoRelayDevice extends NikoDevice<RelayMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    this.registerCapabilityListener('onoff', this.onValueChange);
    await this.syncWithController();
  }

  private onValueChange = async (value: boolean) => {
    this.setNikoDeviceProps([{ [NikoProperty.STATUS]: value ? 'On' : 'Off' }]);
  };

  async updateStatus(): Promise<void> {
    const status = this.getProperty(NikoProperty.STATUS);
    if (status === undefined) {
      return this.setUnavailable(this.homey.__('device.misconfigured'));
    }
    await this.setAvailable();
    await this.setCapabilityValue('onoff', status === 'On');
  }
}
