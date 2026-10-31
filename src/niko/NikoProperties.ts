import { NikoMqttDevice } from './NikoTypes';

type KeysOfUnion<T> = T extends T ? keyof T : never;
type ValueOfKeyInUnion<T, K extends PropertyKey> = T extends Record<K, infer V> ? V : never;
type PropertyOf<K extends NikoMqttDevice> = K['Properties'][number];

/**
 * In-memory view of a device's `Properties`, keyed by property name and typed from the device
 * definitions in `NikoTypes`.
 *
 * Never persist or emit this shape. The device store and the events keep the Niko wire format
 * (`NikoMqttDevice`), so devices paired with older app versions keep working.
 */
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

/**
 * Applies changed properties from a `devices.status` event to the current properties. Existing
 * properties keep their position, new ones are appended, matching the wire format.
 */
export function mergeProperties<K extends NikoMqttDevice>(
  current: K['Properties'] | undefined,
  changes: NikoMqttDevice['Properties'] | undefined,
): K['Properties'] {
  const merged = { ...toPropertyRecord<K>(current), ...toPropertyRecord(changes) };
  return Object.entries(merged).map(([key, value]) => ({ [key]: value })) as K['Properties'];
}
