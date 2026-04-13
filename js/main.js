// GRA Trajectbeheer Tool — Kernlogica

const ICAL_URL = 'https://cloud.timeedit.net/ahs_be/web/teacher/ri650015Q89Z65Q0dn6t64015o948Zkj5Zly1ZnQQY72804Qj6205DA0E4977ZA284A10F6E50t100478082D47A6Q310.ics';
const DAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
const KALENDER_START_UUR = 7;   // 07:00
const KALENDER_EIND_UUR = 20;   // 20:00
const UUR_HOOGTE_PX = 48;       // pixels per uur

// Staat
let events = [];
let cursusMap = new Map(); // courseName → Map<groupCode, Event[]>
let keuze = new Map();     // courseName → groupCode | null
let huidigWeekStart = null;

// ── iCal ophalen ─────────────────────────────────────────────

async function laadRooster() {
  try {
    const response = await fetch(ICAL_URL);
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
  keuze = new Map();

  // Begin op de eerste week met events
  const eersteEvent = events.slice().sort((a, b) => a.start - b.start)[0];
  huidigWeekStart = eersteEvent
    ? maandagVan(eersteEvent.start)
    : maandagVan(new Date());

  document.getElementById('laad-status').remove?.();
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
  return summary
    .split('\\,')
    .map(s => s.trim())
    .filter(s => /^AADG_/.test(s));
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
  return resultaat;
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

function vindConflicterendeUids(alleGeselecteerd) {
  const uids = new Set();
  for (let i = 0; i < alleGeselecteerd.length; i++) {
    for (let j = i + 1; j < alleGeselecteerd.length; j++) {
      if (heeftOverlap(alleGeselecteerd[i], alleGeselecteerd[j])) {
        uids.add(alleGeselecteerd[i].uid);
        uids.add(alleGeselecteerd[j].uid);
      }
    }
  }
  return uids;
}

// ── Cursus-paneel renderen ────────────────────────────────────

function renderCursusLijst() {
  const paneel = document.getElementById('cursus-paneel');
  paneel.innerHTML = '';

  const geselecteerd = geselecteerdeEvents();

  // Sorteer cursussen alfabetisch
  const cursussen = [...cursusMap.keys()].sort();

  for (const naam of cursussen) {
    const groepMap = cursusMap.get(naam);
    const gekozen = keuze.get(naam) || '';
    const conflicten = gekozen
      ? telConflicten(
          groepMap.get(gekozen) || [],
          geselecteerd.filter(ev => !(groepMap.get(gekozen) || []).includes(ev))
        )
      : 0;

    const kaart = document.createElement('div');
    kaart.className = 'cursus-kaart';

    const naamEl = document.createElement('div');
    naamEl.className = 'cursus-naam';
    naamEl.textContent = naam;
    kaart.appendChild(naamEl);

    const select = document.createElement('select');
    const leegOptie = document.createElement('option');
    leegOptie.value = '';
    leegOptie.textContent = '— kies een groep —';
    select.appendChild(leegOptie);

    // Bereken conflictscore per groep voor de opties
    const geselecteerdZonderDeze = geselecteerd.filter(
      ev => !(groepMap.get(gekozen) || []).includes(ev)
    );

    const groepen = [...groepMap.keys()].sort();
    for (const groep of groepen) {
      const score = telConflicten(groepMap.get(groep), geselecteerdZonderDeze);
      const optie = document.createElement('option');
      optie.value = groep;
      optie.textContent = `${groep} — ${score} conflict${score !== 1 ? 'en' : ''}`;
      if (groep === gekozen) optie.selected = true;
      select.appendChild(optie);
    }

    select.addEventListener('change', () => {
      keuze.set(naam, select.value || null);
      updateAlles();
    });

    kaart.appendChild(select);

    // Conflict-badge voor de huidige keuze
    if (gekozen) {
      const badge = document.createElement('span');
      badge.className = 'conflict-badge' + (conflicten > 0 ? ' heeft-conflicten' : '');
      badge.textContent = conflicten === 0
        ? '✓ geen conflicten'
        : `⚠ ${conflicten} conflict${conflicten !== 1 ? 'en' : ''}`;
      kaart.appendChild(badge);
    }

    paneel.appendChild(kaart);
  }

  // Totaal
  const totaal = geselecteerd.length > 0
    ? vindConflicterendeUids(geselecteerd).size / 2
    : 0;
  let footer = document.getElementById('conflict-totaal');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'conflict-totaal';
    document.querySelector('main').after(footer);
  }
  const aantalConflicten = vindConflicterendeUids(geselecteerd).size;
  footer.className = aantalConflicten > 0 ? 'heeft-conflicten' : '';
  footer.textContent = aantalConflicten === 0
    ? 'Geen overlappingen in huidig rooster'
    : `⚠ ${aantalConflicten} overlappende les${aantalConflicten !== 1 ? 'sen' : ''} in huidig rooster`;
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
  const aantalUren = KALENDER_EIND_UUR - KALENDER_START_UUR;
  const totaalHoogte = aantalUren * UUR_HOOGTE_PX;

  const rijen = document.createElement('div');
  rijen.className = 'kalender-rijen';
  rijen.style.height = `${totaalHoogte}px`;

  // Tijdkolom
  const tijdkolom = document.createElement('div');
  tijdkolom.className = 'tijdkolom';
  for (let u = KALENDER_START_UUR; u < KALENDER_EIND_UUR; u++) {
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
    const uniekeDagEvents = dagEvents.filter(
      (ev, i, arr) => arr.findIndex(e => e.uid === ev.uid) === i
    );

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
  // Ken elke event een kolomnummer toe zodat overlappende events naast elkaar staan
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
  return (uren - KALENDER_START_UUR) * 60 + minuten;
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

document.getElementById('laad-handmatig').addEventListener('click', () => {
  const tekst = document.getElementById('ics-invoer').value.trim();
  if (tekst) {
    document.getElementById('laad-melding').classList.add('verborgen');
    verwerkIcalTekst(tekst);
  }
});

laadRooster();
