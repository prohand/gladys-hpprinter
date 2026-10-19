# HP Printer pour Gladys Assistant

[English](./en.md) · [Français](./fr.md) · [Deutsch](./de.md) · [Español](./es.md)

Suivez vos imprimantes HP depuis Gladys : niveaux d'encre ou de toner, état,
alertes (plus de papier, bourrage, capot ouvert…) et nombre de pages imprimées.
Soyez prévenu par une scène quand une cartouche est presque vide, et imprimez un
texte depuis une scène.

Tout se passe sur votre réseau local : pas de compte HP, pas de cloud, rien à
installer à côté de Gladys.

## Sommaire

- [Ce qu'il faut](#ce-quil-faut)
- [Installation](#installation)
- [Configuration](#configuration)
- [Appareils](#appareils)
- [Scènes](#scènes)
- [Widgets du tableau de bord](#widgets-du-tableau-de-bord)
- [Boutons de l'écran Configuration](#boutons-de-lécran-configuration)
- [Dépannage](#dépannage)
- [Vie privée](#vie-privée)

## Ce qu'il faut

- Gladys Assistant **5.1 ou plus récent**.
- Une imprimante HP branchée au réseau (Wi-Fi ou Ethernet), sur le même réseau
  que Gladys.
- **IPP** activé sur l'imprimante. Il est actif par défaut sur presque toutes
  les imprimantes HP (c'est ce qu'utilisent AirPrint et Mopria). Au besoin :
  ouvrez la page web de l'imprimante (tapez son adresse IP dans un navigateur)
  → _Réseau_ → _Avancé_ → _IPP_ / _AirPrint_.

L'intégration lit l'imprimante sur le port **631** (IPP), et sur le port **80**
pour le compteur de pages.

## Installation

1. Dans Gladys : **Intégrations** → cherchez **HP Printer** → **Installer**.
2. Ouvrez l'écran **Configuration** de l'intégration. Les imprimantes de votre
   réseau sont trouvées automatiquement. S'il en manque une, saisissez son
   adresse IP dans **Adresses des imprimantes**, puis enregistrez.
3. Ouvrez l'onglet **Découverte** et ajoutez vos imprimantes.

Conseil : donnez une adresse IP fixe à vos imprimantes (une réservation DHCP
dans votre box ou votre routeur). L'intégration retrouve une imprimante qui a
changé d'adresse quand la découverte automatique est active, mais une adresse
fixe reste plus fiable.

## Configuration

| Champ                                      | Par défaut | Rôle                                                                                                                                                    |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adresses des imprimantes                   | vide       | Adresses IP ou noms d'hôte, séparés par des virgules. `ipp://192.168.1.20/ipp/print` marche aussi. Utile seulement si une imprimante n'est pas trouvée. |
| Trouver les imprimantes HP automatiquement | activé     | Cherche les imprimantes HP sur le réseau (mDNS, comme un ordinateur).                                                                                   |
| Intervalle de rafraîchissement (s)         | 300        | Fréquence de lecture de chaque imprimante. De 60 à 3600 secondes.                                                                                       |
| Seuil de niveau bas (%)                    | 15         | Une cartouche à ce niveau ou en dessous déclenche **Encre ou toner bas**.                                                                               |
| Langue des états des appareils             | English    | Langue des textes _État_ et _Alertes_, et des noms de fonctionnalités des nouveaux appareils.                                                           |
| Logs détaillés                             | désactivé  | Écrit dans les logs de l'intégration ce que répond chaque imprimante. À désactiver une fois le problème trouvé.                                         |

Non pris en charge : les adresses `ipps://` / `https://` (IPP chiffré). Le
certificat de l'imprimante est auto-signé, et lui faire confiance les yeux
fermés donnerait une fausse impression de sécurité : utilisez l'adresse
`ipp://` simple sur votre réseau local.

## Appareils

Chaque imprimante est un appareil Gladys :

| Fonctionnalité                  | Type     | Valeurs                                                                                                                                                                             |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| État                            | texte    | Prête, Impression, Arrêtée, Hors ligne                                                                                                                                              |
| Alertes                         | texte    | Aucune alerte, ou la liste des problèmes : Plus de papier, Bourrage papier, Capot ouvert, Cartouche vide ou absente, Bac de sortie plein, Bac papier absent, Erreur de l'imprimante |
| Encre / Toner (une par couleur) | %        | 0 à 100                                                                                                                                                                             |
| Pages imprimées                 | compteur | nombre total de pages, si l'imprimante le donne                                                                                                                                     |

La carte de l'appareil affiche aussi un badge **local** (l'imprimante répond)
ou **injoignable** (elle ne répond pas : éteinte, en veille profonde,
débranchée).

Quand l'imprimante ne répond pas, l'état passe à **Hors ligne** et les derniers
niveaux connus restent affichés.

Certaines imprimantes ne donnent pas le niveau de chaque cartouche (certaines
disent seulement « il reste de l'encre ») : cette cartouche n'affiche alors pas
de valeur.

## Scènes

### Déclencheurs

| Déclencheur                | Quand                                                 | Filtres                                           | Variables                  |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------- | -------------------------- |
| **Encre ou toner bas**     | une cartouche passe sous le seuil de la configuration | imprimante, couleur (noir, cyan, magenta, jaune…) | `supply`, `color`, `level` |
| **Problème d'imprimante**  | un nouveau problème apparaît                          | imprimante, problème                              | `problem`, `label`         |
| **Imprimante injoignable** | l'imprimante ne répond plus                           | imprimante                                        | `name`                     |

Chaque déclencheur se déclenche **une seule fois**, au moment du changement :
une cartouche qui reste à 10 % ne redéclenche pas à chaque lecture. Il
redéclenche après le changement de cartouche, quand elle redevient basse.

Valeurs de `problem` : `paper_out`, `paper_jam`, `door_open`, `supply_problem`,
`output_full`, `tray_missing`, `other`. `label` est le même problème écrit dans
la langue de la configuration.

Exemple : _« Quand l'encre noire de l'imprimante du bureau est basse,
envoie-moi un message : `Encre {{triggerEvent.data.supply}} à
{{triggerEvent.data.level}} %`. »_

### Actions

| Action                  | Champs                                | Résultats                                                                                          |
| ----------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Lire une imprimante** | imprimante                            | `reachable`, `state` (`idle`, `printing`, `stopped`, `offline`), `alerts`, `lowest_level`, `pages` |
| **Imprimer un texte**   | imprimante, titre (facultatif), texte | `printed` (vrai / faux), `job_id`                                                                  |

`lowest_level` et `pages` valent `-1` quand l'imprimante ne les donne pas.

**Imprimer un texte** fabrique un PDF A4 d'une à vingt pages et l'envoie à
l'imprimante. Le texte peut contenir des variables de scène, par exemple une
liste de courses. Si l'imprimante ne répond pas ou refuse le document,
`printed` vaut `faux` et la scène continue : mettez une condition dessus pour
envoyer un message à la place.

## Widgets du tableau de bord

- **Imprimante HP** : une imprimante. Une jauge par cartouche (verte, orange
  sous le seuil, rouge sous 5 %), le compteur de pages, l'état, les alertes et
  l'adresse. Boutons **Actualiser** et **Page de test** (avec confirmation).
  Choisissez l'imprimante dans les réglages du widget.
- **Imprimantes HP** : toutes les imprimantes, une par ligne, avec leur état
  (ou leur problème) et leur niveau le plus bas.

## Boutons de l'écran Configuration

- **Tester les imprimantes** : lit chaque imprimante maintenant et montre
  celles qui répondent, leur état et leur niveau le plus bas, et les adresses
  qui n'ont pas répondu (avec la raison, par exemple `ECONNREFUSED` ou
  `TIMEOUT`).
- **Rechercher les imprimantes** : cherche les imprimantes HP sur le réseau et
  les liste.
- **Imprimer une page de test** : imprime une page sur l'imprimante choisie.

## Dépannage

**Mon imprimante n'est pas trouvée.**

- Vérifiez que l'imprimante et Gladys sont sur le même réseau. La découverte
  automatique ne traverse pas les VLAN ni les réseaux Wi-Fi invités.
- Saisissez l'adresse IP de l'imprimante dans **Adresses des imprimantes**
  (elle s'affiche sur l'écran de l'imprimante ou sur sa page de configuration
  réseau).
- Cliquez sur **Tester les imprimantes** : une adresse qui ne répond pas est
  affichée avec la raison. `ECONNREFUSED` : IPP est désactivé sur l'imprimante.
  `TIMEOUT` ou `EHOSTUNREACH` : mauvaise adresse, ou imprimante éteinte.

**Pas de niveau d'encre.** L'imprimante dit qu'elle ne connaît pas le niveau
(c'est fréquent avec des cartouches compatibles ou rechargées). Rien à corriger
côté Gladys.

**Pas de « Pages imprimées ».** Le compteur de pages est lu sur la page web de
l'imprimante (port 80). Certaines imprimantes ne le donnent qu'en HTTPS, ou pas
du tout : la fonctionnalité n'apparaît alors pas.

**L'imprimante est souvent « Hors ligne ».** Une imprimante en veille profonde
peut ne plus répondre sur le réseau. Vérifiez ses réglages d'énergie (veille /
arrêt automatique).

**« Imprimer un texte » ne fait rien.** L'imprimante doit accepter les
documents PDF par le réseau : c'est le cas de la plupart des imprimantes HP
récentes. Le bouton **Imprimer une page de test** donne la raison en cas
d'échec.

**Logs détaillés.** Activez **Logs détaillés**, attendez une lecture (ou
cliquez sur **Tester les imprimantes**), puis ouvrez les logs de l'intégration
dans Gladys. Désactivez-les ensuite.

## Vie privée

- L'intégration ne parle qu'à vos imprimantes, sur votre réseau local.
- Rien n'est envoyé à HP ni à aucun autre service en ligne.
- Les dernières valeurs connues sont gardées dans le stockage propre de
  l'intégration (`/data`) : une imprimante éteinte au redémarrage de Gladys
  reste listée.
