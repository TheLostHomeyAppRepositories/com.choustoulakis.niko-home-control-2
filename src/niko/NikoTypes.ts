export enum NikoModel {
  LIGHT = 'light',
  SOCKET = 'socket',
  SWITCHED_FAN = 'switched-fan',
  SWITCHED_GENERIC = 'switched-generic',
  DIMMER = 'dimmer',
  SHUTTER = 'rolldownshutter',
  SUNBLIND = 'sunblind',
  GATE = 'gate',
  VENETIAN_BLIND = 'venetianblind',
  ALL_OFF = 'alloff',
  THERMO_X1 = 'thermoswitchx1',
  COMFORT = 'comfort',
  THERMO_X1_FEEDBACK = 'thermoswitchx1feedback',
  THERMO_X2_FEEDBACK = 'thermoswitchx2feedback',
  THERMO_X4_FEEDBACK = 'thermoswitchx4feedback',
  THERMO_X6_FEEDBACK = 'thermoswitchx6feedback',
  THERMO_VENTILATION_FEEDBACK = 'thermoventilationcontrollerfeedback',
  FAN = 'fan',
  THERMOSTAT = 'thermostat',
  TOUCH_SWITCH = 'touchswitch',
  GENERIC = 'generic',
}

export enum NikoType {
  ACTION = 'action',
  MULTISENSOR = 'multisensor',
  HVAC = 'hvac',
  ENERGY_HOME = 'energyhome',
}

export enum NikoProperty {
  STATUS = 'Status',
  BRIGHTNESS = 'Brightness',
  ACTION = 'Action',
  POSITION = 'Position',
  ALIGNED = 'Aligned',
  MOVING = 'Moving',
  BASIC_STATE = 'BasicState',
  ALL_OFF_ACTIVE = 'AllOffActive',
  MOOD_ACTIVE = 'MoodActive',
  FAN_SPEED = 'FanSpeed',
  AMBIENT_TEMPERATURE = 'AmbientTemperature',
  HUMIDITY = 'Humidity',
  PROGRAM = 'Program',
  SETPOINT_TEMPERATURE = 'SetpointTemperature',
  OVERRULE_ACTIVE = 'OverruleActive',
  OVERRULE_SETPOINT = 'OverruleSetpoint',
  OVERRULE_TIME = 'OverruleTime',
  ECO_SAVE = 'EcoSave',
  DEMAND = 'Demand',
  ELECTRICAL_POWER_FROM_GRID = 'ElectricalPowerFromGrid',
  ELECTRICAL_POWER_TO_GRID = 'ElectricalPowerToGrid',
  REPORT_INSTANT_USAGE = 'ReportInstantUsage',
  ELECTRICAL_MONTHLY_PEAK_POWER_FROM_GRID = 'ElectricalMonthlyPeakPowerFromGrid',
}

export enum NikoTechnology {
  NIKO_HOME_CONTROL = 'nikohomecontrol',
}

export type NikoAction = 'Open' | 'Close' | 'Stop';
export type NikoFanSpeed = 'Low' | 'Medium' | 'High' | 'Boost';
export type NikoBoolean = 'True' | 'False';
export type NikoBooleanLowercase = 'true' | 'false';
export type NikoOnOff = 'On' | 'Off';
export type NikoTriggerable = NikoOnOff | 'Triggered';
export type NikoProgram = 'Day' | 'Night' | 'Eco' | 'Off' | 'Prog1' | 'Prog2' | 'Prog3';
export type NikoDemand = 'Heating' | 'Cooling' | 'None';
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

type IntRange<From extends number, To extends number> = Exclude<Enumerate<To>, Enumerate<From>>; // From -> To - 1
type Tenths<I extends number> = `${I}` | `${I}.${Enumerate<10>}`;
type Halves<I extends number> = `${I}` | `${I}.5`;

// Value ranges as documented in the Niko Hobby API technical documentation.
export type NikoRange = `${Enumerate<101>}` & {}; // 0 -> 100
export type NikoTemperature = Tenths<IntRange<0, 46>> | `-${Tenths<IntRange<0, 11>>}`; // -10 -> 45, step 0.1
export type NikoHumidity = Tenths<Enumerate<100>> | '100'; // 0 -> 100, step 0.1
export type NikoThermostatTemperature = Halves<IntRange<0, 46>> | `-${Halves<IntRange<0, 6>>}`; // -5 -> 45, step 0.5
export type NikoSetpoint = Halves<IntRange<5, 30>> | '30'; // 5 -> 30, step 0.5
export type NikoOverruleTime = `${number}` & {}; // 1 -> 1439 minutes, too large for a literal union
export type NikoWatt = `${number}` & {}; // Range(0, 999999999, 0.001), e.g. "369.000"
/** Energy values are empty until reported, e.g. power before live reporting is enabled. */
export type NikoUnreported = '';

export interface NikoPropertyDefinition {
  HasStatus: NikoBooleanLowercase;
  CanControl: NikoBooleanLowercase;
  Description: string; // e.g. "Range(0.000,999999999.000,0.001)", "Boolean", "Choice(On,Off)"
}

