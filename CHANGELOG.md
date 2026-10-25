# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Catalog search keywords (HP printer ranges, IPP, AirPrint, cartridge).

### Changed

- SDK `@gladysassistant/integration-sdk` updated to 0.16.0.
- Gladys 5.3.0 or later is now required (manifest `keywords` field).
- CI: the pull-request store check runs with `--skip-image-check`; the Release
  workflow runs the full check, image included, once the image is published.

## [1.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [1.0.1] - 2026-10-19

### Added

- HP printers on the local network, read over IPP: state, alerts (out of paper,
  paper jam, door open, cartridge empty or missing, output tray full, paper
  tray missing), ink and toner levels, and pages printed (IPP, or the HP web
  page counter).
- Automatic discovery of the HP printers of the network (mDNS through Gladys),
  or addresses typed by hand. A printer that changed address is found again.
- `local` / `unreachable` badge per printer (manifest transport: local).
- Scene triggers: "Ink or toner low" (configurable threshold), "Printer
  problem", "Printer unreachable" — fired once per change, also across
  restarts.
- Scene actions: "Read a printer" (state, alerts, lowest level, pages) and
  "Print a text" (PDF sent over IPP).
- Dashboard widgets: "HP printer" (live gauges, state, alerts, Refresh and
  Test page buttons) and "HP printers" (every printer on one line).
- Configuration screen buttons: "Test the printers", "Search for printers",
  "Print a test page".
- Detailed logs switch in the configuration.
- English, French, German and Spanish everywhere: configuration screen,
  device states, messages, widgets, scene cards and documentation.
- CI (format, lint, tests on Node 22 and 24, store checks and Docker build on
  pull requests), UI-driven Release workflow, multi-arch image build, GitHub
  Releases, Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-hpprinter/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/prohand/gladys-hpprinter/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-hpprinter/releases/tag/v1.0.1
