# Hot Pot Go – Fahrplan

Grundlage ist das Spielkonzept vom 20.11.2026 (Restaurant-Simulation für Steam, allein
oder mit bis zu vier Spielern: kochen, bedienen, bestellen, ausbauen). Das Konzept ist
die Richtung, nicht jede Einzelheit ist verbindlich.

Dieser Fahrplan hält fest, was davon schon im Spiel ist und in welcher Reihenfolge der
Rest dran kommt. Er wird nach jeder Etappe aktualisiert.

## Leitlinien aus dem Konzept

- Jede wichtige Tätigkeit passiert in der 3D-Welt, nicht in Menüs.
- Kochen ist das Herzstück: Zutaten holen, schneiden, in den Topf, Brühe, Hitze,
  rühren, würzen. Kein „Knopf drücken und warten“.
- Ein Topf Eintopf ergibt 20 Portionen, die einzeln in Schüsseln geschöpft werden.
- Schräges, abgenutztes Restaurant, keine asiatische Thematik, vorhandener Stil bleibt.
- Kleine, vollständig spielbare Schritte. Keine Knöpfe, die nichts tun.
- Einzelspieler und Mehrspieler nutzen dieselben Regeln; nur das Netzwerk kommt dazu.

## Stand von Phase 1 (spielbarer Kern)

| Nr. | Punkt aus dem Konzept | Stand |
|---|---|---|
| 1 | Begehbares Restaurant mit Küche und Gastraum | fertig |
| 2 | Spielerbewegung und Kamera | fertig |
| 3 | Gegenstände aufnehmen und ablegen | fertig: F nimmt auf und legt ab (Zutaten, Schüsseln auf den Arbeitsflächen; Besen überall), E benutzt |
| 4 | Kühlschrank und Zutaten | teilweise: Kartoffeln, Karotten, Zwiebeln als einzelne Gegenstände aus drei Kisten in der Vorratsecke der Küche, mit Vorrat (je 6), der am Computer nachbestellt wird; Kühlschrank noch ohne Funktion |
| 5 | Interaktives Schneidebrett | fertig: das Hackbrett auf der Arbeitsinsel; Gemüse mit F darauflegen, das Beil daneben mit F nehmen |
| 6 | Gemüse schneiden | fertig: linke Maustaste startet, Maus seitwärts setzt das Messer, Maus nach unten schneidet; Karotte in Scheiben (5 Schnitte), Kartoffel in Würfel (3 + 3, wird gedreht), Zwiebel in Stücke (2 + 3); Schnittgeräusch; gleichmäßige Schnitte geben bessere Qualität |
| 7 | Zutaten in den Topf geben | fertig: nur geschnittenes Gemüse, die Stücke liegen so im Topf, wie sie geschnitten wurden |
| 8 | Brühe hinzufügen | fertig: Krug vom Herd nehmen (F), linke Maustaste, Maus nach unten kippt den Krug; im Topf zeigt eine Linie die nötige Menge; zu wenig Brühe lässt es schneller ansetzen, zu viel macht es wässrig |
| 9 | Herdtemperatur einstellen | vereinfacht auf Wunsch: E am Herd schaltet an und aus; ohne Rühren setzt es an |
| 10 | Umrühren und Garzeit überwachen | fertig: linke Maustaste am Topf, Maus im Kreis führt die Kelle; ohne Rühren setzt der Eintopf an und brennt dann an; 40 Sekunden Köcheln; Würzen mit dem Streuer (3 Stöße sind richtig) |
| 11 | Fertiger Eintopf mit genau 20 Portionen | fertig: genau 20 Portionen (getestet), Füllstand sinkt sichtbar; angebrannter Eintopf muss weggeworfen werden; Qualität aus Schnitt, Brühe, Würze und Anbrennen bestimmt das Trinkgeld |
| 12 | Schüssel nehmen und Portion einfüllen | fertig: leere Schüssel vom Stapel, Schöpfkelle füllt eine Portion ein; Schüsseln kommen nach dem Essen von selbst zurück (Spülen folgt später) |
| 13 | Kunden treten ein und setzen sich | fertig: solange geöffnet ist, kommen Gäste einzeln durch die Eingangstür, gehen zu ihrem Platz und setzen sich; jeder der acht Gäste hat noch seinen festen Stuhl |
| 14 | Bestellung entgegennehmen | teilweise: Gäste lesen kurz die Karte (drei Punkte) und bestellen dann von selbst mit einer Blase |
| 15 | Essen zum Tisch bringen | fertig |
| 16 | Kunden bezahlen lassen | fertig: 9 € pro Portion plus Trinkgeld für schnelle Bedienung, Startgeld 250 € |
| 17 | Geduldsanzeige und Verlassen des Restaurants | fertig: nach dem Bezahlen oder wenn die Geduld aufgebraucht ist, stehen sie auf und gehen durch die Tür hinaus |
| 18 | Einfache Tagesabrechnung | fertig: Tag mit Uhr (11 bis 21 Uhr), Feierabend, Abrechnungszettel mit Gästen, Verkauf, Trinkgeld, Zutatenkosten, Tagesgewinn und Kassenstand; danach beginnt der nächste Tag |
| 19 | Speichern und Laden | fertig: das Spiel speichert von selbst (alle 20 Sekunden, bei jedem Abschnitt des Tages, beim Schließen des Fensters) und bietet beim Start „Continue“ oder „New restaurant“ an; Sicherungskopie vom Vortag; ein Pausenmenü mit eigenem Speichern-Punkt fehlt noch |

