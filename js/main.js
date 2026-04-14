// GRA Trajectbeheer Tool — Kernlogica

const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const UUR_HOOGTE_PX = 48; // pixels per uur (UI-constante)

// ── Staat ─────────────────────────────────────────────────────

// Fase 0 staat (studentgegevens)
let studentNaam              = '';
let studentAfstudeerrichting = '';
let studentKeuzetraject      = '';

// Fase 1 staat
let huidigeFase = 0;
let curriculumData = null;
let trajectState = {};          // { vakNaam: 'zijbalk' | 'behaald' | slotId }
let actieveVakken = new Set();  // vakken geplaatst in de tijdlijn
let actiefSchijfTab = 1;        // zijbalk-tab (1 of 2)
let huidigJaar = 1;

// Fase 2 staat
let huidigProgramma = '';
let events = [];
let cursusMap = new Map(); // cursusNaam → Map<groepCode, Event[]>
let keuze = new Map();     // cursusNaam → groepCode | null
let huidigWeekStart = null;
let actiefCursusSchijf = 1; // actieve schijf-tab in cursus-paneel (fase 2)

// ── Curriculum laden ──────────────────────────────────────────

async function laadCurriculum(programma) {
  try {
    const resp = await fetch(`data/curriculum-${programma.toLowerCase()}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    curriculumData = await resp.json();
  } catch (fout) {
    console.error(`Curriculum laden mislukt voor ${programma}:`, fout);
    curriculumData = { opleiding: { naam: programma }, vakken: [] };
  }
  laadTrajectState();
  renderFase1();
}

// ── Traject-staat initialisatie ───────────────────────────────

function laadTrajectState() {
  // Initialiseer alle vakken als 'zijbalk' (geen persistentie)
  trajectState = {};
  if (curriculumData) {
    for (const vak of curriculumData.vakken) {
      trajectState[vak.naam] = 'zijbalk';
    }
  }
}


// ── inclusiefMet-validatie ─────────────────────────────────────

// Controleert of alle "moet samen opgenomen worden"-groepen volledig zijn.
// Een vak is voldaan als het ingepland, behaald of vrijgesteld is.
// Geeft een array van objecten terug: { groep: [...namen], ontbrekend: [...namen] }
function checkInclusiefMetSchendingen() {
  if (!curriculumData) return [];
  const schendingen = [];
  const gecontroleerd = new Set();

  for (const vak of gefilterdVakken()) {
    if (!vak.inclusiefMet || gecontroleerd.has(vak.naam)) continue;

    const groep = [vak.naam, ...vak.inclusiefMet];
    groep.forEach(naam => gecontroleerd.add(naam));

    const isVoldaan = naam => {
      const staat = trajectState[naam];
      return staat && staat !== 'zijbalk';
    };

    const actief = groep.filter(isVoldaan);
    if (actief.length > 0 && actief.length < groep.length) {
      schendingen.push({ groep, ontbrekend: groep.filter(naam => !isVoldaan(naam)) });
    }
  }

  return schendingen;
}

// ── Vakken filteren op studentgegevens ────────────────────────

// Geeft de namen terug van vakken die verborgen moeten worden omdat
// een exclusief alternatief actief is (geplaatst, behaald of vrijgesteld).
function vakkenDieVerborgenZijn() {
  const verborgen = new Set();
  if (!curriculumData) return verborgen;
  for (const vak of curriculumData.vakken) {
    if (!vak.exclusiefMet) continue;
    const staat = trajectState[vak.naam];
    if (staat && staat !== 'zijbalk') {
      for (const naam of vak.exclusiefMet) {
        verborgen.add(naam);
      }
    }
  }
  return verborgen;
}

// Geeft enkel de vakken terug die relevant zijn voor de geselecteerde
// afstudeerrichting en keuzetraject van de student, en waarvan geen
// exclusief alternatief actief is.
function gefilterdVakken() {
  if (!curriculumData) return [];
  const verborgen = vakkenDieVerborgenZijn();
  return curriculumData.vakken.filter(vak => {
    if (verborgen.has(vak.naam)) return false;
    if (!vak.afstudeerrichting) return true;
    if (vak.afstudeerrichting !== studentAfstudeerrichting) return false;
    if (!vak.keuzetraject) return true;
    return vak.keuzetraject === studentKeuzetraject;
  });
}

// ── Fase 1: renderen ──────────────────────────────────────────

function renderFase1() {
  if (!curriculumData) return;

  // Herbereken actieve vakken (geplaatst in tijdlijn, niet behaald/vrijgesteld)
  actieveVakken = new Set(
    Object.entries(trajectState)
      .filter(([, staat]) => staat !== 'zijbalk' && staat !== 'behaald' && staat !== 'vrijgesteld')
      .map(([naam]) => naam)
  );

  renderSpTeller();
  renderTijdlijn();
  renderVakZijbalk();
  koppelDropzones();
  document.getElementById('naar-fase2').disabled = actieveVakken.size === 0;
}

function berekenSpTotalen() {
  const vakken = gefilterdVakken();
  let behaald = 0, vrijgesteld = 0, traject = 0;
  for (const vak of vakken) {
    const staat = trajectState[vak.naam];
    if (staat === 'behaald') behaald += vak.studiepunten;
    else if (staat === 'vrijgesteld') vrijgesteld += vak.studiepunten;
    else if (actieveVakken.has(vak.naam)) traject += vak.studiepunten;
  }
  const totaal = curriculumData?.opleiding?.studiepunten ?? 0;
  return { behaald, vrijgesteld, traject, resterend: totaal - behaald - vrijgesteld - traject };
}

function renderSpTeller() {
  const { behaald, vrijgesteld, traject, resterend } = berekenSpTotalen();
  document.getElementById('sp-behaald').textContent = `${behaald} SP`;
  document.getElementById('sp-vrijgesteld').textContent = `${vrijgesteld} SP`;
  document.getElementById('sp-traject').textContent = `${traject} SP`;
  document.getElementById('sp-resterend').textContent = `${resterend} SP`;
}

function renderTijdlijn() {

  const blok = document.getElementById('huidig-jaar-blok');
  blok.innerHTML = '';

  // Module-rij (M1–M4)
  const modulesRij = document.createElement('div');
  modulesRij.className = 'modules-rij';
  for (let m = 1; m <= 4; m++) {
    modulesRij.appendChild(maakPeriodeSlot(`j${huidigJaar}-m${m}`, `M${m}`, `Module ${m}`));
  }
  blok.appendChild(modulesRij);

  // Semester-rij (S1–S2)
  const semestersRij = document.createElement('div');
  semestersRij.className = 'semesters-rij';
  semestersRij.appendChild(maakPeriodeSlot(`j${huidigJaar}-s1`, 'S1', 'Semester 1'));
  semestersRij.appendChild(maakPeriodeSlot(`j${huidigJaar}-s2`, 'S2', 'Semester 2'));
  blok.appendChild(semestersRij);

  // Jaarvak-rij (J)
  const jaarRij = document.createElement('div');
  jaarRij.className = 'jaar-rij';
  jaarRij.appendChild(maakPeriodeSlot(`j${huidigJaar}-j`, 'J', 'Volledig jaar'));
  blok.appendChild(jaarRij);
}

function maakPeriodeSlot(slotId, periode, label) {
  const slot = document.createElement('div');
  slot.className = 'periode-slot';
  slot.dataset.periode = periode;

  const titel = document.createElement('h4');
  titel.textContent = label;
  slot.appendChild(titel);

  const dz = document.createElement('div');
  dz.className = 'dropzone';
  dz.dataset.slot = slotId;

  // Vul vakken die in dit slot geplaatst zijn
  for (const vak of gefilterdVakken()) {
    if (trajectState[vak.naam] === slotId) {
      dz.appendChild(maakVakKaart(vak, 'tijdlijn'));
    }
  }

  slot.appendChild(dz);
  return slot;
}

function renderVakZijbalk() {
  const bak1 = document.getElementById('vak-bak-1');
  const bak2 = document.getElementById('vak-bak-2');
  bak1.innerHTML = '';
  bak2.innerHTML = '';

  const vakken = gefilterdVakken();
  const zijbalkVakken    = vakken.filter(v => trajectState[v.naam] === 'zijbalk');
  const behaaldVakken    = vakken.filter(v => trajectState[v.naam] === 'behaald');
  const vrijgesteldVakken = vakken.filter(v => trajectState[v.naam] === 'vrijgesteld');

  for (const vak of [...zijbalkVakken, ...behaaldVakken, ...vrijgesteldVakken]) {
    const bak = vak.schijf === 1 ? bak1 : bak2;
    bak.appendChild(maakVakKaart(vak, trajectState[vak.naam]));
  }

  const inZijbalkS1 = [...zijbalkVakken, ...behaaldVakken, ...vrijgesteldVakken].filter(v => v.schijf === 1).length;
  const inZijbalkS2 = [...zijbalkVakken, ...behaaldVakken, ...vrijgesteldVakken].filter(v => v.schijf === 2).length;

  if (inZijbalkS1 === 0) {
    const leeg = document.createElement('p');
    leeg.className = 'zijbalk-leeg';
    leeg.textContent = 'Alle vakken van schijf 1 zijn ingepland';
    bak1.appendChild(leeg);
  }

  if (inZijbalkS2 === 0) {
    const leeg = document.createElement('p');
    leeg.className = 'zijbalk-leeg';
    leeg.textContent = 'Alle vakken van schijf 2 zijn ingepland';
    bak2.appendChild(leeg);
  }

  // Geen vakken beschikbaar (leeg curriculum)
  if (gefilterdVakken().length === 0) {
    const melding = document.createElement('p');
    melding.className = 'zijbalk-leeg';
    melding.textContent = 'Geen curriculumdata beschikbaar voor dit programma.';
    bak1.appendChild(melding);
  }
}

// ── Vakkaart aanmaken ─────────────────────────────────────────

function maakVakKaart(vak, weergave) {
  const isInactief = weergave === 'behaald' || weergave === 'vrijgesteld';

  const kaart = document.createElement('div');
  kaart.className = 'vak-kaart'
    + (weergave === 'behaald'    ? ' behaald'    : '')
    + (weergave === 'vrijgesteld' ? ' vrijgesteld' : '')
    + (weergave === 'tijdlijn'   ? ' in-traject'  : '');
  kaart.dataset.vakNaam = vak.naam;
  kaart.draggable = !isInactief;

  if (weergave === 'tijdlijn') {
    // Compacte weergave in tijdlijn (enkel naam + SP)
    const rij = document.createElement('div');
    rij.className = 'vak-kaart-rij';

    const info = document.createElement('div');
    info.className = 'vak-kaart-info';

    const naam = document.createElement('span');
    naam.className = 'vak-kaart-naam';
    naam.textContent = vak.naam;
    info.appendChild(naam);

    const details = document.createElement('span');
    details.className = 'vak-kaart-details';
    details.textContent = `${vak.studiepunten} SP`;
    info.appendChild(details);

    rij.appendChild(info);
    kaart.appendChild(rij);
  } else {
    // Zijbalk-weergave: info links, twee actieknoppen rechts
    const rij = document.createElement('div');
    rij.className = 'vak-kaart-rij';

    const info = document.createElement('div');
    info.className = 'vak-kaart-info';

    const naam = document.createElement('span');
    naam.className = 'vak-kaart-naam';
    naam.textContent = vak.naam;
    info.appendChild(naam);

    const details = document.createElement('span');
    details.className = 'vak-kaart-details';
    details.textContent = `${vak.studiepunten} SP · ${vak.periode.join('/')} · Schijf ${vak.schijf}`;
    info.appendChild(details);

    rij.appendChild(info);

    // Twee toggle-knoppen: Behaald (B) en Vrijstelling (V)
    const acties = document.createElement('div');
    acties.className = 'vak-acties';

    const knopBehaald = document.createElement('button');
    knopBehaald.className = 'vak-actie-knop' + (weergave === 'behaald' ? ' actief-behaald' : '');
    knopBehaald.textContent = 'B';
    knopBehaald.title = 'Behaald';
    knopBehaald.addEventListener('click', () => {
      trajectState[vak.naam] = weergave === 'behaald' ? 'zijbalk' : 'behaald';
      renderFase1();
    });

    const knopVrijstelling = document.createElement('button');
    knopVrijstelling.className = 'vak-actie-knop' + (weergave === 'vrijgesteld' ? ' actief-vrijgesteld' : '');
    knopVrijstelling.textContent = 'V';
    knopVrijstelling.title = 'Vrijstelling';
    knopVrijstelling.addEventListener('click', () => {
      trajectState[vak.naam] = weergave === 'vrijgesteld' ? 'zijbalk' : 'vrijgesteld';
      renderFase1();
    });

    acties.appendChild(knopBehaald);
    acties.appendChild(knopVrijstelling);
    rij.appendChild(acties);
    kaart.appendChild(rij);
  }

  // Drag-handlers (voor alle niet-inactieve kaarten, ook in tijdlijn)
  if (!isInactief) {
    kaart.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('vak-naam', vak.naam);
      e.dataTransfer.setData('vak-periodes', JSON.stringify(vak.periode));
      e.dataTransfer.effectAllowed = 'move';
      markeerDropzones(vak.periode);
    });
    kaart.addEventListener('dragend', wisDropzoneMarkeringen);
  }

  return kaart;
}

// ── Drag-and-drop ─────────────────────────────────────────────

function markeerDropzones(vakPeriodes) {
  document.querySelectorAll('#huidig-jaar-blok .dropzone').forEach(dz => {
    const slot = dz.closest('[data-periode]');
    const periode = slot ? slot.dataset.periode : null;
    if (periode && vakPeriodes.includes(periode)) {
      dz.classList.add('drag-geldig');
    } else {
      dz.classList.add('drag-ongeldig');
    }
  });
}

function wisDropzoneMarkeringen() {
  document.querySelectorAll('.dropzone').forEach(dz => {
    dz.classList.remove('drag-geldig', 'drag-ongeldig');
  });
}

function koppelDropzones() {
  document.querySelectorAll('#huidig-jaar-blok .dropzone').forEach(dz => {
    dz.addEventListener('dragover', (e) => e.preventDefault());
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      const vakNaam = e.dataTransfer.getData('vak-naam');
      if (!vakNaam) return;

      const vak = curriculumData?.vakken.find(v => v.naam === vakNaam);
      const periode = dz.closest('[data-periode]')?.dataset.periode;
      const isOngeldig = vak && periode && !vak.periode.includes(periode);

      if (isOngeldig) {
        const bevestigd = confirm(
          `"${vakNaam}" wordt normaal niet aangeboden in dit blok. Wil je het hier toch inplannen?`
        );
        if (!bevestigd) {
          renderFase1();
          return;
        }
      }

      trajectState[vakNaam] = dz.dataset.slot;
      renderFase1();
    });
  });
}

// ── Jaar-navigatie fase 1 ─────────────────────────────────────

function wisselJaar(delta) {
  const nieuw = huidigJaar + delta;
  if (nieuw < 1) return;
  huidigJaar = nieuw;
  renderTijdlijn();
  koppelDropzones();
}

// ── Schijf-tabs ───────────────────────────────────────────────

function wisselSchijfTab(schijf) {
  actiefSchijfTab = schijf;
  document.querySelectorAll('.schijf-tab').forEach(tab => {
    tab.classList.toggle('actief', parseInt(tab.dataset.schijf) === schijf);
  });
  document.getElementById('vak-bak-1').classList.toggle('verborgen', schijf !== 1);
  document.getElementById('vak-bak-2').classList.toggle('verborgen', schijf !== 2);
}

// ── Wizard-navigatie ──────────────────────────────────────────

function toonFase(fase) {
  huidigeFase = fase;


  const panels = [
    document.getElementById('fase0-paneel'),
    document.getElementById('fase1-paneel'),
    document.getElementById('fase2-paneel'),
  ];
  panels.forEach((el, i) => el.classList.toggle('verborgen', i !== fase));

  [0, 1, 2].forEach(i =>
    document.getElementById(`fase${i}-stap`).classList.toggle('actief', i === fase)
  );

  document.getElementById('naar-fase1-van-fase0').classList.toggle('verborgen', fase !== 0);
  document.getElementById('terug-naar-fase0').classList.toggle('verborgen', fase !== 1);
  document.getElementById('naar-fase2').classList.toggle('verborgen', fase !== 1);
  document.getElementById('naar-fase1').classList.toggle('verborgen', fase !== 2);
  document.getElementById('exporteer-pdf').classList.toggle('verborgen', fase !== 2);
  document.getElementById('week-nav').classList.toggle('week-nav-zichtbaar', fase === 2);

  if (fase === 1) {
    // Herrender trajectplanner met actuele afstudeerrichting/keuzetraject-filter
    renderFase1();
  }

  if (fase === 2) {
    synchroniseerKeuzeVanafTraject();
    if (events.length === 0) laadRooster(huidigProgramma);
    else updateAlles();
  }
}

// ── Fase 0: gegevensformulier ─────────────────────────────────

// Vult de afstudeerrichting-dropdown op basis van de vakken in het curriculum.
// Toont een lege placeholder zodat de student bewust een keuze maakt.
function vulAfstudeerrichtingOpties(vakken) {
  const select = document.getElementById('student-afstudeerrichting');
  select.innerHTML = '';
  const richtingen = [...new Set(vakken
    .filter(v => v.afstudeerrichting)
    .map(v => v.afstudeerrichting)
  )].sort();

  // Lege kiesoptie als eerste
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— kies een richting —';
  select.appendChild(placeholder);

  for (const r of richtingen) {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    select.appendChild(o);
  }

  // Herstel geselecteerde waarde indien geldig
  select.value = richtingen.includes(studentAfstudeerrichting) ? studentAfstudeerrichting : '';
  studentAfstudeerrichting = select.value;

  document.getElementById('afstudeerrichting-veld')
    .classList.toggle('verborgen', richtingen.length === 0);
}

// Vult de keuzetraject-dropdown op basis van de geselecteerde afstudeerrichting
function vulKeuzetrajectOpties(vakken) {
  const select = document.getElementById('student-keuzetraject');
  select.innerHTML = '';
  const trajecten = [...new Set(vakken
    .filter(v => v.afstudeerrichting === studentAfstudeerrichting && v.keuzetraject)
    .map(v => v.keuzetraject)
  )].sort();
  for (const t of trajecten) {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    select.appendChild(o);
  }
  if (trajecten.includes(studentKeuzetraject)) {
    select.value = studentKeuzetraject;
  } else {
    studentKeuzetraject = trajecten[0] || '';
    select.value = studentKeuzetraject;
  }
  document.getElementById('keuzetraject-veld')
    .classList.toggle('verborgen', trajecten.length === 0);
}

// Koppelt alle event-listeners aan het gegevensformulier en vult de velden
function initialiseerGegevensFormulier() {
  // Vul opleidingsdropdown vanuit config
  const opleidingSelect = document.getElementById('student-opleiding');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— kies een opleiding —';
  opleidingSelect.appendChild(placeholder);
  for (const [code, label] of Object.entries(CONFIG.programmaLabels)) {
    const optie = document.createElement('option');
    optie.value = code;
    optie.textContent = `GRA ${code} — ${label}`;
    opleidingSelect.appendChild(optie);
  }

  document.getElementById('student-naam').value = studentNaam;
  document.getElementById('student-opleiding').value = huidigProgramma;

  document.getElementById('student-naam').addEventListener('input', e => {
    studentNaam = e.target.value;
  });

  document.getElementById('student-opleiding').addEventListener('change', async e => {
    huidigProgramma = e.target.value;
    keuze = new Map(); events = []; cursusMap = new Map();
    studentAfstudeerrichting = '';
    studentKeuzetraject = '';
    if (!huidigProgramma) {
      curriculumData = null;
      vulAfstudeerrichtingOpties([]);
      vulKeuzetrajectOpties([]);
      return;
    }
    await laadCurriculum(huidigProgramma);
    vulAfstudeerrichtingOpties(curriculumData.vakken);
    vulKeuzetrajectOpties(curriculumData.vakken);
  });

  document.getElementById('student-afstudeerrichting').addEventListener('change', e => {
    studentAfstudeerrichting = e.target.value;
    studentKeuzetraject = '';
    vulKeuzetrajectOpties(curriculumData.vakken);
  });

  document.getElementById('student-keuzetraject').addEventListener('change', e => {
    studentKeuzetraject = e.target.value;
  });

  vulAfstudeerrichtingOpties(curriculumData?.vakken ?? []);
  vulKeuzetrajectOpties(curriculumData?.vakken ?? []);
}

// ── Fase 1 → Fase 2 koppeling ─────────────────────────────────

function normaliseerVakNaam(naam) {
  return naam.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function synchroniseerKeuzeVanafTraject() {
  if (actieveVakken.size === 0) {
    // Geen trajectory ingesteld — toon alle vakken
    keuze = new Map([...cursusMap.keys()].map(naam => [naam, keuze.get(naam) ?? null]));
    return;
  }

  const mapping = CONFIG.naamMapping[huidigProgramma] || {};
  const nieuweKeuze = new Map();

  for (const [cursusNaam] of cursusMap) {
    // Controleer handmatige mapping eerst
    const mapped = Object.entries(mapping).find(([ical]) => ical === cursusNaam);
    const zoekNaam = mapped ? mapped[1] : cursusNaam;
    const genorm = normaliseerVakNaam(zoekNaam);

    const isActief = [...actieveVakken].some(
      vakNaam => normaliseerVakNaam(vakNaam) === genorm
    );

    if (isActief) {
      nieuweKeuze.set(cursusNaam, keuze.get(cursusNaam) ?? null);
    }
  }

  keuze = nieuweKeuze;
}

// ── iCal ophalen ─────────────────────────────────────────────

async function laadRooster(programma) {
  huidigProgramma = programma;
  keuze = new Map();

  const statusEl = document.getElementById('laad-status');
  if (statusEl) statusEl.textContent = 'Rooster ophalen…';
  document.getElementById('cursus-lijst').innerHTML = '<p id="laad-status">Rooster ophalen…</p>';
  document.getElementById('kalender').innerHTML = '';

  try {
    const response = await fetch(CONFIG.programmaUrls[programma]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const tekst = await response.text();
    verwerkIcalTekst(tekst);
  } catch (e) {
    toonHandmatigInvoer();
  }
}

function toonHandmatigInvoer() {
  document.getElementById('laad-melding').classList.remove('verborgen');
  document.getElementById('laad-status').textContent = 'Kon rooster niet automatisch laden.';
}

function verwerkIcalTekst(tekst) {
  events = parseIcal(tekst);
  cursusMap = bouwCursusMap(events);

  // Synchroniseer keuze op basis van trajectplanner
  synchroniseerKeuzeVanafTraject();

  // Begin op de eerste week met events
  const eersteEvent = events.slice().sort((a, b) => a.start - b.start)[0];
  huidigWeekStart = eersteEvent
    ? maandagVan(eersteEvent.start)
    : maandagVan(new Date());

  document.getElementById('laad-status')?.remove();
  renderCursusLijst();
  renderKalender();
}

// ── iCal parsen ──────────────────────────────────────────────

function ontvouwRegels(tekst) {
  // iCal-regelomschakeling: een regel die begint met spatie/tab is een voortzetting
  return tekst.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseIcal(tekst) {
  const ontvouwen = ontvouwRegels(tekst);
  const blokken = ontvouwen.split('BEGIN:VEVENT').slice(1);
  return blokken.map(blok => parseVEvent(blok)).filter(Boolean);
}

function parseVEvent(blok) {
  const haal = (veld) => {
    const m = blok.match(new RegExp(`^${veld}[;:][^\r\n]*`, 'm'));
    if (!m) return '';
    // Verwijder veldnaam en eventuele parameters (bijv. DTSTART;TZID=...)
    return m[0].replace(/^[^:]+:/, '').trim();
  };

  const summaryRauw = haal('SUMMARY');
  const dtstart = haal('DTSTART');
  const dtend = haal('DTEND');
  const location = haal('LOCATION');

  if (!summaryRauw || !dtstart || !dtend) return null;

  const start = parseIcalDatum(dtstart);
  const end = parseIcalDatum(dtend);
  if (!start || !end) return null;

  // Weekends overslaan
  const dag = start.getDay();
  if (dag === 0 || dag === 6) return null;

  const cursusNaam = extractCourseName(summaryRauw);
  const groepen = extractGroepen(summaryRauw);

  if (!cursusNaam) return null;

  return { uid: haal('UID'), start, end, location, cursusNaam, groepen };
}

function parseIcalDatum(waarde) {
  // Formaat: 20260420T083000Z
  const m = waarde.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, jaar, maand, dag, uur, min, sec, utc] = m;
  if (utc === 'Z') {
    return new Date(Date.UTC(+jaar, +maand - 1, +dag, +uur, +min, +sec));
  }
  return new Date(+jaar, +maand - 1, +dag, +uur, +min, +sec);
}

function extractCourseName(summary) {
  // iCal scheidt waarden binnen SUMMARY met \, (escaped komma)
  const eerste = summary.split('\\,')[0].trim();
  // Verwijder alle achterliggende haakjes-tags: (S2), (OT), (S1+S2), (CS), etc.
  const naam = eerste.replace(/(\s*\([^)]+\))+\s*$/, '').trim();
  // Negeer lege namen en speciale markers
  if (!naam || naam.length < 2) return null;
  if (/^geen\s+OLOD/i.test(naam)) return null;
  return naam;
}

function extractGroepen(summary) {
  // iCal scheidt waarden binnen SUMMARY met \, (escaped komma)
  const prefix = CONFIG.groepPrefix[huidigProgramma];
  return summary
    .split('\\,')
    .map(s => s.trim())
    .filter(s => prefix.test(s));
}

// Geeft true als een groepcode bij de afstudeerrichting van de student hoort.
// Groepen die geen richtingcode bevatten (gedeelde groepen) worden altijd getoond.
function groepHoortBijStudent(groepCode) {
  if (!studentAfstudeerrichting || !curriculumData) return true;
  const alleRichtingen = [...new Set(
    curriculumData.vakken
      .filter(v => v.afstudeerrichting)
      .map(v => v.afstudeerrichting)
  )];
  if (alleRichtingen.length === 0) return true;
  // Verberg groepen die een andere richting bevatten dan die van de student
  const andereRichtingen = alleRichtingen.filter(r => r !== studentAfstudeerrichting);
  return !andereRichtingen.some(r => groepCode.includes(`_${r}_`) || groepCode.endsWith(`_${r}`));
}

// ── Data opbouwen ─────────────────────────────────────────────

function bouwCursusMap(alleEvents) {
  const map = new Map();

  for (const ev of alleEvents) {
    if (ev.groepen.length === 0) continue; // plenairen zonder groepscode overslaan

    for (const groep of ev.groepen) {
      if (!map.has(ev.cursusNaam)) map.set(ev.cursusNaam, new Map());
      const groepMap = map.get(ev.cursusNaam);
      if (!groepMap.has(groep)) groepMap.set(groep, []);
      groepMap.get(groep).push(ev);
    }
  }

  return map;
}

function geselecteerdeEvents() {
  const resultaat = [];
  for (const [cursusNaam, groepCode] of keuze) {
    if (!groepCode) continue;
    const groepMap = cursusMap.get(cursusNaam);
    if (!groepMap) continue;
    const evs = groepMap.get(groepCode);
    if (evs) resultaat.push(...evs);
  }
  // Dedupliceer op uid (voorkomt valse conflicten bij dubbele iCal-entries)
  return resultaat.filter((ev, i, arr) => arr.findIndex(e => e.uid === ev.uid) === i);
}

// ── Conflicten berekenen ──────────────────────────────────────

function heeftOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function telConflicten(teCheckenEvents, geselecteerd) {
  let teller = 0;
  for (const ev of teCheckenEvents) {
    for (const sel of geselecteerd) {
      if (ev.uid !== sel.uid && heeftOverlap(ev, sel)) {
        teller++;
        break; // tel elk event maximaal één keer
      }
    }
  }
  return teller;
}

function berekenOverlapMinuten(a, b) {
  if (a.uid === b.uid || !heeftOverlap(a, b)) return 0;
  return (Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000;
}

function telOverlapMinuten(teCheckenEvents, geselecteerd) {
  let totaal = 0;
  for (const ev of teCheckenEvents) {
    for (const sel of geselecteerd) {
      totaal += berekenOverlapMinuten(ev, sel);
    }
  }
  return totaal;
}

function telTotaalOverlapMinuten(alleGeselecteerd) {
  let totaal = 0;
  for (let i = 0; i < alleGeselecteerd.length; i++) {
    for (let j = i + 1; j < alleGeselecteerd.length; j++) {
      totaal += berekenOverlapMinuten(alleGeselecteerd[i], alleGeselecteerd[j]);
    }
  }
  return totaal;
}

function formatUren(minuten) {
  if (minuten === 0) return '0u';
  const u = Math.floor(minuten / 60);
  const m = Math.round(minuten % 60);
  if (m === 0) return `${u}u`;
  return `${u}u${String(m).padStart(2, '0')}`;
}

function vindConflicterendeUids(alleGeselecteerd) {
  const uids = new Set();
  for (let i = 0; i < alleGeselecteerd.length; i++) {
    for (let j = i + 1; j < alleGeselecteerd.length; j++) {
      if (alleGeselecteerd[i].uid !== alleGeselecteerd[j].uid && heeftOverlap(alleGeselecteerd[i], alleGeselecteerd[j])) {
        uids.add(alleGeselecteerd[i].uid);
        uids.add(alleGeselecteerd[j].uid);
      }
    }
  }
  return uids;
}

// ── Hulpfunctie: schijf opzoeken van een vak via curriculumdata ──

function schijfVanVak(vakNaam) {
  if (!curriculumData || !curriculumData.vakken) return null;
  const genorm = normaliseerVakNaam(vakNaam);
  const vak = curriculumData.vakken.find(v => normaliseerVakNaam(v.naam) === genorm);
  return vak ? vak.schijf : null;
}

// Geeft de index terug van de geplaatste periode binnen vak.periode (0 = eerste, 1 = tweede …)
// Geeft null terug als het vak niet gevonden is, niet geplaatst is, of slechts één periode heeft.
function periodeIndexVanVak(vakNaam) {
  if (!curriculumData || !curriculumData.vakken) return null;
  const slot = trajectState[vakNaam];
  if (!slot || slot === 'zijbalk' || slot === 'behaald' || slot === 'vrijgesteld') return null;

  const genorm = normaliseerVakNaam(vakNaam);
  const vak = curriculumData.vakken.find(v => normaliseerVakNaam(v.naam) === genorm);
  if (!vak || !vak.periode || vak.periode.length <= 1) return null;

  // Haal de periode uit het slot-id: "j1-m3" → "M3"
  const deelPeriode = slot.split('-').slice(1).join('-').toUpperCase();
  const idx = vak.periode.findIndex(p => p.toUpperCase() === deelPeriode);
  return idx >= 0 ? idx : null;
}

// Filtert groepen op basis van de geplaatste periode:
//   index 0 (eerste periode) → verberg FEB-groepen
//   index > 0 (latere periode) → toon enkel FEB-groepen
// Geeft true als er geen periodebeperking van toepassing is.
function groepHoortBijPeriode(groepCode, vakNaam) {
  const idx = periodeIndexVanVak(vakNaam);
  if (idx === null) return true;
  const isFeb = groepCode.includes('FEB');
  return idx === 0 ? !isFeb : isFeb;
}

// ── Cursus-schijf wisselen (fase 2 sidebar) ───────────────────

function wisselCursusSchijf(schijf) {
  actiefCursusSchijf = schijf;
  document.querySelectorAll('.cursus-tab').forEach(tab => {
    tab.classList.toggle('actief', parseInt(tab.dataset.schijf) === schijf);
  });
  renderCursusLijst();
}

// ── Cursus-paneel renderen ────────────────────────────────────

function renderCursusLijst() {
  const lijst = document.getElementById('cursus-lijst');
  if (!lijst) return;
  lijst.innerHTML = '';

  const geselecteerd = geselecteerdeEvents();
  const conflictUids = vindConflicterendeUids(geselecteerd);
  const totaalMin = telTotaalOverlapMinuten(geselecteerd);

  // Chips bijwerken
  document.getElementById('chip-conflicten').textContent = conflictUids.size;
  document.getElementById('chip-uren').textContent = formatUren(totaalMin);

  // Conflict-kleur op chips
  document.getElementById('chip-conflicten-kaart')
    .classList.toggle('heeft-conflicten', conflictUids.size > 0);
  document.getElementById('chip-uren-kaart')
    .classList.toggle('heeft-conflicten', totaalMin > 0);

  // Sorteer cursussen alfabetisch
  const cursussen = [...cursusMap.keys()].sort();

  // Pre-pass: automatisch selecteren als er maar één groep beschikbaar is
  for (const naam of cursussen) {
    if (!keuze.has(naam) || keuze.get(naam)) continue;
    const groepen = [...cursusMap.get(naam).keys()].sort()
      .filter(groepHoortBijStudent)
      .filter(g => groepHoortBijPeriode(g, naam));
    if (groepen.length === 1) keuze.set(naam, groepen[0]);
  }

  let aantalZichtbaar = 0;

  for (const naam of cursussen) {
    // Toon alleen cursussen die in de keuze-map staan (gefilterd via fase 1)
    if (!keuze.has(naam)) continue;

    const groepMap = cursusMap.get(naam);
    const gekozen = keuze.get(naam) || '';
    const geselecteerdZonderDeze = geselecteerd.filter(
      ev => !(groepMap.get(gekozen) || []).includes(ev)
    );
    const overlapMin = gekozen
      ? telOverlapMinuten(groepMap.get(gekozen) || [], geselecteerdZonderDeze)
      : 0;

    // Filter op schijf (als curriculumdata beschikbaar is)
    const schijf = schijfVanVak(naam);
    if (schijf !== null && schijf !== actiefCursusSchijf) continue;

    aantalZichtbaar++;

    const kaart = document.createElement('div');
    kaart.className = 'cursus-kaart';

    // Bovenste rij: naam + conflict-badge naast elkaar (zoals vak-kaart-rij in fase 1)
    const rij = document.createElement('div');
    rij.className = 'cursus-kaart-rij';

    const naamEl = document.createElement('div');
    naamEl.className = 'cursus-naam';
    naamEl.textContent = naam;
    rij.appendChild(naamEl);

    if (gekozen && overlapMin > 0) {
      const badge = document.createElement('span');
      badge.className = 'conflict-badge heeft-conflicten';
      badge.textContent = `⚠ ${formatUren(overlapMin)}`;
      rij.appendChild(badge);
    }

    kaart.appendChild(rij);

    const select = document.createElement('select');
    const groepen = [...groepMap.keys()].sort()
      .filter(groepHoortBijStudent)
      .filter(g => groepHoortBijPeriode(g, naam));

    // Placeholder enkel tonen als er een echte keuze te maken valt
    if (groepen.length !== 1) {
      const leegOptie = document.createElement('option');
      leegOptie.value = '';
      leegOptie.textContent = '— kies een groep —';
      select.appendChild(leegOptie);
    }
    for (const groep of groepen) {
      const min = telOverlapMinuten(groepMap.get(groep), geselecteerdZonderDeze);
      const optie = document.createElement('option');
      optie.value = groep;
      optie.textContent = min === 0
        ? `${groep} — geen overlap`
        : `${groep} — ${formatUren(min)} overlap`;
      if (groep === gekozen) optie.selected = true;
      select.appendChild(optie);
    }

    select.addEventListener('change', () => {
      keuze.set(naam, select.value || null);
      updateAlles();
    });

    kaart.appendChild(select);
    lijst.appendChild(kaart);
  }

  // Melding als geen vakken zichtbaar
  if (aantalZichtbaar === 0) {
    const melding = document.createElement('p');
    melding.style.cssText = 'font-size:13px;color:var(--kleur-tekst-zacht);padding:8px 0';
    melding.textContent = cursusMap.size > 0
      ? 'Geen vakken geselecteerd in trajectplanner. Ga terug naar stap 1 om je traject samen te stellen.'
      : 'Rooster laden…';
    lijst.appendChild(melding);
  }
}

// ── Kalender renderen ─────────────────────────────────────────

function maandagVan(datum) {
  const d = new Date(datum);
  const dag = d.getDay(); // 0=zo, 1=ma, ...
  const verschil = dag === 0 ? -6 : 1 - dag;
  d.setDate(d.getDate() + verschil);
  d.setHours(0, 0, 0, 0);
  return d;
}

function datumOpmaak(datum) {
  return datum.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' });
}

function renderKalender() {
  if (!huidigWeekStart) return;

  const geselecteerd = geselecteerdeEvents();
  const conflictUids = vindConflicterendeUids(geselecteerd);

  // Week-label bijwerken
  const weekEind = new Date(huidigWeekStart);
  weekEind.setDate(weekEind.getDate() + 4);
  document.getElementById('week-label').textContent =
    `${datumOpmaak(huidigWeekStart)} – ${datumOpmaak(weekEind)}`;

  const container = document.getElementById('kalender');
  container.innerHTML = '';

  // Vandaag markeren
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);

  // ── Kolomkoppen ──
  const hoofd = document.createElement('div');
  hoofd.className = 'kalender-hoofd';

  const tijdHoofd = document.createElement('div');
  tijdHoofd.className = 'kalender-hoofd-cel';
  hoofd.appendChild(tijdHoofd);

  for (let i = 0; i < 5; i++) {
    const dagDatum = new Date(huidigWeekStart);
    dagDatum.setDate(dagDatum.getDate() + i);
    const cel = document.createElement('div');
    cel.className = 'kalender-hoofd-cel' +
      (dagDatum.getTime() === vandaag.getTime() ? ' vandaag' : '');
    cel.innerHTML = `<span>${DAGEN[i]}</span><span class="datum">${dagDatum.getDate()}</span>`;
    hoofd.appendChild(cel);
  }
  container.appendChild(hoofd);

  // ── Rijen ──
  const aantalUren = CONFIG.kalenderEindUur - CONFIG.kalenderStartUur;
  const totaalHoogte = aantalUren * UUR_HOOGTE_PX;

  const rijen = document.createElement('div');
  rijen.className = 'kalender-rijen';
  rijen.style.height = `${totaalHoogte}px`;

  // Tijdkolom
  const tijdkolom = document.createElement('div');
  tijdkolom.className = 'tijdkolom';
  for (let u = CONFIG.kalenderStartUur; u < CONFIG.kalenderEindUur; u++) {
    const label = document.createElement('div');
    label.className = 'tijdlabel';
    label.textContent = `${u}:00`;
    tijdkolom.appendChild(label);
  }
  rijen.appendChild(tijdkolom);

  // Dagkolommen
  for (let i = 0; i < 5; i++) {
    const dagDatum = new Date(huidigWeekStart);
    dagDatum.setDate(dagDatum.getDate() + i);

    const kolom = document.createElement('div');
    kolom.className = 'dagkolom';
    kolom.style.height = `${totaalHoogte}px`;

    // Uurlijnen
    for (let u = 0; u <= aantalUren; u++) {
      const lijn = document.createElement('div');
      lijn.className = 'uurlijn';
      lijn.style.top = `${u * UUR_HOOGTE_PX}px`;
      kolom.appendChild(lijn);

      if (u < aantalUren) {
        const halfLijn = document.createElement('div');
        halfLijn.className = 'uurlijn half';
        halfLijn.style.top = `${u * UUR_HOOGTE_PX + UUR_HOOGTE_PX / 2}px`;
        kolom.appendChild(halfLijn);
      }
    }

    // Events voor deze dag plaatsen
    const dagEvents = geselecteerd.filter(ev => {
      const evDag = new Date(ev.start);
      evDag.setHours(0, 0, 0, 0);
      return evDag.getTime() === dagDatum.getTime();
    });

    // Dedupliceer op uid (zelfde event kan via meerdere groepen binnenkomen)
    const gezienUids = new Set();
    const uniekeDagEvents = dagEvents.filter(ev => {
      if (gezienUids.has(ev.uid)) return false;
      gezienUids.add(ev.uid);
      return true;
    });

    const kolomInfo = wijsKolommenToe(uniekeDagEvents);

    for (const ev of uniekeDagEvents) {
      const info = kolomInfo.get(ev.uid) || { kolom: 0, totaal: 1 };
      const blok = maakEventBlok(ev, conflictUids, info.kolom, info.totaal);
      kolom.appendChild(blok);
    }

    rijen.appendChild(kolom);
  }

  container.appendChild(rijen);
}

function wijsKolommenToe(events) {
  const gesorteerd = events.slice().sort((a, b) => a.start - b.start);
  const kolomEinden = []; // kolomEinden[k] = eindtijd van laatste event in kolom k
  const toewijzing = new Map(); // uid → { kolom, totaal }

  for (const ev of gesorteerd) {
    let k = 0;
    while (kolomEinden[k] !== undefined && kolomEinden[k] > ev.start) k++;
    kolomEinden[k] = ev.end;
    toewijzing.set(ev.uid, { kolom: k, totaal: 0 });
  }

  const totaal = kolomEinden.length || 1;
  for (const waarde of toewijzing.values()) waarde.totaal = totaal;

  return toewijzing;
}

function minutenVanafStart(datum) {
  // Lokale tijd in minuten vanaf kalenderstart
  const uren = datum.getHours();
  const minuten = datum.getMinutes();
  return (uren - CONFIG.kalenderStartUur) * 60 + minuten;
}

function maakEventBlok(ev, conflictUids, kolom = 0, totaal = 1) {
  const startMin = minutenVanafStart(ev.start);
  const duurMin = (ev.end - ev.start) / 60000;

  const top = (startMin / 60) * UUR_HOOGTE_PX;
  const hoogte = Math.max((duurMin / 60) * UUR_HOOGTE_PX, 20);

  const isConflict = conflictUids.has(ev.uid);
  const isPlenair = ev.groepen.length === 0;

  const breedte = 100 / totaal;
  const links = kolom * breedte;

  const blok = document.createElement('div');
  blok.className = 'kalender-event' +
    (isPlenair ? ' plenair' : '') +
    (isConflict ? ' conflict' : '');
  blok.style.top = `${top}px`;
  blok.style.height = `${hoogte}px`;
  blok.style.left = `calc(${links}% + 2px)`;
  blok.style.right = 'auto';
  blok.style.width = `calc(${breedte}% - 4px)`;

  const tijdStr = `${tijdOpmaak(ev.start)}–${tijdOpmaak(ev.end)}`;

  blok.innerHTML = `
    <div class="event-naam">${ev.cursusNaam}</div>
    <div class="event-tijd">${tijdStr}</div>
    ${ev.groepen.length > 0 ? `<div class="event-groep">${ev.groepen[0]}</div>` : ''}
  `;

  if (ev.location) blok.title = ev.location;

  return blok;
}

function tijdOpmaak(datum) {
  return datum.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

// ── Week-navigatie ────────────────────────────────────────────

function verschuifWeek(stappen) {
  huidigWeekStart = new Date(huidigWeekStart);
  huidigWeekStart.setDate(huidigWeekStart.getDate() + stappen * 7);
  renderKalender();
}

// ── Alles updaten ─────────────────────────────────────────────

function updateAlles() {
  renderCursusLijst();
  renderKalender();
}

// ── Initialisatie ─────────────────────────────────────────────

document.getElementById('vorige-week').addEventListener('click', () => verschuifWeek(-1));
document.getElementById('volgende-week').addEventListener('click', () => verschuifWeek(1));

// Zijbalk-dropzones: eenmalig koppelen (elementen worden nooit opnieuw aangemaakt)
document.querySelectorAll('.vak-bak').forEach(bak => {
  bak.addEventListener('dragover', (e) => e.preventDefault());
  bak.addEventListener('drop', (e) => {
    e.preventDefault();
    const vakNaam = e.dataTransfer.getData('vak-naam');
    if (!vakNaam) return;
    trajectState[vakNaam] = 'zijbalk';
    renderFase1();
  });
});


document.getElementById('naar-fase1-van-fase0').addEventListener('click', () => {
  if (!huidigProgramma) {
    document.getElementById('student-opleiding').focus();
    return;
  }
  toonFase(1);
});
document.getElementById('terug-naar-fase0').addEventListener('click', () => toonFase(0));
document.getElementById('naar-fase2').addEventListener('click', () => {
  if (actieveVakken.size === 0) return;

  const schendingen = checkInclusiefMetSchendingen();
  if (schendingen.length > 0) {
    const berichten = schendingen.map(s =>
      `• ${s.groep.join(', ')}: nog niet ingepland: ${s.ontbrekend.join(', ')}`
    );
    alert('Sommige vakken moeten samen worden opgenomen:\n\n' + berichten.join('\n'));
    return;
  }

  toonFase(2);
});
document.getElementById('naar-fase1').addEventListener('click', () => toonFase(1));

document.querySelectorAll('.schijf-tab').forEach(tab => {
  tab.addEventListener('click', () => wisselSchijfTab(parseInt(tab.dataset.schijf)));
});

document.querySelectorAll('.cursus-tab').forEach(tab => {
  tab.addEventListener('click', () => wisselCursusSchijf(parseInt(tab.dataset.schijf)));
});

document.getElementById('laad-handmatig').addEventListener('click', () => {
  const tekst = document.getElementById('ics-invoer').value.trim();
  if (tekst) {
    document.getElementById('laad-melding').classList.add('verborgen');
    verwerkIcalTekst(tekst);
  }
});

// ── PDF-export ────────────────────────────────────────────────

// Verkort tekst tot maxBreedte (mm) en voegt '…' toe als het niet past.
function truncateTekstPDF(doc, tekst, maxBreedte) {
  if (doc.getTextWidth(tekst) <= maxBreedte) return tekst;
  let verkort = tekst;
  while (verkort.length > 1 && doc.getTextWidth(verkort + '…') > maxBreedte) {
    verkort = verkort.slice(0, -1);
  }
  return verkort + '…';
}

// Tekent één periodekaart (koptekstbalk + vakkenlijst) op het PDF-canvas.
function tekenPeriodeKaart(doc, x, y, breedte, hoogte, label, vakken) {
  doc.setFillColor('#e8f0f8');
  doc.setDrawColor('#dde2ec');
  doc.setLineWidth(0.3);
  doc.rect(x, y, breedte, hoogte, 'FD');

  doc.setFillColor('#2c5f8a');
  doc.rect(x, y, breedte, 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor('#ffffff');
  doc.text(label, x + breedte / 2, y + 4, { align: 'center' });

  if (vakken.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor('#64707f');
    doc.text('—', x + breedte / 2, y + 11, { align: 'center' });
    return;
  }

  let vakY = y + 8.5;
  for (const vak of vakken) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#1e2533');
    const tekst = truncateTekstPDF(doc, `${vak.naam}  (${vak.studiepunten} SP)`, breedte - 4);
    doc.text(tekst, x + 2, vakY);
    vakY += 5;
  }
}

// Genereert een A4-landschaps-PDF en start de download.
function exporteerPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const BREEDTE = 297;
  const MARGE = 15;
  const INHOUD_B = BREEDTE - 2 * MARGE;
  let y = MARGE;

  // ── Koptekst ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor('#2c5f8a');
  doc.text('GRA Trajectbeheer Tool — Leertraject', MARGE, y + 2);

  const datum = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#64707f');
  doc.text(`${CONFIG.academiejaar}  ·  Gegenereerd op ${datum}`, BREEDTE - MARGE, y + 2, { align: 'right' });

  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor('#1e2533');
  doc.text(studentNaam || '—', MARGE, y);

  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#64707f');
  let infoRegel = `GRA ${huidigProgramma} — ${CONFIG.programmaLabels[huidigProgramma] || huidigProgramma}`;
  if (studentAfstudeerrichting) infoRegel += `   ·   Afstudeerrichting: ${studentAfstudeerrichting}`;
  if (studentKeuzetraject) infoRegel += `   ·   Keuzetraject: ${studentKeuzetraject}`;
  doc.text(infoRegel, MARGE, y);

  y += 5;

  doc.setDrawColor('#dde2ec');
  doc.setLineWidth(0.3);
  doc.line(MARGE, y, BREEDTE - MARGE, y);
  y += 5;

  // ── SP-statusbalk ──
  const { behaald: spBehaald, vrijgesteld: spVrijgesteld, traject: spTraject } = berekenSpTotalen();
  // PDF toont hoeveel SP van de gefilterde vakken nog ingepland moeten worden
  const spResterend = gefilterdVakken()
    .filter(v => !actieveVakken.has(v.naam) && trajectState[v.naam] !== 'behaald' && trajectState[v.naam] !== 'vrijgesteld')
    .reduce((som, v) => som + v.studiepunten, 0);

  const spData = [
    { label: 'Behaald', waarde: spBehaald },
    { label: 'Vrijgesteld', waarde: spVrijgesteld },
    { label: 'In traject', waarde: spTraject },
    { label: 'Nog op te nemen', waarde: spResterend },
  ];

  const spTussenruimte = 3;
  const spKaartB = (INHOUD_B - spTussenruimte * 3) / 4;
  const spKaartH = 13;

  for (let i = 0; i < spData.length; i++) {
    const kx = MARGE + i * (spKaartB + spTussenruimte);
    doc.setFillColor('#e8f0f8');
    doc.setDrawColor('#dde2ec');
    doc.setLineWidth(0.2);
    doc.roundedRect(kx, y, spKaartB, spKaartH, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#2c5f8a');
    doc.text(spData[i].label, kx + spKaartB / 2, y + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor('#2c5f8a');
    doc.text(`${spData[i].waarde} SP`, kx + spKaartB / 2, y + 10.5, { align: 'center' });
  }

  y += spKaartH + 6;

  // ── Tijdlijn ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#1e2533');
  doc.text('Leertraject — Jaar 1', MARGE, y);
  y += 4;

  const SLOT_DELEN = ['m1', 'm2', 'm3', 'm4', 's1', 's2', 'j'];
  const PERIODE_LABELS_TL = {
    m1: 'Module 1', m2: 'Module 2', m3: 'Module 3', m4: 'Module 4',
    s1: 'Semester 1', s2: 'Semester 2', j: 'Volledig jaar',
  };

  const perPeriode = {};
  for (const p of SLOT_DELEN) perPeriode[p] = [];
  for (const vak of vakken) {
    const slot = trajectState[vak.naam];
    if (!slot || !slot.startsWith('j1-')) continue;
    const deel = slot.slice(3);
    if (perPeriode[deel]) perPeriode[deel].push(vak);
  }

  const TL_HEADER_H = 6;
  const TL_VAK_H = 5;
  const TL_MIN_H = 14;
  const TL_GAP = 2;

  const rijHoogte = (...periodes) =>
    Math.max(TL_MIN_H, TL_HEADER_H + Math.max(...periodes.map(p => perPeriode[p].length)) * TL_VAK_H + 2);

  const rij1H = rijHoogte('m1', 'm2', 'm3', 'm4');
  const rij2H = rijHoogte('s1', 's2');
  const rij3H = rijHoogte('j');

  const colB = INHOUD_B / 4;

  for (let m = 0; m < 4; m++) {
    tekenPeriodeKaart(doc, MARGE + m * colB, y, colB - TL_GAP, rij1H,
      PERIODE_LABELS_TL[`m${m + 1}`], perPeriode[`m${m + 1}`]);
  }
  y += rij1H + TL_GAP;

  for (let s = 0; s < 2; s++) {
    tekenPeriodeKaart(doc, MARGE + s * colB * 2, y, colB * 2 - TL_GAP, rij2H,
      PERIODE_LABELS_TL[`s${s + 1}`], perPeriode[`s${s + 1}`]);
  }
  y += rij2H + TL_GAP;

  tekenPeriodeKaart(doc, MARGE, y, INHOUD_B - TL_GAP, rij3H,
    PERIODE_LABELS_TL['j'], perPeriode['j']);
  y += rij3H + 6;

  // ── Groepenlijst ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#1e2533');
  doc.text('Groepindeling', MARGE, y);
  y += 4;

  const tabelRijen = [];
  for (const vak of vakken) {
    if (!actieveVakken.has(vak.naam)) continue;
    const slot = trajectState[vak.naam];
    const deel = slot && slot.startsWith('j1-') ? slot.slice(3).toUpperCase() : '—';

    let groep = '—';
    const genorm = normaliseerVakNaam(vak.naam);
    for (const [cursusNaam, groepCode] of keuze) {
      if (normaliseerVakNaam(cursusNaam) === genorm && groepCode) {
        groep = groepCode;
        break;
      }
    }

    const volgorde = SLOT_DELEN.indexOf(slot?.slice(3));
    tabelRijen.push({ naam: vak.naam, sp: vak.studiepunten, periode: deel, groep, volgorde });
  }

  tabelRijen.sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam));

  doc.autoTable({
    startY: y,
    margin: { left: MARGE, right: MARGE },
    head: [['Vak', 'SP', 'Periode', 'Groep']],
    body: tabelRijen.map(r => [r.naam, r.sp, r.periode, r.groep]),
    theme: 'grid',
    headStyles: { fillColor: [44, 95, 138], textColor: [255, 255, 255], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 37, 51] },
    alternateRowStyles: { fillColor: [232, 240, 248] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 55 },
    },
  });

  const bestandsnaam = `traject-${(studentNaam || 'student').replace(/\s+/g, '-').toLowerCase()}.pdf`;
  doc.save(bestandsnaam);
}

document.getElementById('exporteer-pdf').addEventListener('click', exporteerPDF);

// Opstart: initialiseer formulier (geen programma geselecteerd bij start)
initialiseerGegevensFormulier();
toonFase(huidigeFase);
