# AGENTS.md

Homey app (SDK v3, TypeScript) for Niko Home Control II, using the local Niko Hobby API: MQTT over
TLS on port 8884, username `hobby`, a JWT as password.

## Commands

- `npm ci`
- `npm run lint:check` / `npm run lint:fix` (ESLint + Prettier)
- `npx tsc --noEmit`
- `npx homey app validate --level verified` (same check as CI)
- `npx homey login` opens a browser for the user. Then `npx homey app install` installs over the
  store version and keeps devices and Flows. Ask before installing on the user's Homey.
- Never `homey app run` on a Homey with real devices: quitting uninstalls the app and removes all
  paired devices and Flows.
- Inspect the real installation with `npm run niko:dump -- --type <type> --watch <s> --sanitize`
  (needs `.env`, see `.env.example`). Read-only unless `--report-instant-usage` is passed. Prefer
  real dumps over the spec: the spec misses properties and models. The Home Assistant integration
  (joleys/niko-home-control-II) is a good second reference.
- Verify read-only via the Web API, e.g. `npx homey api apps get-app --id <app id>`,
  `npx homey api devices get-devices --json` (write to a file: stdout truncates around 64 KB),
  `npx homey api flow run-flow-card-condition`.

There is no automated test suite yet.

## Layout

- `src/niko/`: Hobby API layer
  - `NikoMqttClient.ts`: MQTT client, no Homey runtime dependency
  - `NikoTypes.ts`: wire types, value ranges follow the Hobby API documentation
  - `NikoProperties.ts`: typed in-memory record of a device's `Properties`
  - `NikoEvents.ts`: in-process events between controller and devices
- `src/NikoDevice.ts`, `src/NikoDriver.ts`: base classes for all Niko devices
- `drivers/connected-controller/`: owns the MQTT connection, mDNS discovery, JWT expiry, debug report
- `drivers/<other>/`: one thin driver per Niko device kind
- `app.json` is generated from `.homeycompose/` and `*.compose.json`. Edit those, commit the
  regenerated `app.json` too.

## Data flow

1. Controller connects, receives `devices.list`, emits a device update per UUID and
   `niko-controller-changed:<controllerId>`.
2. Devices call `syncWithController()` on that event (and on init), `updateStatus()` on device updates.
3. Commands: device → controller → client, batched (50 ms) into one `devices.control`.

## Rules

- Never rename driver IDs or driver folders: paired devices are bound to them.
- The device store (`deviceWithOwner`, legacy `device`) survives app updates. Keep the wire format;
  a shape change needs a migration in `onInit()` that keeps the old key.
- Events are in-process and ship in the same build: no versioning needed.
- Expected conditions (controller offline, device removed) → `setUnavailable(reason)`, never throw.
  Throws reach users as error notifications and look like bugs. Throw only for real bugs.
- Async listeners and timers end with `.catch(this.error)`.
- Keep Niko value types strict and aligned with the Hobby API documentation.
- Languages: en, nl, fr, da, sv. Every user-facing string exists in all five: manifest strings in
  the compose files, runtime strings in `locales/*.json` via `this.homey.__()`, store text in
  `README.txt` + `README.<lang>.txt` (plain text, no URLs or Markdown). Niko product names follow
  Niko's localized guide (guide.niko.eu). The debug report stays English.
- Reconnects: mqtt.js retries network errors; the controller only recreates its client when there is
  none, the discovered IP changed, or authorization failed.
- Public repo: no tokens or real installation data (device names, UUIDs) in commits.
- Thermostats: one driver for all variants (`hvac/thermostat|touchswitch|virtual|hvacthermostat`,
  `thermostat/thermostat|virtual`). Variants report different properties and ranges than the spec
  (a real `hvac/virtual` has the HVAC set: OperationMode, FanSpeed, ThermostatOn, no Demand), so the
  device builds its capabilities, range and programs from `PropertyDefinitions`.
- Flags: installations report `virtual/flag`, the spec documents `action/flag`; the driver takes both.
- Energy Home: power is only reported while `ReportInstantUsage` is True (Niko resets it after
  30 s; the device re-requests it). Energy counters have `HasStatus: false`: not on MQTT, only via
  the REST measurements API as quarter-hour values.
- Real installations: reading (`devices.list`, subscriptions) is fine. `devices.control` moves real
  motors and gates: only with the owner's explicit consent.
- Commits: short imperative subject, matching the existing history.