Schon vorhanden, obwohl erst für später geplant: Flecken auf dem Boden und Kehren mit
dem Besen; Büro mit Computer, Lagerraum und Putzkammer als Räume (noch ohne Funktion).

Technische Grundlage, die zum Konzept passt: Der Zustand des Restaurants (Bestellungen,
Topf, Geld, was der Koch trägt) liegt an einer Stelle in `restaurant.js`, und jede
Änderung läuft über eine Aktion. Darauf kann später ein Mehrspieler-Modus aufsetzen, in
dem der Gastgeber die Aktionen prüft.

## Reihenfolge der nächsten Etappen

1. **Kochen, Teil 1 – Zutaten und 20 Portionen.** Erledigt (20.11.2026).
2. **Kochen, Teil 2 – Schneiden.** Erledigt (20.11.2026). Die Schnittqualität aller Zutaten
   bestimmt die Qualität des Topfes und damit das Trinkgeld.
3. **Kochen, Teil 3 – Brühe, Hitze, Rühren.** Erledigt (20.11.2026). Das Restaurant wird mit E
   an der Eingangstür geöffnet und geschlossen; Gäste bestellen nur, solange geöffnet ist.
   Brühe gibt es als Vorrat (reicht für etwa sechs Töpfe), der Krug wird daraus nachgefüllt.
4. **Gäste kommen und gehen.** Erledigt (20.11.2026). Offen: freie Platzwahl (jeder hat noch
   seinen festen Stuhl), Gäste weichen nur dem Koch aus, nicht einander.
5. **Der Tag.** Erledigt (20.11.2026): Uhr, Öffnen und Schließen, Tagesabrechnung, Speichern
   und Laden. Damit ist das Abnahmekriterium von Phase 1 erfüllt: Spiel starten, Eintopf
   kochen, Gäste bedienen, Geld verdienen, den Tag beenden, Fortschritt speichern.

Offen aus Phase 1 (bewusst vereinfacht): Kühlschrank ohne Funktion, Bestellung am Tisch
aufnehmen, freie Platzwahl der Gäste, Spülen, Pausenmenü.

## Stand von Phase 2 (Restaurant-Management)

| Nr. | Punkt aus dem Konzept | Stand |
|---|---|---|
| 1 | Voll funktionsfähiger Restaurant-Computer | teilweise: der Computer im Büro hat einen eigenen Bildschirm mit zwei Programmen, „Supplies“ (bestellen) und „Accounts“ (heutige Zahlen und frühere Tage); Shop, Restaurantverwaltung, Bewertungen fehlen |
| 2 | Zutaten bestellen | fertig: Menge wählen, Summe, Kassenstand, bestellen |
| 3 | Warenlieferung und Lagerverwaltung | teilweise: Lieferung kommt nach 30 Sekunden als Karton ins Lager und wird in der Küche ausgepackt; ein eigener Lagerbestand im Lagerraum fehlt |
| 4 | Geräte kaufen | fehlt |
| 5 | Möbel kaufen und platzieren | fehlt |
| 6 | Wände und Böden verändern | fehlt |
| 7 | Neue Räume freischalten | fehlt |
| 8 | Kundenzufriedenheit und Sternebewertungen | fehlt |
| 9 | Weitere Rezepte | fehlt |
| 10 | Reinigungssystem | teilweise: Flecken und Besen gibt es schon |

