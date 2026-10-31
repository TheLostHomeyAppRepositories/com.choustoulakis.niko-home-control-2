import { NikoDevice } from '../NikoDevice';
import { NikoProperty, ThermoMqttDevice } from '../niko/NikoTypes';

export class NikoComfortDevice extends NikoDevice<ThermoMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    await this.syncWithController();
  }

  async updateStatus(): Promise<void> {
    const temp = this.getProperty(NikoProperty.AMBIENT_TEMPERATURE);
    const humidity = this.getProperty(NikoProperty.HUMIDITY);
    // Temperature and humidity reporting can each be disabled in the Niko programming software.
    if (!temp && !humidity) {
      return this.setUnavailable(this.homey.__('device.sensorUnavailable'));
    }
    await this.setAvailable();
    if (temp) {
      await this.setCapabilityValue('measure_temperature', Number(temp));
    }
    if (humidity) {
      await this.setCapabilityValue('measure_humidity', Number(humidity));
    }
  }
}
