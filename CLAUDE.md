# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projectoverzicht

**GRA Trajectbeheer Tool** is een pure browser-applicatie (geen backend) die studenten helpt een gepersonaliseerd leertraject samen te stellen op basis van aangeboden periodes, studiebelasting en roostersconflicten.

## De app draaien

Geen build-stap nodig. Statisch serveren volstaat:

```bash
python -m http.server 8080
# of: npx serve .
```

Open daarna `http://localhost:8080`. De app haalt iCal-data op van externe TimeEdit-URLs (vereist internetverbinding in Fase 2).

## Huisstijl (Arteveldehogeschool)

De tool volgt de visuele merkidentiteit van Arteveldehogeschool (brandbook 2023/2024).

**Lettertype**: Source Sans 3 (via Google Fonts) — gewichten 300, 400, 600, 700. Fallback: `system-ui`.

**Kleurenpalet**:

| CSS-variabele | Waarde | Betekenis |
|---|---|---|
| `--kleur-primair` | `#00a5d9` | AHS blauw — ENW BMG themakleur (GRA-programma's) |
| `--kleur-primair-licht` | `#e0f4fb` | Lichte tint van AHS blauw |
| `--kleur-achtergrond` | `#f5f9fc` | Blauwgetinte neutrale achtergrond |
| `--kleur-rand` | `#dde8ee` | Blauwgetinte neutrale rand |
| `--kleur-tekst` | `#1a1a1a` | Zwarte tekst (100% zwart conform brandbook) |
| `--kleur-conflict` | `#d94f4f` | Semantisch rood (conflicten) |
| `--kleur-goed` | `#2e8a5f` | Semantisch groen (geen conflicten) |
| `--kleur-plenair` | `#7a6fa0` | Neutraal paars (plenaire events, geen AHS-merkkleur) |

**Ontwerpprincipes** (uit brandbook):
- Wit is de hoofdkleur — gebruik ademruimte, geen overvolle kleurvlakken
- Één accentkleur per drager — voor dit tool is dat AHS blauw (#00a5d9)
- Zwarte tekst (geen grijstinten als primaire tekstkleur)
- GRA-programma's (AAD, MCS, TRL) vallen onder **ENW BMG** → themakleur is blauw (PMS 7460), niet het corporate oranje (#f58732)

**Brandkit**: `www.arteveldehogeschool.be/brandkit`

## Tech Stack

- Vanilla JavaScript, HTML5, CSS3 — geen framework, geen bundler
- Externe CDN-afhankelijkheden: jsPDF + jspdf-autotable (PDF-export, ingeladen in `index.html`)
- TimeEdit iCal-URLs geconfigureerd in `js/config.js`

## Architectuur

De app is een 3-fase wizard:

**Fase 0 — Studentgegevens**
Naam, programma (AAD/MCS/TRL), afstudeerrichting en keuzetraject. Laadt bij programmaselectie het bijhorende curriculum JSON via `laadCurriculum()`.

**Fase 1 — Trajectplanning**
Drag-and-drop van vakken op een tijdlijn met slots: M1–M4 (modules), S1–S2 (semesters), J (jaarvak). Sidebar toont vakken per schijf (1 of 2). Valideert `inclusiefMet`-groepen (samen plannen) en `exclusiefMet`-alternatieven.

**Fase 2 — Roosterconflicten**
Haalt iCal-feed op van TimeEdit, parset events, laat student een groep kiezen per vak, toont weekkalender met conflictmarkering en genereert PDF-export.

### State management (globale variabelen in `js/main.js`)

| Variabele | Type | Betekenis |
|---|---|---|
| `curriculumData` | object | Geladen curriculum JSON |
| `trajectState` | `{vakNaam: slotId\|'zijbalk'\|'behaald'\|'vrijgesteld'}` | Plaatsing van vakken |
| `actieveVakken` | `Set<string>` | Vakken op de tijdlijn |
| `cursusMap` | `Map<naam, Map<groepCode, Event[]>>` | Geparste iCal-events |
| `keuze` | `Map<naam, groepCode\|null>` | Gekozen groep per cursus |

### Kernfuncties (`js/main.js`)

- `laadCurriculum(programma)` — fetcht `data/curriculum-{programma}.json`
- `gefilterdVakken()` — filtert vakken op afstudeerrichting/keuzetraject
- `checkInclusiefMetSchendingen()` — valideert "samen plannen"-groepen
- `renderFase1()`, `renderTijdlijn()`, `renderVakZijbalk()` — Fase 1 UI
- `laadRooster(programma)`, `parseIcal()`, `bouwCursusMap()` — iCal verwerking
- `renderKalender()`, `renderCursusLijst()` — Fase 2 UI
- `exporteerPDF()` — PDF-generatie via jsPDF

## Dataformaat curriculum JSON

Bestanden in `data/curriculum-{aad|mcs|trl}.json`:

```json
{
  "opleiding": { "naam": "...", "studiepunten": 120 },
  "vakken": [{
    "naam": "Bedrijfsorganisatie",
    "studiepunten": 3,
    "periode": ["M1", "M3"],
    "schijf": 1,
    "afstudeerrichting": "...",
    "keuzetraject": "...",
    "exclusiefMet": ["AndereVakNaam"],
    "inclusiefMet": ["SamenTeNemenVak"]
  }]
}
```

Geldige periodewaarden: `M1`, `M2`, `M3`, `M4` (modules), `S1`, `S2` (semesters), `J` (jaarvak).

## Codeconventies

- **Commentaar en documentatie**: Nederlands
- **Code (variabelen, functies)**: Engels, beschrijvende namen
- Functies klein en enkelvoudig van verantwoordelijkheid
- Minimale code — geen onnodige abstracties

## Werkafspraken voor Claude

- **Commit nooit automatisch** — alleen wanneer de gebruiker dit expliciet vraagt
- Lees altijd bestaande code voor je wijzigingen voorstelt
- Voeg geen extra features, refactors of "verbeteringen" toe die niet gevraagd zijn
- Maak geen nieuwe bestanden aan tenzij strikt noodzakelijk
