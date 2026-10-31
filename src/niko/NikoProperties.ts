import { NikoMqttDevice, NikoProperty, NikoPropertyDefinition } from './NikoTypes';

type KeysOfUnion<T> = T extends T ? keyof T : never;
type ValueOfKeyInUnion<T, K extends PropertyKey> = T extends Record<K, infer V> ? V : never;
type PropertyOf<K extends NikoMqttDevice> = K['Properties'][number];

// Never persist or emit this shape: the store and events keep the Niko wire format, so devices
// paired with older app versions keep working.
export type NikoPropertyRecord<K extends NikoMqttDevice> = {
  [P in KeysOfUnion<PropertyOf<K>>]?: ValueOfKeyInUnion<PropertyOf<K>, P>;
};

export function toPropertyRecord<K extends NikoMqttDevice>(
  properties: K['Properties'] | undefined,
): NikoPropertyRecord<K> {
  if (!Array.isArray(properties)) {
    return {};
  }
  return Object.assign({}, ...properties);
}

export function mergeProperties<K extends NikoMqttDevice>(
  current: K['Properties'] | undefined,
  changes: NikoMqttDevice['Properties'] | undefined,
): K['Properties'] {
  const merged = { ...toPropertyRecord<K>(current), ...toPropertyRecord(changes) };
  return Object.entries(merged).map(([key, value]) => ({ [key]: value })) as K['Properties'];
}

export function getPropertyDefinition(
  device: NikoMqttDevice,
  property: NikoProperty,
): NikoPropertyDefinition | undefined {
  const definitions = Array.isArray(device.PropertyDefinitions) ? device.PropertyDefinitions : [];
  return definitions.find((definition) => property in definition)?.[property];
}

export function canControl(device: NikoMqttDevice, property: NikoProperty): boolean {
  return getPropertyDefinition(device, property)?.CanControl === 'true';
}

// e.g. "Range(5.00,30.00,0.50)"
export function parseRange(
  definition: NikoPropertyDefinition | undefined,
): { min: number; max: number; step: number } | undefined {
  const match = definition?.Description.match(/^Range\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/);
  if (!match) return undefined;
  const [min, max, step] = match.slice(1).map(Number);
  return [min, max, step].every(Number.isFinite) ? { min, max, step } : undefined;
}

// e.g. "Choice(Day,Night,Eco)"
export function parseChoice(definition: NikoPropertyDefinition | undefined): string[] {
  const match = definition?.Description.match(/^Choice\((.*)\)$/);
  return match ? match[1].split(',').map((choice) => choice.trim()) : [];
}
