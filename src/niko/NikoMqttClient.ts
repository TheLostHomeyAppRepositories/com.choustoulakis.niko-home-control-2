import { connect, IClientOptions, MqttClient } from 'mqtt';
import { EventEmitter } from 'events';
import type Homey from 'homey/lib/Homey';
import { NikoMqttDevice, NikoModel, NikoType } from './NikoTypes';
import { mergeProperties } from './NikoProperties';
import { emitDeviceUpdate } from './NikoEvents';

export interface NikoConnectionSettings {
  ip: string;
  port: number;
  username: string;
  jwt: string;
}

/**
 * The parts of the Homey instance the client uses, so it can run without the Homey runtime.
 */
export type NikoClientHost = Pick<Homey, 'setTimeout' | 'setInterval' | 'emit'>;

export interface NikoDeviceWithOwner {
  device: NikoMqttDevice;
  connectedControllerId: string;
}

const DEBUG_MQTT = false;

type DeviceListUpdate = {
  Method: 'devices.control';
  Params: [
    {
      Devices: Pick<NikoMqttDevice, 'Uuid' | 'Properties'>[];
    },
  ];
};

export enum TOPIC {
  CMD = 'hobby/control/devices/cmd',
  EVT = 'hobby/control/devices/evt',
  RSP = 'hobby/control/devices/rsp',
}

export enum NikoClientState {
  UNINITIALIZED = 'UNINITIALIZED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTING = 'DISCONNECTING',
  ERROR = 'ERROR',
}

type QueuedUpdate = { uuid: string; props: NikoMqttDevice['Properties'] };
const UPDATE_QUEUE_DELAY_MS = 50;

// CONNACK reason codes: 4/5 for MQTT 3.1.1, 134/135 for MQTT 5.
const AUTHORIZATION_REASON_CODES = [4, 5, 134, 135];

function isAuthorizationError(err: Error): boolean {
  const code = (err as Error & { code?: unknown }).code;
  return typeof code === 'number' && AUTHORIZATION_REASON_CODES.includes(code);
}

export class NikoMqttClient extends EventEmitter {
  readonly settings: NikoConnectionSettings;
  private readonly homey: NikoClientHost;
  private readonly connectedControllerId: string;

  private client: MqttClient | null = null;
  private _state: NikoClientState = NikoClientState.UNINITIALIZED;
  private _lastErrorMessage: string | undefined = undefined;
  private _authorizationFailed = false;
  private _updateInterval: NodeJS.Timeout | undefined = undefined;

  private queuedUpdates: QueuedUpdate[] = [];
  private batchTimeout: NodeJS.Timeout | undefined = undefined;

  private devices: NikoMqttDevice[] = [];

  constructor(config: {
    settings: NikoConnectionSettings;
    homey: NikoClientHost;
    connectedControllerId: string;
  }) {
    super();
    const { settings, homey, connectedControllerId } = config;
    this.homey = homey;
    this.connectedControllerId = connectedControllerId;
    this.settings = settings;
  }

  getState(): NikoClientState {
    return this.state;
  }

  getLastErrorMessage(): string | undefined {
    return this._lastErrorMessage;
  }

  /**
   * After an authorization error the MQTT client is ended and does not retry by itself. Other
   * errors are retried automatically by mqtt.js (see `reconnectPeriod`).
   */
  isAuthorizationFailed(): boolean {
    return this._authorizationFailed;
  }

  getDevices(): NikoMqttDevice[] {
    return this.devices;
  }

  private setState(newState: NikoClientState, message?: string) {
    if (newState === NikoClientState.ERROR) {
      this._lastErrorMessage = message;
    } else if (newState === NikoClientState.CONNECTED) {
      this._lastErrorMessage = undefined;
    }
    if (this._state === newState) return;
    this._state = newState;
    this.emit('statechange', this._state, message);
  }

  get state(): NikoClientState {
    return this._state;
  }

  public connect(): void {
    if (this._state === NikoClientState.CONNECTING || this._state === NikoClientState.CONNECTED) {
      return;
    }
    this.setState(NikoClientState.CONNECTING);

    const options: IClientOptions = {
      username: this.settings.username,
      password: this.settings.jwt,
      rejectUnauthorized: false,
      reconnectPeriod: 10000,
      connectTimeout: 10000,
      protocol: 'mqtts',
    };

    this.client = connect(`mqtts://${this.settings.ip}:${this.settings.port}`, options);
    this.client.on('connect', this.onConnect);
    this.client.on('error', this.onError);
    this.client.on('close', this.onClose);
    this.client.on('message', this.handleMessage);
  }

