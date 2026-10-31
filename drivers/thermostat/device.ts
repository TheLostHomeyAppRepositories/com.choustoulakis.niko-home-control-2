import Homey from 'homey';
import { NikoDevice } from '../../src/NikoDevice';
import {
  NikoHvacFanSpeed,
  NikoOverruleTime,
  NikoProgram,
  NikoProperty,
  NikoSetpoint,
  ThermostatMqttDevice,
} from '../../src/niko/NikoTypes';
import {
  canControl,
  getPropertyDefinition,
  parseChoice,
  parseRange,
} from '../../src/niko/NikoProperties';

const DEFAULT_OVERRULE_MINUTES = 240;
type ThermostatMode = 'heat' | 'cool' | 'off';
type ProgramValue = { id: NikoProgram; title: Record<string, string> };

const CAPABILITY_REQUIRES_ANY_OF: Record<string, NikoProperty[]> = {
  target_temperature: [NikoProperty.OVERRULE_SETPOINT],
  measure_temperature: [NikoProperty.AMBIENT_TEMPERATURE],
  thermostat_mode: [NikoProperty.OPERATION_MODE, NikoProperty.THERMOSTAT_ON],
  niko_program: [NikoProperty.PROGRAM],
  niko_demand: [NikoProperty.DEMAND],
  niko_eco_save: [NikoProperty.ECO_SAVE],
  fan_mode: [NikoProperty.FAN_SPEED],
};

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * One device for every Niko thermostat variant: wall thermostat, touch switch, Digital Black,
 * virtual and HVAC. They report different subsets of the same properties with different ranges,
 * so capabilities, temperature range and programs come from the device's PropertyDefinitions.
 */
export class NikoThermostatDevice extends NikoDevice<ThermostatMqttDevice> {
  async onInit(): Promise<void> {
    await super.onInit();
    await this.configureCapabilities();
    this.registerCapabilityListener('target_temperature', this.onTargetTemperature);
    this.registerCapabilityListener('thermostat_mode', this.onThermostatMode);
    this.registerCapabilityListener('niko_program', (program: NikoProgram) =>
      this.setProgram(program),
    );
    this.registerCapabilityListener('niko_eco_save', this.onEcoSave);
    this.registerCapabilityListener('fan_mode', this.onFanMode);
    await this.syncWithController();
  }

  private async configureCapabilities(): Promise<void> {
    for (const [capability, properties] of Object.entries(CAPABILITY_REQUIRES_ANY_OF)) {
      const supported = properties.some((property) => getPropertyDefinition(this.device, property));
      if (supported && !this.hasCapability(capability)) {
        await this.addCapability(capability);
      } else if (!supported && this.hasCapability(capability)) {
        await this.removeCapability(capability);
      }
    }

    const range = parseRange(getPropertyDefinition(this.device, NikoProperty.OVERRULE_SETPOINT));
    if (range && this.hasCapability('target_temperature')) {
      await this.setCapabilityOptions('target_temperature', range);
    }

    if (this.hasCapability('niko_program')) {
      const programs = this.getSupportedPrograms();
      const values = this.getProgramValues().filter((value) => programs.includes(value.id));
      if (values.length > 0) {
        await this.setCapabilityOptions('niko_program', { values }).catch(this.error);
      }
    }
  }

  private getProgramValues(): ProgramValue[] {
    return Homey.manifest.capabilities?.niko_program?.values ?? [];
  }

  private getSupportedPrograms(): NikoProgram[] {
    return parseChoice(getPropertyDefinition(this.device, NikoProperty.PROGRAM)) as NikoProgram[];
  }

  getProgramAutocompleteOptions(): { id: NikoProgram; name: string }[] {
    const titles = new Map(this.getProgramValues().map((value) => [value.id, value.title]));
    return this.getSupportedPrograms().map((id) => ({
      id,
      name: titles.has(id) ? this.homey.__(titles.get(id)!) : id,
    }));
  }

  getProgram(): NikoProgram | undefined {
    return this.getProperty(NikoProperty.PROGRAM);
  }

  async setProgram(program: NikoProgram): Promise<void> {
    if (!this.getSupportedPrograms().includes(program)) {
      throw new Error(this.homey.__('thermostat.programNotSupported', { program }));
    }
    this.setNikoDeviceProps([{ [NikoProperty.PROGRAM]: program }]);
  }

