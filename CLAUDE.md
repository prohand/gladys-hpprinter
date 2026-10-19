# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **HP printers** on the local network: ink /
toner levels, state, alerts and page count, read over IPP. Gladys 5.1+ adds scene triggers
(supply low, printer problem, printer unreachable), scene actions (read a printer, print a text)
and two dashboard widgets. Started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/fleet.test.js              # one file
node --test --test-name-pattern "offline"   # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` (Node 22 and 24); pull requests also run the store checks
and a Docker build. Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, rolls the changelog, tags, builds, publishes the GitHub Release).

## Architecture

```
index.js                 SDK bootstrap only
src/app.js               every handler (scan, poll, actions, scenes, widgets, lifecycle)
src/config.js            DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js              LANGUAGES = en, fr, de, es; pick / localize
src/ipp/                 IPP binary encoding + client (Get-Printer-Attributes, Print-Job)
src/printer/fleet.js     the printers: read, remember, publish, fire scene triggers
src/printer/status.js    IPP attributes -> snapshot; reasons -> problems
src/printer/labels.js    states / problems / colours in the four languages
src/printer/discovery.js mDNS answers (relayed by the Gladys core) -> HP printers
src/printer/ledm.js      HP page counter (/DevMgmt/ProductUsageDyn.xml, port 80)
src/printer/pdf.js       text -> PDF (Print-Job document)
src/devices/printer.js   discovery payload, states, transport badge
src/capabilities/        scenes.js, widgets.js
src/store.js             /data/printers.json
```

### Invariants worth knowing

- **External ids are forever.** A printer's id is its IPP UUID, else `sn-<serial>`, else
  `host-<address>` (`printerId`). Feature keys: `state`, `alerts`, `pages`, `supply-<marker
index>`. Trigger, action, widget, config and problem keys are stored by users: never rename.
- **Local only.** Manifest `transports: ["local"]`; the badge is `local` or `unreachable`.
  `ipps://` / `https://` addresses are refused on purpose (self-signed printer certificates).
- **Polling**: devices publish `should_poll: true` + `EVERY_MINUTES`; `fleet.poll()` applies the
  configured interval (seconds) by skipping polls, and never awaits the printer (the poll ack is
  short, a sleeping printer is slow). `fleet.settle()` waits for background reads.
- **Scene triggers fire on transitions only**, compared with the previous record — which survives
  restarts in `/data`. Nothing fires on the first read of a printer.
- **The container rootfs is read-only.** Write only under `/data` (`PRINTER_DATA_DIR` in tests).
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features included.
- **Versions belong to the Release workflow.** Never edit `version` / `docker_image` by hand;
  `test/manifest.test.js` checks they agree with `package.json`.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`.
  Never write a version heading: the Release workflow does.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with the code: defaults
vs `DEFAULT_CONFIG`, every action / scene action / widget registered, triggers and their
filters vs the events `fleet.js` fires, problem and colour options vs `PROBLEMS` /
`COLOR_LABELS`, and **every text in en, fr, de and es**.

## Testing

No hardware, no network beyond the loopback: `test/helpers/fakePrinter.js` is a real IPP server
on 127.0.0.1 (attributes overridable, can go down, refuse prints), and the tests use the SDK's
`createFakeGladys()`, which refuses invalid devices/states like Gladys does.

## Conventions

Prettier formats, ESLint catches mistakes. Comments explain **why**, in English. User-facing text
is `{ en, fr, de, es }` (built with `src/i18n.js`); user docs in `docs/en.md`, `docs/fr.md`,
`docs/de.md` and `docs/es.md`, kept in sync.
