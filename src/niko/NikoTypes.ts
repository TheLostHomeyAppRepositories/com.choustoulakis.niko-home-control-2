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
}

export enum NikoType {
  ACTION = 'action',
  MULTISENSOR = 'multisensor',
  HVAC = 'hvac',
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
}

export enum NikoTechnology {
  NIKO_HOME_CONTROL = 'nikohomecontrol',
}

export type NikoAction = 'Open' | 'Close' | 'Stop';
export type NikoFanSpeed = 'Low' | 'Medium' | 'High' | 'Boost';
export type NikoBoolean = 'True' | 'False';
export type NikoOnOff = 'On' | 'Off';
export type NikoTriggerable = NikoOnOff | 'Triggered';
export type NikoProgram = 'Day' | 'Night' | 'Eco' | 'Off' | 'Prog1' | 'Prog2' | 'Prog3';
export type NikoDemand = 'Heating' | 'Cooling' | 'None';
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

export type NikoRange = `${Enumerate<101>}` & {}; // 0 -> 100
export type NikoTemperature = `-${Exclude<Enumerate<51>, 0>}` | NikoRange; // -50 -> 100

export interface NikoMqttDevice {
  Uuid: string;
  Name: string;
  Model: NikoModel;
  Technology: NikoTechnology;
  Type: NikoType;
  Properties: Partial<Record<NikoProperty, string>>[];
  PropertyDefinitions: Record<string, any>;
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
    { [NikoProperty.HUMIDITY]: NikoRange },
  ];
}

export interface ThermostatMqttDevice extends NikoMqttDevice {
  Type: NikoType.HVAC;
  Technology: NikoTechnology.NIKO_HOME_CONTROL;
  Model: NikoModel.THERMOSTAT | NikoModel.TOUCH_SWITCH;
  Properties: [
    { [NikoProperty.PROGRAM]: NikoProgram },
    { [NikoProperty.AMBIENT_TEMPERATURE]: NikoRange }, // Range(-5, 45, 0.5)
    { [NikoProperty.SETPOINT_TEMPERATURE]: NikoRange }, // Range(5, 30, 0.5)
    { [NikoProperty.OVERRULE_ACTIVE]: NikoBoolean },
    { [NikoProperty.OVERRULE_SETPOINT]: NikoRange }, // Range(5, 30, 0.5)
    { [NikoProperty.OVERRULE_TIME]: NikoRange }, // Range(1, 1439, 1)
    { [NikoProperty.ECO_SAVE]: NikoBoolean },
    { [NikoProperty.DEMAND]: NikoDemand },
  ];
}