  private onConnect = (): void => {
    this.subscribeTopics();
    this.requestDeviceList();
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
    }
    this._updateInterval = this.homey.setInterval(this.requestDeviceList, 15 * 60_000);
  };

  private onError = (err: Error): void => {
    if (DEBUG_MQTT) {
      console.log('Niko MQTT Client Error:', err.message);
    }

    // Check for non-recoverable authorization errors
    if (isAuthorizationError(err)) {
      this._authorizationFailed = true;
      this.setState(
        NikoClientState.ERROR,
        "Authorization failed. Please check the token in the device's settings.",
      );
      this.client?.end(true);
    } else {
      // For other errors (e.g., timeout, network issues),
      // the client will attempt to reconnect automatically.
      this.setState(NikoClientState.ERROR, err.message);
    }
  };

  private onClose = (): void => {
    if (this.state !== NikoClientState.ERROR) {
      this.setState(NikoClientState.DISCONNECTED);
    }
  };

  private subscribeTopics(): void {
    if (!this.client) return;
    this.client.subscribe(TOPIC.EVT);
    this.client.subscribe(TOPIC.RSP);
  }

  private requestDeviceList = (): void => {
    if (!this.client || !this.client.connected) return;
    const payload = JSON.stringify({ Method: 'devices.list' });
    this.client.publish(TOPIC.CMD, payload);
  };

  public getNikoByTypeAndModel(type: NikoType, models: NikoModel[]): NikoMqttDevice[] {
    return this.devices.filter((device) => device.Type === type && models.includes(device.Model));
  }

  /**
   * Returns false when the command could not be queued because MQTT is offline.
   */
  public setDeviceProps(uuid: string, props: NikoMqttDevice['Properties']): boolean {
    if (!this.client || this.state !== NikoClientState.CONNECTED) {
      return false;
    }
    if (DEBUG_MQTT) {
      console.log(`Queueing device ${uuid} properties update:`, props);
    }
    this.queuedUpdates.push({ uuid, props });
    this.sendBatchedUpdate();
    return true;
  }

  private sendBatchedUpdate = (): void => {
    if (!this.client || this.state !== NikoClientState.CONNECTED) {
      this.queuedUpdates = [];
      return;
    }

    if (this.batchTimeout) {
      return;
    }

    if (this.queuedUpdates.length === 0) {
      return;
    }
    this.batchTimeout = this.homey.setTimeout(() => {
      const payload: DeviceListUpdate = {
        Method: 'devices.control',
        Params: [
          {
            Devices: [],
          },
        ],
      };

      for (const update of this.queuedUpdates) {
        payload.Params[0].Devices.push({
          Uuid: update.uuid,
          Properties: update.props,
        });
      }
      this.queuedUpdates = [];

      if (DEBUG_MQTT) {
        console.log(`Sending batched ${payload.Params[0].Devices.length} device updates`);
      }

      this.client?.publish(TOPIC.CMD, JSON.stringify(payload));
      this.batchTimeout = undefined;
      this.sendBatchedUpdate();
    }, UPDATE_QUEUE_DELAY_MS);
  };

  private handleMessage = (topic: string, message: Buffer): void => {
    try {
      const payload = JSON.parse(message.toString());

      if (topic === TOPIC.RSP && payload.Method === 'devices.list') {
        const receivedDevices: NikoMqttDevice[] = payload.Params?.[0]?.Devices || [];
        this.devices.length = 0;
        this.devices.push(...receivedDevices);
        if (DEBUG_MQTT) {
          console.log(`Niko MQTT client found ${this.devices.length} devices.`);
        }
        if (this.state !== NikoClientState.CONNECTED) {
          this.setState(NikoClientState.CONNECTED);
        }
        for (const device of this.devices) {
          if (DEBUG_MQTT) {
            console.log(
              `Device loaded: ${device.Name} (${device.Uuid}), ${device.Type}, ${device.Model}, Properties:`,
              device.Properties,
            );
          }
          this.sendUpdate(device);
        }
        this.emit('devicelist');
      }

      // TODO: improve types so casting is not needed
      if (topic === TOPIC.EVT && payload.Method === 'devices.status') {
        const updates: NikoMqttDevice[] = payload.Params?.[0]?.Devices || [];

        updates.forEach((update: NikoMqttDevice) => {
          const uuid = update.Uuid;
          const changedProps = update.Properties;
          if (DEBUG_MQTT) {
            console.log(`Device ${uuid} properties update:`, changedProps);
          }
          const device = this.devices.find((d) => d.Uuid === uuid);
          if (!device) {
            if (DEBUG_MQTT) {
              console.warn(`Warning: Received update for unknown device UUID: ${uuid}`);
            }
            return;
          }

          device.Properties = mergeProperties(device.Properties, changedProps);
          this.sendUpdate(device);
        });
      }
    } catch (error) {
      console.error('Error parsing MQTT message:', error);
    }
  };

  private sendUpdate(device: NikoMqttDevice): void {
    if (
      !device.Uuid ||
      // if type or model is not in our enums, skip it
      !Object.values(NikoType).includes(device.Type) ||
      !Object.values(NikoModel).includes(device.Model)
    ) {
      if (DEBUG_MQTT) {
        console.log(
          `Skipping unsupported device ${device.Name} (${device.Uuid}), ${device.Type}, ${device.Model}`,
        );
      }
      return;
    }
    if (DEBUG_MQTT) {
      console.log(`Emitting device update for ${device.Name} (${device.Uuid})`);
    }
    emitDeviceUpdate(this.homey, { device, connectedControllerId: this.connectedControllerId });
  }

  public disconnect(): void {
    if (this.client) {
      this.setState(NikoClientState.DISCONNECTING);
      this.client.end(true);
    }
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = undefined;
    }
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = undefined;
    }
    this.queuedUpdates = [];
  }
}
