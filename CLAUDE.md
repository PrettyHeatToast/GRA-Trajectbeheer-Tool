# CLAUDE.md — GRA Trajectbeheer Tool

## Projectoverzicht

**GRA Trajectbeheer Tool** is een pure browser-applicatie (geen backend) die studenten helpt een gepersonaliseerd leertraject samen te stellen. De tool houdt rekening met:

- Wanneer opleidingsonderdelen worden aangeboden
- Realistische studiebelasting
- Overlappingen in lesrooster vermijden

De applicatie draait volledig client-side (HTML + CSS + JavaScript), zonder server, framework of build-stap tenzij anders beslist.

## Tech Stack

- **Taal**: JavaScript (vanilla, geen framework tenzij expliciet gekozen)
- **Omgeving**: Browser only (geen Node.js runtime)
- **Bestanden**: HTML, CSS, JS — statisch serveerbaar

## Codeconventies

- **Taal van commentaar en documentatie**: Nederlands
- Gebruik beschrijvende variabele- en functienamen in het Engels (code), maar schrijf alle commentaren, JSDoc en README-inhoud in het Nederlands
- Houd functies klein en enkelvoudig van verantwoordelijkheid
- Vermijd onnodige abstracties — schrijf de minimale code die de taak uitvoert

## Werkafspraken voor Claude

- **Commit nooit automatisch** — maak alleen commits wanneer de gebruiker dit expliciet vraagt
- Lees altijd bestaande code voor je wijzigingen voorstelt
- Voeg geen extra features, refactors of "verbeteringen" toe die niet gevraagd zijn
- Maak geen nieuwe bestanden aan tenzij strikt noodzakelijk — bewerk bij voorkeur bestaande bestanden

## Projectstructuur (verwacht)

```
/
├── index.html          # Hoofdpagina
├── css/
│   └── style.css
├── js/
│   └── main.js         # Kernlogica
└── CLAUDE.md
```

> De structuur kan groeien naarmate het project evolueert.
