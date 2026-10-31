# Contributing

## Prerequisites

- Node.js 22 (same as CI)
- Homey CLI: `npm i -g homey`, then `homey login`
- A Homey Pro and a Niko installation with a Hobby API token, for running the app

## Development loop

```sh
npm ci
homey app run                        # runs the app on your Homey, logs in the terminal
npm run lint:fix
npx tsc --noEmit
homey app validate --level verified  # same check as CI
```

Architecture, data flow and rules: see [AGENTS.md](AGENTS.md).

## Adding a Niko device type

1. Look up the model and its properties in the Hobby API documentation.
2. In `src/niko/NikoTypes.ts`: add the model/properties to `NikoModel`/`NikoProperty` and a typed
   `XxxMqttDevice` interface.
3. Add `drivers/<id>/`:
   - `driver.compose.json` and assets (`icon.svg`, `images/{small,large,xlarge}.png`)
   - `driver.ts`: extends `NikoDriver`, lists the supported models
   - `device.ts`: extends `NikoDevice<XxxMqttDevice>`, implements `updateStatus()` and ends
     `onInit()` with `syncWithController()`
4. Run `homey app validate` and commit the regenerated `app.json`.

## Compatibility

- Driver IDs and folder names are permanent: paired devices are bound to them.
- The device store must stay readable by new versions (see AGENTS.md).
- Expected states such as an offline controller mark devices unavailable; never throw for them.

## Pull requests

- `npm run lint:check` and `homey app validate` pass (CI runs both).
- Tested with `homey app run` on a real installation; mention which devices.
- No tokens or installation data (names, UUIDs) in code, logs or screenshots.

## Releasing (maintainer)

Run the **Update and Publish Homey App** workflow with the version bump and changelog. It commits
the version, tags, creates a GitHub release and publishes to Homey. Finish the submission via the
link in the job summary.
