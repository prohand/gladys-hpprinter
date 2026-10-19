# HP Printer for Gladys Assistant

[English](./en.md) · [Français](./fr.md) · [Deutsch](./de.md) · [Español](./es.md)

Follow your HP printers from Gladys: ink or toner levels, state, alerts (out of
paper, paper jam, door open…) and the number of pages printed. Get warned by a
scene when a cartridge runs low, and print a text from a scene.

Everything happens on your local network: no HP account, no cloud, nothing to
install next to Gladys.

## Contents

- [What you need](#what-you-need)
- [Installation](#installation)
- [Configuration](#configuration)
- [Devices](#devices)
- [Scenes](#scenes)
- [Dashboard widgets](#dashboard-widgets)
- [Configuration screen buttons](#configuration-screen-buttons)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)

## What you need

- Gladys Assistant **5.1 or later**.
- An HP printer connected to the network (Wi-Fi or Ethernet), on the same
  network as Gladys.
- **IPP** turned on in the printer. It is on by default on almost every HP
  printer (it is what AirPrint and Mopria use). If needed: open the printer's
  web page (type its IP address in a browser) → _Network_ → _Advanced_ →
  _IPP_ / _AirPrint_.

The integration reads the printer on port **631** (IPP), and on port **80** for
the page counter.

## Installation

1. In Gladys: **Integrations** → search **HP Printer** → **Install**.
2. Open the integration's **Configuration** screen. The printers of your
   network are found automatically. If one is missing, type its IP address in
   **Printer addresses**, then save.
3. Open the **Discovery** tab and add your printers.

Tip: give your printers a fixed IP address (a DHCP reservation in your router).
The integration follows a printer that changed address when automatic discovery
is on, but a fixed address is always more reliable.

## Configuration

| Field                          | Default | What it does                                                                                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Printer addresses              | empty   | IP addresses or host names, separated by commas. `ipp://192.168.1.20/ipp/print` also works. Only needed when a printer is not found. |
| Find HP printers automatically | on      | Searches the network for HP printers (mDNS, like a computer does).                                                                   |
| Refresh interval (s)           | 300     | How often each printer is read. 60 to 3600 seconds.                                                                                  |
| Low level threshold (%)        | 15      | A cartridge at or under this level fires the **Ink or toner low** trigger.                                                           |
| Language of the device states  | English | Language of the _State_ and _Alerts_ texts, and of the feature names of new devices.                                                 |
| Detailed logs                  | off     | Writes what each printer answers in the integration logs. Turn it off once the problem is found.                                     |

Not supported: `ipps://` / `https://` addresses (encrypted IPP). The printer's
certificate is self-signed, and trusting it blindly would give a false sense of
security: use the plain `ipp://` address on your local network.

## Devices

Each printer is one Gladys device:

| Feature                     | Type    | Values                                                                                                                                                 |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| State                       | text    | Ready, Printing, Stopped, Offline                                                                                                                      |
| Alerts                      | text    | No alert, or the list of problems: Out of paper, Paper jam, Door open, Cartridge empty or missing, Output tray full, Paper tray missing, Printer error |
| Ink / Toner (one per color) | %       | 0 to 100                                                                                                                                               |
| Pages printed               | counter | total number of pages, when the printer gives it                                                                                                       |

The device card also shows a **local** badge (the printer answers) or
**unreachable** (it does not answer: switched off, in deep sleep, unplugged).

When the printer does not answer, the state becomes **Offline** and the last
known levels stay.

Some printers do not give a level for every cartridge (some only say "there is
some ink left"): that cartridge then shows no value.

## Scenes

### Triggers

| Trigger                 | When                                                      | Filters                                         | Variables                  |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------- | -------------------------- |
| **Ink or toner low**    | a cartridge goes under the threshold of the configuration | printer, colour (black, cyan, magenta, yellow…) | `supply`, `color`, `level` |
| **Printer problem**     | a new problem appears                                     | printer, problem                                | `problem`, `label`         |
| **Printer unreachable** | the printer stops answering                               | printer                                         | `name`                     |

Each trigger fires **once**, when the change happens: a cartridge that stays at
10 % does not fire again at every read. It fires again after the cartridge was
replaced and runs low again.

Values of `problem`: `paper_out`, `paper_jam`, `door_open`, `supply_problem`,
`output_full`, `tray_missing`, `other`. `label` is the same problem written in
the configured language.

Example: _"When the black ink of the office printer goes low, send me a
message: `{{triggerEvent.data.supply}} ink at {{triggerEvent.data.level}} %`."_

### Actions

| Action             | Fields                          | Results                                                                                            |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Read a printer** | printer                         | `reachable`, `state` (`idle`, `printing`, `stopped`, `offline`), `alerts`, `lowest_level`, `pages` |
| **Print a text**   | printer, title (optional), text | `printed` (true / false), `job_id`                                                                 |

`lowest_level` and `pages` are `-1` when the printer does not give them.

**Print a text** builds a one-to-twenty-page A4 PDF and sends it to the printer.
The text can use scene variables, for example a shopping list. If the printer
does not answer or refuses the document, `printed` is `false` and the scene
goes on: use a condition on it to send a message instead.

## Dashboard widgets

- **HP printer**: one printer. A gauge per cartridge (green, orange under the
  threshold, red under 5 %), the page counter, the state, the alerts and the
  address. Buttons **Refresh** and **Test page** (with confirmation). Pick the
  printer in the widget settings.
- **HP printers**: every printer on one line, with its state (or its problem)
  and its lowest level.

## Configuration screen buttons

- **Test the printers**: reads every printer now and shows which ones answer,
  their state and lowest level, and the addresses that did not answer (with the
  reason, for example `ECONNREFUSED` or `TIMEOUT`).
- **Search for printers**: searches the network for HP printers and lists them.
- **Print a test page**: prints one page on the chosen printer.

## Troubleshooting

**My printer is not found.**

- Check that the printer and Gladys are on the same network. Automatic
  discovery does not cross VLANs or guest Wi-Fi networks.
- Type the printer's IP address in **Printer addresses** (you can read it on
  the printer's screen or on its network configuration page).
- Click **Test the printers**: an address that does not answer is shown with
  the reason. `ECONNREFUSED`: IPP is turned off on the printer. `TIMEOUT` or
  `EHOSTUNREACH`: wrong address, or the printer is off.

**No ink level.** The printer says it does not know the level (third-party or
refilled cartridges often do this). Nothing to fix on the Gladys side.

**No "Pages printed".** The page counter is read on the printer's web page
(port 80). Some printers only serve it over HTTPS, or not at all: the feature
then does not appear.

**The printer often shows "Offline".** A printer in deep sleep may stop
answering on the network. Check its energy settings (sleep / auto off).

**"Print a text" does nothing.** The printer must accept PDF documents over
the network: most recent HP printers do. The **Print a test page** button gives
the reason when it fails.

**Detailed logs.** Turn on **Detailed logs**, wait for a read (or click **Test
the printers**), then open the integration logs in Gladys. Turn it off again
afterwards.

## Privacy

- The integration only talks to your printers, on your local network.
- Nothing is sent to HP or to any other online service.
- The last known values are kept in the integration's own storage (`/data`), so
  a printer switched off when Gladys restarts is still listed.
