/**
 * Tiny locale table. The language is picked once at load from the browser,
 * because config-schema titles are static and cannot follow a reactive hook.
 */
export type Locale = "en" | "nl" | "de" | "fr";

/** Exported so a test can check that every language carries every key. */
export const STRINGS = {
  en: {
    cameras: "Cameras",
    live: "Live",
    off: "Off",
    noStream: "No stream",
    noCameras: "No cameras",
    noCamerasHelp: "Hold the tile and pick one or more cameras",
    unavailable: "Unavailable",
    cfgCameras: "Cameras",
    cfgCamerasDesc: "The order here is the order on the tile.",
    cfgLayout: "Layout",
    cfgLayoutDesc: "One camera, the first two side by side, or all of them in turn.",
    cfgInterval: "Seconds per camera",
    cfgIntervalDesc: "How long each camera stays when rotating.",
    cfgShowName: "Show name",
    cfgShowNameDesc: "Camera name over the picture.",
    prev: "Previous",
    next: "Next",
  },
  nl: {
    cameras: "Camera's",
    live: "Live",
    off: "Uit",
    noStream: "Geen stream",
    noCameras: "Geen camera's",
    noCamerasHelp: "Houd de tegel vast en kies een of meer camera's",
    unavailable: "Niet beschikbaar",
    cfgCameras: "Camera's",
    cfgCamerasDesc: "De volgorde hier is de volgorde op de tegel.",
    cfgLayout: "Weergave",
    cfgLayoutDesc: "Eén camera, de eerste twee naast elkaar, of alle om de beurt.",
    cfgInterval: "Seconden per camera",
    cfgIntervalDesc: "Hoe lang elke camera blijft staan bij roteren.",
    cfgShowName: "Naam tonen",
    cfgShowNameDesc: "Cameranaam over het beeld.",
    prev: "Vorige",
    next: "Volgende",
  },
  de: {
    cameras: "Kameras",
    live: "Live",
    off: "Aus",
    noStream: "Kein Stream",
    noCameras: "Keine Kameras",
    noCamerasHelp: "Kachel gedrückt halten und Kameras auswählen",
    unavailable: "Nicht verfügbar",
    cfgCameras: "Kameras",
    cfgCamerasDesc: "Die Reihenfolge hier ist die Reihenfolge auf der Kachel.",
    cfgLayout: "Anordnung",
    cfgLayoutDesc: "Eine Kamera, die ersten zwei nebeneinander oder alle im Wechsel.",
    cfgInterval: "Sekunden pro Kamera",
    cfgIntervalDesc: "Wie lange jede Kamera beim Wechseln stehen bleibt.",
    cfgShowName: "Name anzeigen",
    cfgShowNameDesc: "Kameraname über dem Bild.",
    prev: "Zurück",
    next: "Weiter",
  },
  fr: {
    cameras: "Caméras",
    live: "Direct",
    off: "Arrêt",
    noStream: "Pas de flux",
    noCameras: "Aucune caméra",
    noCamerasHelp: "Maintenez la tuile et choisissez une ou plusieurs caméras",
    unavailable: "Indisponible",
    cfgCameras: "Caméras",
    cfgCamerasDesc: "L'ordre ici est l'ordre sur la tuile.",
    cfgLayout: "Disposition",
    cfgLayoutDesc: "Une caméra, les deux premières côte à côte, ou toutes à tour de rôle.",
    cfgInterval: "Secondes par caméra",
    cfgIntervalDesc: "Durée d'affichage de chaque caméra en rotation.",
    cfgShowName: "Afficher le nom",
    cfgShowNameDesc: "Nom de la caméra sur l'image.",
    prev: "Précédente",
    next: "Suivante",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type StringKey = keyof (typeof STRINGS)["en"];

export function detectLocale(tag: string | undefined): Locale {
  const lang = (tag ?? "en").toLowerCase().slice(0, 2);
  return lang === "nl" || lang === "de" || lang === "fr" ? lang : "en";
}

let current: Locale = detectLocale(typeof navigator !== "undefined" ? navigator.language : undefined);

export function setLocale(l: Locale): void {
  current = l;
}

export function t(key: StringKey): string {
  return STRINGS[current][key] ?? STRINGS.en[key];
}
