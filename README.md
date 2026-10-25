# HP Printer — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com)
to **HP printers** on the local network: ink and toner levels, state, alerts
(out of paper, paper jam, door open…) and pages printed, with scene triggers,
scene actions and two dashboard widgets. Requires Gladys 5.3.0 or later.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) ·
[Deutsch](./docs/de.md) · [Español](./docs/es.md).

## What it does

One Gladys device per printer:

| Feature       | Gladys category / type                  | Source                                                               |
| ------------- | --------------------------------------- | -------------------------------------------------------------------- |
| State         | `text` / `text`                         | IPP `printer-state`                                                  |
| Alerts        | `text` / `text`                         | IPP `printer-state-reasons`                                          |
| Ink / toner   | `level-sensor` / `liquid-level-percent` | IPP `marker-levels`, one per supply                                  |
| Pages printed | `counter-sensor` / `integer`            | IPP `printer-impressions-completed`, else HP LEDM `TotalImpressions` |

Plus, since Gladys 5.1:

| Capability     | Keys                                                       | Code                          |
| -------------- | ---------------------------------------------------------- | ----------------------------- |
| Scene triggers | `supply_low`, `printer_problem`, `printer_unreachable`     | `src/printer/fleet.js`        |
| Scene actions  | `refresh_printer`, `print_text`                            | `src/capabilities/scenes.js`  |
| Widgets        | `printer` (one printer), `printers_overview` (all of them) | `src/capabilities/widgets.js` |

And three buttons in the Configuration screen: **Test the printers**, **Search
for printers**, **Print a test page** (`src/actions.js`).

## How it talks to the printers

**Local only** — the manifest declares `"transports": ["local"]`, and every
device reports the `local` badge when its printer answers, `unreachable`
otherwise.

- **IPP** (RFC 8010/8011), port 631: `Get-Printer-Attributes` at every read,
  `Print-Job` for the test page and the "Print a text" scene action (a PDF
  written by `src/printer/pdf.js`). IPP is what AirPrint and Mopria are built
  on, so every networked HP printer of the last fifteen years speaks it. The
  binary format is encoded and decoded by `src/ipp/encoding.js`: no
  dependency besides the SDK.
- **HP LEDM**, port 80: `/DevMgmt/ProductUsageDyn.xml` for the page counter,
  when IPP does not give it (`src/printer/ledm.js`). Best effort.
- **mDNS** `_ipp._tcp`, through the Gladys core (`network_discovery`): the
  container sits on a Docker bridge multicast never crosses, so the core
  browses and the integration keeps the HP answers
  (`src/printer/discovery.js`).

A printer's identity is its IPP UUID (else its serial number), so its Gladys
device survives an IP change; the fleet even finds a printer again by mDNS when
it stopped answering at its old address. The last known values live in
`/data/printers.json` (`src/store.js`): a printer switched off at restart is
still listed, and the scene triggers compare with what was known before the
restart.

## Project structure

```
.
├─ index.js                          # SDK bootstrap (no printer logic)
├─ src/
│  ├─ app.js                         # every handler, registered on a Gladys client
│  ├─ config.js                      # DEFAULT_CONFIG (= manifest defaults) + normalization
│  ├─ i18n.js                        # the four languages: en, fr, de, es
│  ├─ logging.js                     # "Detailed logs" switch
│  ├─ store.js                       # /data/printers.json
│  ├─ actions.js                     # Configuration screen buttons
│  ├─ ipp/encoding.js                # IPP binary format
│  ├─ ipp/client.js                  # Get-Printer-Attributes, Print-Job
│  ├─ printer/endpoint.js            # addresses typed by users
│  ├─ printer/status.js              # IPP attributes -> snapshot, problems
│  ├─ printer/labels.js              # states, problems, colours in 4 languages
│  ├─ printer/discovery.js           # mDNS answers -> HP printers
│  ├─ printer/ledm.js                # HP page counter
│  ├─ printer/pdf.js                 # text -> PDF
│  ├─ printer/fleet.js               # reads, records, publication, scene triggers
│  ├─ devices/printer.js             # discovery payload, states, transport badge
│  └─ capabilities/                  # scenes.js, widgets.js (Gladys 5.1+)
├─ docs/{en,fr,de,es}.md             # user documentation
├─ test/                             # node --test, fake IPP printer + the SDK's fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, release, build, GitHub releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="hp-printer" \
PRINTER_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

`PRINTER_DATA_DIR` moves the cache out of `/data` for a run outside Docker.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test: no hardware, no network beyond 127.0.0.1
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs the first three on Node 22 and 24, and,
on pull requests, the store checks and a Docker build. The tests run a real IPP
server on the loopback (`test/helpers/fakePrinter.js`) and the SDK's fake
Gladys, which refuses the payloads Gladys refuses; `test/manifest.test.js`
keeps the manifest, the handlers and the four languages in sync.

## Release

1. Describe the change under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json` and the manifest (`version`, `docker_image`),
rolls the changelog, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64`
image to `ghcr.io/prohand/gladys-hpprinter`, and publishes the GitHub Release.

To appear in the Gladys store, the repository needs the GitHub topic
`gladys-assistant-integration`.

## License

Apache-2.0
