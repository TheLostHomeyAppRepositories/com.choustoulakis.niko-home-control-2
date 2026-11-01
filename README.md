# Niko Home Control II for Homey

Control your Niko Home Control II installation from Homey: lights, dimmers, sockets, shutters, ventilation,
routines and comfort sensors. Everything runs locally between Homey and your Connected Controller,
using Niko's official [Hobby API](https://www.niko.eu/en/our-products/home-automation/hobby-api).

**[Install from the Homey App Store](https://homey.app/a/com.choustoulakis.niko-home-control-2/)**

## What you need

- A **Homey Pro** on the same network as your Niko installation
- A **Niko Home Control II Connected Controller**, registered, with internet access
- The **Niko Home Control programming software** 2.17 or newer, and your Niko account
- A **Hobby API token** (see below), free, valid for one year

## 1. Get your Hobby API token

1. Open the Niko Home Control programming software and connect to your installation.
2. Go to **Dashboard → Manage connected services**.
3. Under **Additional steps required**, open **Hobby API** and click **Manage**.
4. Log in with your Niko account if asked, and **Accept** the terms.
5. Click **Copy** to copy the token, then **Done**.

The username is always `hobby`. The controller must be online the first time the token is used. See
Niko's [FAQ](https://www.niko.eu/en/need-help/faq/niko-home-control-api/how-do-i-get-access-to-the-hobby-api)
and [guide](https://guide.niko.eu/en/connhc2/lv/hobby-api) for details.

## 2. Add it to Homey

1. Install the app and add a **Connected Controller**. Pick your controller from the list of
   controllers found on your network, or choose **Add it manually** and enter its IP address.
2. Paste the token. The connection is tested right away and shows how many Niko devices were found
   and how long the token stays valid. Then choose **Add controller**.
3. Add your Niko devices through their driver (Switching Module, Universal Dimmer, ...).

## Supported devices

| Homey device                  | Niko models                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Connected Controller          | The gateway, add this first                                                               |
| Switching Module              | `light`, `socket`, `switched-fan`, `switched-generic`                                     |
| Universal Dimmer              | `dimmer`                                                                                  |
| Motor Module                  | `rolldownshutter`, `sunblind`, `gate`, `venetianblind`                                    |
| Ventilation Module            | `fan`                                                                                     |
| Routine: All off              | `alloff`                                                                                  |
| Routine: Mood                 | `comfort`                                                                                 |
| Comfort sensor (1/2/4/6 keys) | `thermoswitchx1`, `thermoswitchx{1,2,4,6}feedback`, `thermoventilationcontrollerfeedback` |
| Home energy                   | `energyhome` (central meter, e.g. P1): live power and monthly peak, shown in Homey Energy |
| Thermostat                    | Wall thermostat, touch switch, Digital Black, virtual and HVAC thermostats                |
| Virtual flag                  | `flag`                                                                                    |

## Renewing the token

The token expires after one year. The Connected Controller shows the remaining days and adds a
timeline notification 30, 7 and 1 days before it expires (turn on push for timeline notifications in
Homey to get them on your phone). For your own Flows, use **The token expires within N days**
(runs once a day) and the matching condition. Renew the token in the
programming software (at the earliest one month before it expires) and paste the new token in the
controller's settings. See Niko's
[renewal FAQ](https://www.niko.eu/en/need-help/faq/niko-home-control-api/where-can-i-renew-the-hobby-api-token).

## Troubleshooting

- **Controller unavailable:** the reason is shown on the device. Check the token, its expiry, and
  that Homey and the controller are on the same network.
- **Connection test fails while adding:** the message tells why (token rejected, expired, or no
  controller at that IP address). If the controller is just offline, you can still add it and fix
  the settings later.
- **A device is unavailable:** check that it still exists in the Niko programming software.
- **Need help?** Copy the controller's **Settings → Debugging information** (the token is redacted)
  into the [community topic](https://community.homey.app/t/app-pro-niko-home-control-2/146467) or an
  [issue](https://github.com/georgechoustoulakis/homey-niko-home-control-2/issues).

## Contributing

Developers: see [CONTRIBUTING.md](CONTRIBUTING.md). This app is not affiliated with Niko.
