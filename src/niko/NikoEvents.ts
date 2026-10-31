import type Homey from 'homey/lib/Homey';
import type { NikoDeviceWithOwner } from './NikoMqttClient';

// Emitter and listeners ship in the same build and process, so payloads need no versioning.
// Only the device store must stay backwards compatible: it survives app updates.
type EventBus = Pick<Homey, 'emit' | 'on' | 'removeListener'>;
type Unsubscribe = () => void;

const controllerChangedEvent = (controllerId: string) => `niko-controller-changed:${controllerId}`;

function subscribe(bus: EventBus, event: string, listener: (...args: any[]) => void): Unsubscribe {
  bus.on(event, listener);
  return () => bus.removeListener(event, listener);
}

export function emitDeviceUpdate(bus: Pick<Homey, 'emit'>, update: NikoDeviceWithOwner): void {
  bus.emit(update.device.Uuid, update);
}

export function onDeviceUpdate(
  bus: EventBus,
  uuid: string,
  listener: (update: NikoDeviceWithOwner) => void,
): Unsubscribe {
  return subscribe(bus, uuid, listener);
}

export function emitControllerChanged(bus: Pick<Homey, 'emit'>, controllerId: string): void {
  bus.emit(controllerChangedEvent(controllerId));
}

export function onControllerChanged(
  bus: EventBus,
  controllerId: string,
  listener: () => void,
): Unsubscribe {
  return subscribe(bus, controllerChangedEvent(controllerId), listener);
}