Danach folgen Mehrspieler und Mitarbeiter (Phase 3).

## Absprachen

- **Nicht vom Konzept abweichen** (Wunsch vom 20.11.2026). Wo das Konzept etwas offen
  lässt, wird die Entscheidung hier festgehalten.
- **Tasten wie im Konzept:** F nimmt auf und legt ab, E benutzt, linke Maustaste arbeitet
  mit dem Werkzeug. Anvisierte Gegenstände bekommen eine dünne Umrandung.
- **Zutaten liegen in der Küche** (Vorratsecke neben dem Herd). Das Konzept erlaubt
  Kühlschrank oder Lager; das Lager wird mit den Lieferungen in Phase 2 gebraucht.
- **Kochen einfacher als im Konzept** (Wunsch vom 20.11.2026): Der Herd kennt nur an und
  aus, es gibt keine Anzeige über dem Topf. Das Rezept hängt als Zettel an der Wand hinter
  dem Herd und hakt ab, was erledigt ist; eine Textzeile sagt, wie es dem Topf geht.
  Krug und Gewürzstreuer stehen auf einem Wandbrett rechts neben dem Topf.
- **Technik bleibt, wie sie ist.** Das Spiel läuft als Desktop-Programm auf Three.js und
  Electron. Ein Wechsel der Technik würde alles Bisherige wegwerfen.
- **Reihenfolge wie im Konzept:** Mitarbeiter, freies Möbelstellen, neue Räume und
  weitere Gerichte kommen in den Phasen 2 bis 4.
- **Werte aus dem Konzept** (250 € Startgeld, 9 € pro Portion, 35 € Zutaten pro Topf)
  sind übernommen: ein Gemüse kostet 8 €, die Brühe für einen Topf 11 €.
- **Der Tag** (20.11.2026): Beim Vorbereiten steht die Uhr auf 11:00, damit man in Ruhe
  kochen kann. Sie läuft, sobald an der Eingangstür geöffnet wird. Die Öffnungszeit bis
  21:00 dauert 12 Minuten (mit Vorbereitung etwa die 15 bis 20 Minuten aus dem Konzept;
  einstellbar in `RULES.day`). Schließen gilt für den ganzen Tag, auch wenn man selbst
  früher schließt. Sind die letzten Gäste gegangen, beendet man den Tag an der Tür.
- **Bestellen** (20.11.2026): Vorrat füllt sich nicht mehr von selbst auf. Am Computer im
  Büro (E am Schreibtisch) bestellt man Kartoffeln, Karotten, Zwiebeln und Brühe; das Geld
  geht sofort ab und steht in der Tagesabrechnung als „Supplies bought“. Nach 30 Sekunden
  steht ein Karton im Lager (Ecke links neben der Tür). Man trägt ihn in die Küche und
  packt mit E an den Kisten und am Brühe-Brett aus. Bestellen kann man nur, was in die
  Küche passt (6 je Gemüse, Brühe für 7 Töpfe). Kommt eine Lieferung, während noch ein
  Karton im Lager steht, landet sie im selben Karton. Reste im Topf bleiben über Nacht.
- **Karton ohne neues Modell:** Der Lieferkarton ist aus dem Kartonstapel im Lager
  herausgeschnitten (`models/d_parcel.glb`), weil gerade keine Meshy-Guthaben da sind.
- **Spielstand:** eine Datei im Benutzerordner des Spiels (`saves/restaurant.json`), dazu
  der Stand vom Vortag als Sicherung. Gespeichert werden Regeln-Zustand, Standort des
  Kochs und Flecken. Nicht gespeichert: der Besen (steht nach dem Laden in der Kammer)
  und Gäste, die gerade unterwegs sind (sie sind nach dem Laden draußen). Eine Datei, die
  sich nicht lesen lässt, wird nicht überschrieben, sondern beiseitegelegt.
