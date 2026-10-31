/* global process, console, setTimeout */
// Dump of a Niko installation via the Hobby API. Read-only by default: only sends `devices.list`.
// Credentials come from .env (see .env.example).
//
//   npm run niko:dump -- [--type <type>] [--model <model>] [--name <text>] [--watch <seconds>] [--sanitize]
//
// --watch    keep listening and print status updates of the matching devices
// --sanitize replace names, UUIDs, identifiers and locations, so the output can be shared or used
//            as a fixture
// --report-instant-usage  the only write: sets ReportInstantUsage=True on the matching devices that
//            allow it (energy live power). It only changes reporting; Niko resets it after 30 s.
import { connect } from 'mqtt';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    type: { type: 'string' },
    model: { type: 'string' },
    name: { type: 'string' },
    watch: { type: 'string', default: '0' },
    sanitize: { type: 'boolean', default: false },
    'report-instant-usage': { type: 'boolean', default: false },
  },
});

const canControl = (device, property) =>
  (device.PropertyDefinitions ?? []).some(
    (definition) => definition[property]?.CanControl === 'true',
  );

const { NIKO_HOST, NIKO_PORT = '8884', NIKO_USERNAME = 'hobby', NIKO_JWT } = process.env;
if (!NIKO_HOST || !NIKO_JWT) {
  console.error('Set NIKO_HOST and NIKO_JWT in .env (see .env.example).');
  process.exit(1);
}

const matches = (device) =>
  (!args.type || device.Type === args.type) &&
  (!args.model || device.Model === args.model) &&
  (!args.name || device.Name?.toLowerCase().includes(args.name.toLowerCase()));

const aliases = new Map();
const alias = (uuid) => {
  if (!aliases.has(uuid)) aliases.set(uuid, `device-${aliases.size + 1}`);
  return aliases.get(uuid);
};

const sanitize = (device) => {
  if (!args.sanitize) return device;
  const copy = { ...device, Uuid: alias(device.Uuid) };
  if ('Identifier' in copy) copy.Identifier = '<identifier>';
  if ('Name' in copy) copy.Name = `${copy.Type} ${copy.Model}`;
  if (Array.isArray(copy.Parameters)) {
    copy.Parameters = copy.Parameters.map((parameter) =>
      Object.fromEntries(
        Object.entries(parameter).map(([key, value]) => [
          key,
          /^Location/.test(key) ? `<${key}>` : value,
        ]),
      ),
    );
  }
  return copy;
};

const watchedUuids = new Set();
const client = connect(`mqtts://${NIKO_HOST}:${NIKO_PORT}`, {
  username: NIKO_USERNAME,
  password: NIKO_JWT,
  rejectUnauthorized: false,
  reconnectPeriod: 0,
  connectTimeout: 10_000,
});

client.on('error', (error) => {
  console.error(`MQTT error: ${error.message}`);
  process.exit(1);
});

client.on('connect', () => {
  client.subscribe(['hobby/control/devices/rsp', 'hobby/control/devices/evt']);
  client.publish('hobby/control/devices/cmd', JSON.stringify({ Method: 'devices.list' }));
});

client.on('message', (topic, message) => {
  const payload = JSON.parse(message.toString());
  const devices = payload.Params?.[0]?.Devices ?? [];

  if (topic.endsWith('/rsp') && payload.Method === 'devices.list') {
    const selected = devices.filter(matches);
    selected.forEach((device) => watchedUuids.add(device.Uuid));
    console.log(JSON.stringify(selected.map(sanitize), null, 2));
    if (args['report-instant-usage']) {
      const targets = selected.filter((device) => canControl(device, 'ReportInstantUsage'));
      client.publish(
        'hobby/control/devices/cmd',
        JSON.stringify({
          Method: 'devices.control',
          Params: [
            {
              Devices: targets.map((device) => ({
                Uuid: device.Uuid,
                Properties: [{ ReportInstantUsage: 'True' }],
              })),
            },
          ],
        }),
      );
      console.error(
        `${new Date().toISOString()} ReportInstantUsage=True sent to ${targets.length} device(s)`,
      );
    }
    const watchSeconds = Number(args.watch);
    if (!watchSeconds) return client.end();
    console.error(`Watching ${selected.length} device(s) for ${watchSeconds}s...`);
    setTimeout(() => client.end(), watchSeconds * 1000);
    return;
  }

  if (topic.endsWith('/evt') && payload.Method === 'devices.status') {
    for (const update of devices) {
      if (!watchedUuids.has(update.Uuid)) continue;
      const uuid = args.sanitize ? alias(update.Uuid) : update.Uuid;
      console.log(`${new Date().toISOString()} ${uuid} ${JSON.stringify(update.Properties)}`);
    }
  }
});
