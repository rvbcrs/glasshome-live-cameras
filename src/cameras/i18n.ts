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
    rec: "Rec",
    off: "Off",
    noStream: "No stream",
    noCameras: "No cameras",
    noCamerasHelp: "Hold the tile and pick one or more cameras",
    unavailable: "Unavailable",
    motion: "Motion",
    doorbell: "Doorbell",
    ago: "{s} s ago",
    mute: "Mute",
    unmute: "Sound",
    cfgCameras: "Cameras",
    cfgCamerasDesc: "The order here is the order on the tile.",
    cfgLayout: "Layout",
    cfgLayoutDesc: "One camera, two side by side, four in a grid, or all of them in turn.",
    cfgInterval: "Seconds per camera",
    cfgIntervalDesc: "How long each camera stays when rotating.",
    cfgFit: "Picture",
    cfgFitDesc: "Fill the tile and crop, or fit the whole picture with bars.",
    cfgMotion: "Jump on motion",
    cfgMotionDesc: "Show the camera whose motion or doorbell sensor fires. Sensors are found on the camera's own device.",
    cfgHold: "Seconds to hold",
    cfgHoldDesc: "How long a camera stays after motion, a doorbell or a tap.",
    cfgShowName: "Show name",
    cfgShowNameDesc: "Camera name over the picture.",
    prev: "Previous",
    next: "Next",
  },
  nl: {
    cameras: "Camera's",
    live: "Live",
    rec: "Opn",
    off: "Uit",
    noStream: "Geen stream",
    noCameras: "Geen camera's",
    noCamerasHelp: "Houd de tegel vast en kies een of meer camera's",
    unavailable: "Niet beschikbaar",
    motion: "Beweging",
    doorbell: "Deurbel",
    ago: "{s} s geleden",
    mute: "Dempen",
    unmute: "Geluid",
    cfgCameras: "Camera's",
    cfgCamerasDesc: "De volgorde hier is de volgorde op de tegel.",
    cfgLayout: "Weergave",
    cfgLayoutDesc: "Eén camera, twee naast elkaar, vier in een raster, of alle om de beurt.",
    cfgInterval: "Seconden per camera",
    cfgIntervalDesc: "Hoe lang elke camera blijft staan bij roteren.",
    cfgFit: "Beeld",
    cfgFitDesc: "De tegel vullen en bijsnijden, of het hele beeld passend met balken.",
    cfgMotion: "Springen bij beweging",
    cfgMotionDesc: "Toon de camera waarvan de bewegings- of deurbelsensor afgaat. Sensoren worden op het apparaat van de camera gevonden.",
    cfgHold: "Seconden vasthouden",
    cfgHoldDesc: "Hoe lang een camera blijft staan na beweging, de deurbel of een tik.",
    cfgShowName: "Naam tonen",
    cfgShowNameDesc: "Cameranaam over het beeld.",
    prev: "Vorige",
    next: "Volgende",
  },
  de: {
    cameras: "Kameras",
    live: "Live",
    rec: "Aufn",
    off: "Aus",
    noStream: "Kein Stream",
    noCameras: "Keine Kameras",
    noCamerasHelp: "Kachel gedrückt halten und Kameras auswählen",
    unavailable: "Nicht verfügbar",
    motion: "Bewegung",
    doorbell: "Türklingel",
    ago: "vor {s} s",
    mute: "Stumm",
    unmute: "Ton",
    cfgCameras: "Kameras",
    cfgCamerasDesc: "Die Reihenfolge hier ist die Reihenfolge auf der Kachel.",
    cfgLayout: "Anordnung",
    cfgLayoutDesc: "Eine Kamera, zwei nebeneinander, vier im Raster oder alle im Wechsel.",
    cfgInterval: "Sekunden pro Kamera",
    cfgIntervalDesc: "Wie lange jede Kamera beim Wechseln stehen bleibt.",
    cfgFit: "Bild",
    cfgFitDesc: "Kachel füllen und beschneiden, oder das ganze Bild mit Balken einpassen.",
    cfgMotion: "Bei Bewegung wechseln",
    cfgMotionDesc: "Zeigt die Kamera, deren Bewegungs- oder Klingelsensor auslöst. Sensoren werden am Gerät der Kamera gefunden.",
    cfgHold: "Sekunden halten",
    cfgHoldDesc: "Wie lange eine Kamera nach Bewegung, Klingel oder Tippen stehen bleibt.",
    cfgShowName: "Name anzeigen",
    cfgShowNameDesc: "Kameraname über dem Bild.",
    prev: "Zurück",
    next: "Weiter",
  },
  fr: {
    cameras: "Caméras",
    live: "Direct",
    rec: "Enr",
    off: "Arrêt",
    noStream: "Pas de flux",
    noCameras: "Aucune caméra",
    noCamerasHelp: "Maintenez la tuile et choisissez une ou plusieurs caméras",
    unavailable: "Indisponible",
    motion: "Mouvement",
    doorbell: "Sonnette",
    ago: "il y a {s} s",
    mute: "Muet",
    unmute: "Son",
    cfgCameras: "Caméras",
    cfgCamerasDesc: "L'ordre ici est l'ordre sur la tuile.",
    cfgLayout: "Disposition",
    cfgLayoutDesc: "Une caméra, deux côte à côte, quatre en grille, ou toutes à tour de rôle.",
    cfgInterval: "Secondes par caméra",
    cfgIntervalDesc: "Durée d'affichage de chaque caméra en rotation.",
    cfgFit: "Image",
    cfgFitDesc: "Remplir la tuile en rognant, ou montrer toute l'image avec des bandes.",
    cfgMotion: "Basculer sur mouvement",
    cfgMotionDesc: "Affiche la caméra dont le capteur de mouvement ou la sonnette se déclenche. Les capteurs sont trouvés sur l'appareil de la caméra.",
    cfgHold: "Secondes de maintien",
    cfgHoldDesc: "Durée pendant laquelle une caméra reste après un mouvement, la sonnette ou un appui.",
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

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[current][key] ?? STRINGS.en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
