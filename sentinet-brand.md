# SentiNet — Mémo d'identité visuelle

**Concept.** *SentiNet* = **senti**nelle + **net**work. Le symbole est un **bouclier** (sécurité, intégrité du réseau) contenant un **radar de surveillance** — anneaux concentriques, balayage lumineux et **maillage de nœuds réseau** autour d'un nœud central « sentinelle » en veille. Il traduit visuellement la mission de la solution : surveiller tout le trafic, détecter, et protéger.

---

## Palette

| Rôle | Nom | Hex |
|---|---|---|
| Fond sombre / tuile | Navy fond | `#0A1F38` |
| Bleu profond (texte, bouclier) | Bleu profond | `#0E2C4E` |
| Bleu accent | Accent | `#1B6CA8` |
| Cyan radar | Cyan | `#2EC4B6` |
| Cyan clair (balayage, nœuds) | Cyan clair | `#3FE0C8` |
| Teal du mot « Net » | Teal | `#12A594` |

Ces couleurs sont alignées sur celles du cahier des charges, pour une cohérence documentaire complète.

## Typographie

- **Poppins** (géométrique, moderne). Wordmark en **Poppins Bold** ; baseline/tagline en **Poppins Medium**.
- Dans les SVG livrés, le lettrage est **vectorisé (tracé en courbes)** : aucun besoin d'installer la police, le rendu est identique partout.
- Le mot est composé « Senti » (bleu profond) + « Net » (teal) pour matérialiser la contraction.

## Fichiers livrés

**Logos vectoriels (SVG, redimensionnables à l'infini)**
- `sentinet-logo-primary.svg` — logo horizontal, fond clair (usage par défaut).
- `sentinet-logo-dark.svg` — panneau navy + texte clair, pour fonds sombres.
- `sentinet-logo-mono.svg` — version monochrome (une seule encre) pour tampon, gravure, fax.
- `sentinet-icon.svg` — la marque seule (bouclier + radar).
- `sentinet-app-icon.svg` — tuile carrée arrondie (icône d'application).

**Rasters (PNG, fond transparent)**
- `export-primary.png`, `export-dark.png`, `export-mono.png` — lockups en haute définition.
- `export-mark-512/256/128/64.png` — marque seule.
- `export-app-512/256/128.png` — tuile applicative.

**Icône système**
- `sentinet-favicon.ico` — favicon multi-résolutions (16, 32, 48, 64, 128, 256 px), prêt pour le web et l'application.

**Aperçu**
- `brand-overview.jpg` — planche récapitulative de la marque.

## Règles d'usage

- Conserver une **zone de protection** autour du logo au moins égale à la hauteur du bouclier.
- Ne pas déformer, recolorer hors palette, ni ajouter d'ombre portée.
- Sur fond sombre, utiliser la variante `dark` ; sur photo ou fond chargé, préférer la tuile applicative.
- Taille minimale conseillée de la marque seule : 24 px ; du lockup : 120 px de large.