export interface NikoMqttDevice {
  Uuid: string;
  Name: string;
  Model: NikoModel;
  Technology: NikoTechnology;
  Type: NikoType;
  Properties: Partial<Record<NikoProperty, string>>[];
  PropertyDefinitions: Record<string, NikoPropertyDefinition>[];
  Online: NikoBoolean;
}

export interface RelayMqttDevice extends NikoMqttDevice {
  Type: NikoType.ACTION;
  Model: NikoModel.LIGHT | NikoModel.SOCKET | NikoModel.SWITCHED_FAN | NikoModel.SWITCHED_GENERIC;
  Properties: [{ [NikoProperty.STATUS]: NikoOnOff }];
}

export interface MotorMqttDevice extends NikoMqttDevice {
  Type: NikoType.ACTION;
  Model: NikoModel.SHUTTER | NikoModel.SUNBLIND | NikoModel.GATE | NikoModel.VENETIAN_BLIND;
  Properties: [
    { [NikoProperty.ACTION]: NikoAction },
    { [NikoProperty.POSITION]: NikoRange },
    { [NikoProperty.ALIGNED]: NikoBoolean },
    { [NikoProperty.MOVING]: NikoBoolean },
  ];
}

export interface AllOffMqttDevice extends NikoMqttDevice {
  Type: NikoType.ACTION;
  Model: NikoModel.ALL_OFF;
  Properties: [
    { [NikoProperty.BASIC_STATE]: NikoTriggerable },
    { [NikoProperty.ALL_OFF_ACTIVE]: NikoBoolean },
  ];
}

export interface MoodMqttDevice extends NikoMqttDevice {
  Type: NikoType.ACTION;
  Model: NikoModel.COMFORT;
  Properties: [
    { [NikoProperty.BASIC_STATE]: NikoTriggerable },
    { [NikoProperty.MOOD_ACTIVE]: NikoBoolean },
  ];
}

export interface FanMqttDevice extends NikoMqttDevice {
  Type: NikoType.ACTION;
  Model: NikoModel.FAN;
  Properties: [{ [NikoProperty.FAN_SPEED]: NikoFanSpeed }];
}

export interface DimmerMqttDevice extends NikoMqttDevice {
  Type: NikoType.ACTION;
  Model: NikoModel.DIMMER;
  Properties: [{ [NikoProperty.STATUS]: NikoOnOff }, { [NikoProperty.BRIGHTNESS]: NikoRange }];
}

export interface ThermoMqttDevice extends NikoMqttDevice {
  Type: NikoType.MULTISENSOR;
  Model:
    | NikoModel.THERMO_X1
    | NikoModel.THERMO_X1_FEEDBACK
    | NikoModel.THERMO_X2_FEEDBACK
    | NikoModel.THERMO_X4_FEEDBACK
    | NikoModel.THERMO_X6_FEEDBACK
    | NikoModel.THERMO_VENTILATION_FEEDBACK;
  Properties: [
    { [NikoProperty.AMBIENT_TEMPERATURE]: NikoTemperature },
    { [NikoProperty.HUMIDITY]: NikoHumidity },
  ];
}

export interface ThermostatMqttDevice extends NikoMqttDevice {
  Type: NikoType.HVAC;
  Technology: NikoTechnology.NIKO_HOME_CONTROL;
  Model: NikoModel.THERMOSTAT | NikoModel.TOUCH_SWITCH;
  Properties: [
    { [NikoProperty.PROGRAM]: NikoProgram },
    { [NikoProperty.AMBIENT_TEMPERATURE]: NikoThermostatTemperature }, // Range(-5, 45, 0.5)
    { [NikoProperty.SETPOINT_TEMPERATURE]: NikoSetpoint }, // Range(5, 30, 0.5)
    { [NikoProperty.OVERRULE_ACTIVE]: NikoBoolean },
    { [NikoProperty.OVERRULE_SETPOINT]: NikoSetpoint }, // Range(5, 30, 0.5)
    { [NikoProperty.OVERRULE_TIME]: NikoOverruleTime }, // Range(1, 1439, 1)
    { [NikoProperty.ECO_SAVE]: NikoBoolean },
    { [NikoProperty.DEMAND]: NikoDemand },
  ];
}

/**
 * The home's energy totals, fed by the central meter (e.g. a P1 stick or a clamp meter). Power is
 * only reported while ReportInstantUsage is True, which Niko resets after 30 s. Energy counters
 * are not reported over MQTT (HasStatus false), only through the REST measurements API.
 */
export interface EnergyHomeMqttDevice extends NikoMqttDevice {
  Type: NikoType.ENERGY_HOME;
  Model: NikoModel.GENERIC;
  Properties: [
    { [NikoProperty.ELECTRICAL_POWER_FROM_GRID]: NikoWatt | NikoUnreported },
    { [NikoProperty.ELECTRICAL_POWER_TO_GRID]: NikoWatt | NikoUnreported },
    { [NikoProperty.REPORT_INSTANT_USAGE]: NikoBoolean | NikoUnreported },
    { [NikoProperty.ELECTRICAL_MONTHLY_PEAK_POWER_FROM_GRID]: NikoWatt | NikoUnreported },
  ];
}
