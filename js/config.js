// GRA Trajectbeheer Tool — Configuratie
// Pas dit bestand aan bij elke start van een nieuw academiejaar.

const CONFIG = {

  // Huidig academiejaar (louter informatief, verschijnt op de PDF-export)
  academiejaar: '2025–2026',

  // iCal-URLs per programma (gegenereerd door TimeEdit)
  // Vervang deze bij het begin van elk academiejaar.
  programmaUrls: {
    AAD: 'https://cloud.timeedit.net/ahs_be/web/teacher/ri65n002Qw9Z60Q0Qt6n81k1549Q0Z6djY4y1ZwQ6Y705Y4X05oZ5QC00E22B6D888A7lBA2CZjF222E36E48AC5659t0E7C9.ics',
    MCS: 'https://cloud.timeedit.net/ahs_be/web/teacher/ri65n502Qw9Z60Q0Qt6n81k5549Q0Z6djY4y1ZwQ6Y705Y4X05oZ5Q50892B76648831lB610Zj92E901BF8411C851t00CCF.ics',
    TRL: 'https://cloud.timeedit.net/ahs_be/web/teacher/ri6Y0461yY5ZX6Q9nZ5Z0Q50544dQ92tn05Z6wYQQ77140jw5k480t484E0EQ099o21F5FB4506FlD0EA653E882Aj6Z8E8F093.ics',
  },

  // Volledige naam per programmacode (gebruikt in UI en PDF-export)
  programmaLabels: {
    AAD: 'Accounting & Administration',
    MCS: 'Marketing- en Communicatiesupport',
    TRL: 'Transport en Logistiek',
  },

  // Regex die groepscodes per programma herkent in de iCal SUMMARY
  groepPrefix: {
    AAD: /^AADG_/,
    MCS: /^MCS_/,
    TRL: /^TRLG_/,
  },

  // Handmatige naam-mapping: iCal-cursusnaam → cursusnaam in het curriculum.
  // Alleen nodig als TimeEdit een andere naam gebruikt dan het curriculum-JSON.
  // Voorbeeld: { 'Boekhouden (intro)': 'Boekhouden' }
  naamMapping: {
    AAD: {},
    MCS: {},
    TRL: {},
  },

  // Zichtbaar tijdsvenster in de weekkalender (uren, lokale tijd)
  kalenderStartUur: 8,   // 08:00
  kalenderEindUur:  21,  // 21:00

};
