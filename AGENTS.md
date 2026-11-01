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
  `Status` True/False switches a flag directly (verified, also without any action). The Niko app only
  shows flags through actions; the Homey driver deliberately exposes the flag itself.
- Energy Home: power is only reported while `ReportInstantUsage` is True (Niko resets it after
  30 s; the device re-requests it). Energy counters have `HasStatus: false`: not on MQTT, only via
  the REST measurements API as quarter-hour values.
- Real installations: reading (`devices.list`, subscriptions) is fine. `devices.control` moves real
  motors and gates: only with the owner's explicit consent.
- Custom pair views (`drivers/*/pair/*.html`): Homey renders all views of a pair session in one
  document. Prefix element IDs per view, scope CSS under the view's root ID and wrap scripts in a
  function. Use the Homey style library classes (`homey-form-*`, `homey-button-*`, `is-loading`,
  `is-disabled`) and `--homey-*` CSS variables with fallbacks. Reveal a view only once its final
  content is in place, so nothing shifts. Port and username are fixed by Niko, so pairing only
  asks for IP and token.
- Repair views must live in `drivers/<id>/repair/`. The controller's repair reuses the connect view:
  `repair/connect.html` is a copy of `pair/connect.html` (edit the pair one, `npm run lint:fix` copies
  it, `lint:check` fails when they differ). No symlink: the build keeps it as a symlink.
- Driver icons (`drivers/<id>/assets/icon.svg`): start from the matching Niko icon of the Niko Home
  Control programming software, so icons look like the Niko app. Check it visually: some are
  mislabelled or contain text (e.g. "24V", "kWh"), which is unreadable at small sizes. Scale to
  960×960 (Homey store requirement), optimize with an SVG optimizer (e.g. SVGO) and replace Niko's
  near-black (`#1A1A1A`) with `#000`, like the existing icons.
- Driver images (`assets/images/{small,large,xlarge}.png`, 75/500/1000 px): a product photo on a white
  background; for devices without hardware (routines, flags) the Niko pictogram on white.
- Comments: names, variables and return types should make code self-explanatory. If a function
  needs a comment to explain what it does, rename it instead. Only comment the non-obvious why:
  edge cases, Niko quirks, constraints future sessions must know. Class docs are fine.
- Commits: short imperative subject, matching the existing history.
