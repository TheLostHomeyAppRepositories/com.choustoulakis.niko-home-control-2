import type Homey from 'homey/lib/Homey';
import type { NikoDeviceWithOwner } from './NikoMqttClient';

/**
 * In-process events between the Connected Controller and the Niko devices, sent over the Homey
 * instance. Emitter and listeners always ship in the same app build and run in the same process,
 * so payloads can change without versioning. Only the device store has to stay backwards
 * compatible, because it survives app updates.
 */
type EventBus = Pick<Homey, 'emit' | 'on' | 'removeListener'>;
type Unsubscribe = () => void;

const controllerChangedEvent = (controllerId: string) => `niko-controller-changed:${controllerId}`;

function subscribe(bus: EventBus, event: string, listener: (...args: any[]) => void): Unsubscribe {
  bus.on(event, listener);
  return () => bus.removeListener(event, listener);
}

/** A Niko device (status) update, keyed by the device UUID. */
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

/** The controller's connection or device list changed; devices should re-sync with it. */
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
