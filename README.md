<div align="center">
  <img src="./static/icon.png" width="96" height="96" alt="Midnightcord Logo">

# Midnightcord

**Un client Discord Linux autonome, léger et optimisé.**

[![License](https://img.shields.io/badge/license-GPL%20v3-a855f7)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux-FCC624.svg?logo=linux&logoColor=black)](./docs/LINUX.md)

---

</div>

Midnightcord est un fork Linux de [Nightcord](https://source.nightcord.st/nightcord/nightcord), lui-même basé sur Equicord et Vencord. Il produit une application Electron autonome : aucune installation Discord séparée n’est nécessaire.

---

## Optimisations Linux

* bundle de production minifié, sans obfuscation ni source maps ;
* application empaquetée dans `app.asar` pour réduire les accès disque ;
* throttling Chromium conservé en arrière-plan pour limiter CPU et batterie ;
* accélération matérielle active par défaut, décodage vidéo matériel optionnel ;
* sorties AppImage, Debian et archive portable `tar.gz` ;
* mises à jour réseau désactivées tant qu’un flux Midnightcord n’est pas explicitement configuré.

---

## Construire sous Linux

Prérequis : Git, Node.js 20 ou plus récent, Corepack et les outils système usuels (`fakeroot`/`dpkg` pour le paquet Debian).

```bash
git clone https://source.nightcord.st/nightcord/nightcord.git midnightcord
cd midnightcord
corepack pnpm install --frozen-lockfile
corepack pnpm package:linux:x64
```

Les paquets sont créés dans `release/`. Pour ARM64 :

```bash
corepack pnpm package:linux:arm64
```

Pour tester un dossier non empaqueté :

```bash
corepack pnpm package:dir
```

Voir [la documentation Linux](./docs/LINUX.md) pour l’installation et les options Wayland/X11.

---

## Credits

Midnightcord dérive de [Nightcord](https://source.nightcord.st/nightcord/nightcord), [Equicord](https://github.com/Equicord/Equicord), [Vesktop](https://github.com/Vencord/Vesktop) et [Vencord](https://github.com/Vendicated/Vencord). Leurs auteurs et contributeurs conservent tous leurs crédits et droits respectifs.

---

## Disclaimer

*Midnightcord is not affiliated with Discord Inc. in any way.*

Using third-party clients is technically against Discord's Terms of Service. Use at your own risk.
