# Niko Home Control II for Homey

Control a Niko Home Control II installation from Homey, locally through the
[Niko Hobby API](https://www.niko.eu/en/our-products/home-automation/hobby-api).

## Supported devices

| Homey driver                  | Niko models                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Connected Controller          | Connected Controller (the gateway, add this first)                                        |
| Switching Module              | `light`, `socket`, `switched-fan`, `switched-generic`                                     |
| Universal Dimmer              | `dimmer`                                                                                  |
| Motor Module                  | `rolldownshutter`, `sunblind`, `gate`, `venetianblind`                                    |
| Ventilation Module            | `fan`                                                                                     |
| Routine: All off              | `alloff`                                                                                  |
| Routine: Mood                 | `comfort`                                                                                 |
| Comfort sensor (1/2/4/6 keys) | `thermoswitchx1`, `thermoswitchx{1,2,4,6}feedback`, `thermoventilationcontrollerfeedback` |

## Setup

1. Activate the Hobby API in the Niko programming software and generate a token (JWT, valid one year).
2. In Homey, add a **Connected Controller** (found via mDNS, or enter the IP manually) and paste the
   token in its settings.
3. Add your Niko devices.

The token's remaining days are shown on the Connected Controller. For support, copy
**Settings → Debugging information** (the token is redacted) into an issue.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `README.txt` is the App Store description.