  // Niko's setpoint is read-only, so a temperature set in Homey is a time-limited override.
  private onTargetTemperature = async (temperature: number) => {
    const step =
      parseRange(getPropertyDefinition(this.device, NikoProperty.OVERRULE_SETPOINT))?.step ?? 0.5;
    const setpoint = String(Math.round(temperature / step) * step) as NikoSetpoint;
    const minutes = Number(this.getSetting('overruleMinutes')) || DEFAULT_OVERRULE_MINUTES;
    const overruleTime: NikoOverruleTime =
      `${Math.min(1439, Math.max(1, Math.round(minutes)))}` as const;
    this.setNikoDeviceProps([
      { [NikoProperty.OVERRULE_SETPOINT]: setpoint },
      { [NikoProperty.OVERRULE_TIME]: overruleTime },
      { [NikoProperty.OVERRULE_ACTIVE]: 'True' },
    ]);
  };

  private onThermostatMode = async (mode: ThermostatMode) => {
    const canSwitch = canControl(this.device, NikoProperty.THERMOSTAT_ON);
    if (mode === 'off') {
      if (canSwitch) this.setNikoDeviceProps([{ [NikoProperty.THERMOSTAT_ON]: 'Off' }]);
      return;
    }
    this.setNikoDeviceProps([
      ...(canSwitch ? [{ [NikoProperty.THERMOSTAT_ON]: 'On' as const }] : []),
      { [NikoProperty.OPERATION_MODE]: mode === 'heat' ? 'Heating' : 'Cooling' },
    ]);
  };

  private onEcoSave = async (enabled: boolean) => {
    this.setNikoDeviceProps([{ [NikoProperty.ECO_SAVE]: enabled ? 'True' : 'False' }]);
  };

  private onFanMode = async (speed: NikoHvacFanSpeed) => {
    this.setNikoDeviceProps([{ [NikoProperty.FAN_SPEED]: speed }]);
  };

  async updateStatus(): Promise<void> {
    if (this.getProperty(NikoProperty.HVAC_ON) === 'Off') {
      return this.setUnavailable(this.homey.__('device.hvacOffline'));
    }
    await this.setAvailable();

    const ambient = toNumber(this.getProperty(NikoProperty.AMBIENT_TEMPERATURE));
    if (ambient !== undefined && this.hasCapability('measure_temperature')) {
      await this.setCapabilityValue('measure_temperature', ambient);
    }

    // While an override runs, its setpoint is the one in effect.
    const overruleActive = this.getProperty(NikoProperty.OVERRULE_ACTIVE) === 'True';
    const setpoint = toNumber(
      this.getProperty(
        overruleActive ? NikoProperty.OVERRULE_SETPOINT : NikoProperty.SETPOINT_TEMPERATURE,
      ),
    );
    if (setpoint !== undefined && this.hasCapability('target_temperature')) {
      await this.setCapabilityValue('target_temperature', setpoint);
    }

    const mode = this.getThermostatMode();
    if (mode && this.hasCapability('thermostat_mode')) {
      await this.setCapabilityValue('thermostat_mode', mode);
    }

    const program = this.getProgram();
    if (program && this.hasCapability('niko_program')) {
      await this.setCapabilityValue('niko_program', program);
    }

    const demand = this.getProperty(NikoProperty.DEMAND);
    if (demand && this.hasCapability('niko_demand')) {
      await this.setCapabilityValue('niko_demand', demand);
    }

    const ecoSave = this.getProperty(NikoProperty.ECO_SAVE);
    if (ecoSave && this.hasCapability('niko_eco_save')) {
      await this.setCapabilityValue('niko_eco_save', ecoSave === 'True');
    }

    const fanSpeed = this.getProperty(NikoProperty.FAN_SPEED);
    if (fanSpeed && this.hasCapability('fan_mode')) {
      await this.setCapabilityValue('fan_mode', fanSpeed);
    }
  }

  private getThermostatMode(): ThermostatMode | undefined {
    if (this.getProperty(NikoProperty.THERMOSTAT_ON) === 'Off') return 'off';
    const operationMode = this.getProperty(NikoProperty.OPERATION_MODE);
    if (operationMode === 'Heating') return 'heat';
    if (operationMode === 'Cooling') return 'cool';
    return undefined;
  }
}

module.exports = NikoThermostatDevice;
