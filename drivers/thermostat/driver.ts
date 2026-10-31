import { DevicePairingData, NikoDriver } from '../../src/NikoDriver';
import { NikoModel, NikoProgram, NikoType } from '../../src/niko/NikoTypes';
import type { NikoThermostatDevice } from './device';

type ProgramArgs = { device: NikoThermostatDevice; program: { id: NikoProgram; name: string } };

class NikoThermostatDriver extends NikoDriver {
  async onInit(): Promise<void> {
    const autocomplete = async (query: string, args: ProgramArgs) =>
      args.device
        .getProgramAutocompleteOptions()
        .filter((option) => option.name.toLowerCase().includes(query.toLowerCase()));

    this.homey.flow
      .getConditionCard('program_is')
      .registerRunListener(
        async (args: ProgramArgs) => args.device.getProgram() === args.program.id,
      )
      .registerArgumentAutocompleteListener('program', autocomplete);

    this.homey.flow
      .getActionCard('set_program')
      .registerRunListener(async (args: ProgramArgs) => args.device.setProgram(args.program.id))
      .registerArgumentAutocompleteListener('program', autocomplete);
  }

  async onPairListDevices(): Promise<DevicePairingData[]> {
    return this.getDevicesByAction([
      {
        types: NikoType.HVAC,
        models: [
          NikoModel.THERMOSTAT,
          NikoModel.TOUCH_SWITCH,
          NikoModel.VIRTUAL,
          NikoModel.HVAC_THERMOSTAT,
        ],
      },
      { types: NikoType.THERMOSTAT, models: [NikoModel.THERMOSTAT, NikoModel.VIRTUAL] },
    ]);
  }
}

module.exports = NikoThermostatDriver;
