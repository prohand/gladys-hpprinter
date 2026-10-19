# HP Printer für Gladys Assistant

[English](./en.md) · [Français](./fr.md) · [Deutsch](./de.md) · [Español](./es.md)

Verfolge deine HP-Drucker in Gladys: Tinten- oder Tonerstände, Zustand,
Warnungen (kein Papier, Papierstau, Klappe offen…) und die Zahl der gedruckten
Seiten. Lass dich per Szene warnen, wenn eine Patrone fast leer ist, und drucke
einen Text aus einer Szene.

Alles läuft in deinem lokalen Netzwerk: kein HP-Konto, keine Cloud, nichts
neben Gladys zu installieren.

## Inhalt

- [Was du brauchst](#was-du-brauchst)
- [Installation](#installation)
- [Konfiguration](#konfiguration)
- [Geräte](#geräte)
- [Szenen](#szenen)
- [Dashboard-Widgets](#dashboard-widgets)
- [Schaltflächen der Konfigurationsseite](#schaltflächen-der-konfigurationsseite)
- [Fehlersuche](#fehlersuche)
- [Datenschutz](#datenschutz)

## Was du brauchst

- Gladys Assistant **5.1 oder neuer**.
- Einen HP-Drucker im Netzwerk (WLAN oder Ethernet), im selben Netzwerk wie
  Gladys.
- **IPP** muss am Drucker eingeschaltet sein. Das ist bei fast allen
  HP-Druckern ab Werk so (AirPrint und Mopria nutzen es). Falls nötig: öffne
  die Webseite des Druckers (seine IP-Adresse im Browser eingeben) →
  _Netzwerk_ → _Erweitert_ → _IPP_ / _AirPrint_.

Die Integration liest den Drucker über Port **631** (IPP) und für den
Seitenzähler über Port **80**.

## Installation

1. In Gladys: **Integrationen** → **HP Printer** suchen → **Installieren**.
2. Öffne die Seite **Konfiguration** der Integration. Die Drucker deines
   Netzwerks werden automatisch gefunden. Fehlt einer, gib seine IP-Adresse
   unter **Druckeradressen** ein und speichere.
3. Öffne den Tab **Erkennung** und füge deine Drucker hinzu.

Tipp: Gib deinen Druckern eine feste IP-Adresse (DHCP-Reservierung im Router).
Die Integration findet einen Drucker mit neuer Adresse wieder, wenn die
automatische Suche an ist, aber eine feste Adresse ist immer zuverlässiger.

## Konfiguration

| Feld                             | Standard | Wirkung                                                                                                                                       |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Druckeradressen                  | leer     | IP-Adressen oder Hostnamen, durch Kommas getrennt. `ipp://192.168.1.20/ipp/print` geht auch. Nur nötig, wenn ein Drucker nicht gefunden wird. |
| HP-Drucker automatisch finden    | an       | Sucht HP-Drucker im Netzwerk (mDNS, wie ein Computer).                                                                                        |
| Aktualisierungsintervall (s)     | 300      | Wie oft jeder Drucker gelesen wird. 60 bis 3600 Sekunden.                                                                                     |
| Schwelle für niedrigen Stand (%) | 15       | Eine Patrone auf oder unter diesem Stand löst **Tinte oder Toner niedrig** aus.                                                               |
| Sprache der Gerätezustände       | English  | Sprache der Texte _Zustand_ und _Warnungen_ sowie der Funktionsnamen neuer Geräte.                                                            |
| Ausführliche Logs                | aus      | Schreibt in die Logs der Integration, was jeder Drucker antwortet. Nach der Fehlersuche wieder ausschalten.                                   |

Nicht unterstützt: Adressen mit `ipps://` / `https://` (verschlüsseltes IPP).
Das Zertifikat des Druckers ist selbst signiert, und ihm blind zu vertrauen
würde nur scheinbare Sicherheit geben: Nutze die einfache `ipp://`-Adresse im
lokalen Netzwerk.

## Geräte

Jeder Drucker ist ein Gladys-Gerät:

| Funktion                       | Typ    | Werte                                                                                                                                                         |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zustand                        | Text   | Bereit, Druckt, Angehalten, Offline                                                                                                                           |
| Warnungen                      | Text   | Keine Warnung, oder die Liste der Probleme: Kein Papier, Papierstau, Klappe offen, Patrone leer oder fehlt, Ausgabefach voll, Papierfach fehlt, Druckerfehler |
| Tinte / Toner (eine pro Farbe) | %      | 0 bis 100                                                                                                                                                     |
| Gedruckte Seiten               | Zähler | Gesamtzahl der Seiten, wenn der Drucker sie liefert                                                                                                           |

Die Gerätekarte zeigt außerdem ein Abzeichen **lokal** (der Drucker antwortet)
oder **nicht erreichbar** (er antwortet nicht: aus, im Tiefschlaf,
ausgesteckt).

Antwortet der Drucker nicht, wird der Zustand **Offline** und die letzten
bekannten Stände bleiben stehen.

Manche Drucker liefern nicht für jede Patrone einen Stand (manche sagen nur
„es ist noch Tinte da“): Diese Patrone zeigt dann keinen Wert.

## Szenen

### Auslöser

| Auslöser                     | Wann                                                    | Filter                                         | Variablen                  |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------- | -------------------------- |
| **Tinte oder Toner niedrig** | eine Patrone fällt unter die Schwelle der Konfiguration | Drucker, Farbe (Schwarz, Cyan, Magenta, Gelb…) | `supply`, `color`, `level` |
| **Druckerproblem**           | ein neues Problem tritt auf                             | Drucker, Problem                               | `problem`, `label`         |
| **Drucker nicht erreichbar** | der Drucker antwortet nicht mehr                        | Drucker                                        | `name`                     |

Jeder Auslöser löst **einmal** aus, wenn sich etwas ändert: Eine Patrone, die
bei 10 % bleibt, löst nicht bei jedem Lesen erneut aus. Er löst wieder aus,
wenn die Patrone gewechselt wurde und wieder niedrig wird.

Werte von `problem`: `paper_out`, `paper_jam`, `door_open`, `supply_problem`,
`output_full`, `tray_missing`, `other`. `label` ist dasselbe Problem in der
konfigurierten Sprache.

Beispiel: _„Wenn die schwarze Tinte des Bürodruckers niedrig ist, schick mir
eine Nachricht: `Tinte {{triggerEvent.data.supply}} bei
{{triggerEvent.data.level}} %`.“_

### Aktionen

| Aktion            | Felder                          | Ergebnisse                                                                                         |
| ----------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Drucker lesen** | Drucker                         | `reachable`, `state` (`idle`, `printing`, `stopped`, `offline`), `alerts`, `lowest_level`, `pages` |
| **Text drucken**  | Drucker, Titel (optional), Text | `printed` (wahr / falsch), `job_id`                                                                |

`lowest_level` und `pages` sind `-1`, wenn der Drucker sie nicht liefert.

**Text drucken** erstellt ein A4-PDF mit einer bis zwanzig Seiten und schickt
es an den Drucker. Der Text kann Szenenvariablen enthalten, zum Beispiel eine
Einkaufsliste. Antwortet der Drucker nicht oder lehnt er das Dokument ab, ist
`printed` `falsch` und die Szene läuft weiter: Setze eine Bedingung darauf, um
stattdessen eine Nachricht zu schicken.

## Dashboard-Widgets

- **HP-Drucker**: ein Drucker. Eine Anzeige pro Patrone (grün, orange unter der
  Schwelle, rot unter 5 %), der Seitenzähler, der Zustand, die Warnungen und
  die Adresse. Schaltflächen **Aktualisieren** und **Testseite** (mit
  Bestätigung). Wähle den Drucker in den Einstellungen des Widgets.
- **HP-Drucker (alle)**: jeder Drucker in einer Zeile, mit Zustand (oder
  Problem) und niedrigstem Stand.

## Schaltflächen der Konfigurationsseite

- **Drucker testen**: liest jetzt jeden Drucker und zeigt, welche antworten,
  ihren Zustand und niedrigsten Stand, und die Adressen ohne Antwort (mit
  Grund, zum Beispiel `ECONNREFUSED` oder `TIMEOUT`).
- **Drucker suchen**: sucht HP-Drucker im Netzwerk und listet sie auf.
- **Testseite drucken**: druckt eine Seite auf dem gewählten Drucker.

## Fehlersuche

**Mein Drucker wird nicht gefunden.**

- Prüfe, ob Drucker und Gladys im selben Netzwerk sind. Die automatische Suche
  geht nicht über VLANs oder Gast-WLANs hinweg.
- Gib die IP-Adresse des Druckers unter **Druckeradressen** ein (sie steht auf
  dem Display des Druckers oder auf seiner Netzwerk-Konfigurationsseite).
- Klicke auf **Drucker testen**: Eine Adresse ohne Antwort wird mit Grund
  angezeigt. `ECONNREFUSED`: IPP ist am Drucker ausgeschaltet. `TIMEOUT` oder
  `EHOSTUNREACH`: falsche Adresse oder Drucker aus.

**Kein Tintenstand.** Der Drucker sagt, dass er den Stand nicht kennt (häufig
bei kompatiblen oder nachgefüllten Patronen). Auf Gladys-Seite ist nichts zu
tun.

**Keine „Gedruckten Seiten“.** Der Seitenzähler wird auf der Webseite des
Druckers gelesen (Port 80). Manche Drucker liefern ihn nur über HTTPS oder gar
nicht: Die Funktion erscheint dann nicht.

**Der Drucker ist oft „Offline“.** Ein Drucker im Tiefschlaf antwortet unter
Umständen nicht mehr im Netzwerk. Prüfe seine Energieeinstellungen (Ruhemodus
/ automatisches Ausschalten).

**„Text drucken“ tut nichts.** Der Drucker muss PDF-Dokumente über das
Netzwerk annehmen: Das tun die meisten neueren HP-Drucker. Die Schaltfläche
**Testseite drucken** nennt den Grund, wenn es scheitert.

**Ausführliche Logs.** Schalte **Ausführliche Logs** ein, warte auf ein Lesen
(oder klicke auf **Drucker testen**) und öffne dann die Logs der Integration in
Gladys. Danach wieder ausschalten.

## Datenschutz

- Die Integration spricht nur mit deinen Druckern, in deinem lokalen Netzwerk.
- Nichts wird an HP oder einen anderen Onlinedienst gesendet.
- Die letzten bekannten Werte werden im eigenen Speicher der Integration
  (`/data`) aufbewahrt: Ein Drucker, der beim Neustart von Gladys aus ist,
  bleibt aufgeführt.
