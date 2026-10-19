# Security policy

## Supported versions

Only the latest release of the HP Printer integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-hpprinter](https://github.com/prohand/gladys-hpprinter/security),
then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords and addresses first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
printers and their firmware (report to HP), and the third-party services the
printers may talk to.

## How the integration handles your network

- It only talks to the printers of your local network: IPP on port 631, the
  printer's web page on port 80 for the page counter, and mDNS through the
  Gladys core. Nothing is sent to HP or any online service.
- It stores no secret. `/data/printers.json` holds printer names, addresses,
  models, serial numbers and the last levels.
- IPP is used in plain text on the local network, like the operating systems
  do by default. `ipps://` / `https://` addresses are refused rather than
  accepting the printer's self-signed certificate blindly.
- Texts printed by the "Print a text" scene action travel in plain text to the
  printer: do not print secrets on a network you do not trust.

## Good practices for users

- Keep the printers and Gladys on a trusted network (not a guest Wi-Fi).
- Keep the printer firmware, Gladys and the integration up to date.
- Protect the printer's web page with an administrator password.
