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
| 4 | Kühlschrank und Zutaten | teilweise: Kartoffeln, Karotten, Zwiebeln als einzelne Gegenstände aus drei Kisten in der Vorratsecke der Küche, mit Vorrat (je 6); Kühlschrank noch ohne Funktion |
| 5 | Interaktives Schneidebrett | fertig: das Hackbrett auf der Arbeitsinsel; Gemüse mit F darauflegen, das Beil daneben mit F nehmen |
| 6 | Gemüse schneiden | fertig: linke Maustaste startet, Maus seitwärts setzt das Messer, Maus nach unten schneidet; Karotte in Scheiben (5 Schnitte), Kartoffel in Würfel (3 + 3, wird gedreht), Zwiebel in Stücke (2 + 3); Schnittgeräusch; gleichmäßige Schnitte geben bessere Qualität |
| 7 | Zutaten in den Topf geben | fertig: nur geschnittenes Gemüse, die Stücke liegen so im Topf, wie sie geschnitten wurden |
| 8 | Brühe hinzufügen | fertig: Krug vom Herd nehmen (F), linke Maustaste, Maus nach unten kippt den Krug; im Topf zeigt eine Linie die nötige Menge; zu wenig Brühe lässt es schneller ansetzen, zu viel macht es wässrig |
| 9 | Herdtemperatur einstellen | fertig: E am Herd schaltet aus, niedrig, mittel, hoch; die Temperatur steigt und fällt; niedrig kocht langsam und sicher, hoch schnell mit Anbrenngefahr; Flammen und Anzeige am Topf |
| 10 | Umrühren und Garzeit überwachen | fertig: linke Maustaste am Topf, Maus im Kreis führt die Kelle; ohne Rühren setzt der Eintopf an und brennt dann an; 40 Sekunden Köcheln; Würzen mit dem Streuer (3 Stöße sind richtig) |
| 11 | Fertiger Eintopf mit genau 20 Portionen | fertig: genau 20 Portionen (getestet), Füllstand sinkt sichtbar; angebrannter Eintopf muss weggeworfen werden; Qualität aus Schnitt, Brühe, Würze und Anbrennen bestimmt das Trinkgeld |
| 12 | Schüssel nehmen und Portion einfüllen | fertig: leere Schüssel vom Stapel, Schöpfkelle füllt eine Portion ein; Schüsseln kommen nach dem Essen von selbst zurück (Spülen folgt später) |
| 13 | Kunden treten ein und setzen sich | fehlt: acht Gäste sitzen fest an ihren Plätzen |
| 14 | Bestellung entgegennehmen | teilweise: Gäste bestellen von selbst mit einer Blase |
| 15 | Essen zum Tisch bringen | fertig |
| 16 | Kunden bezahlen lassen | fertig: 9 € pro Portion plus Trinkgeld für schnelle Bedienung, Startgeld 250 € |
| 17 | Geduldsanzeige und Verlassen des Restaurants | teilweise: Geduld läuft ab und der Gast gibt auf, bleibt aber sitzen |
| 18 | Einfache Tagesabrechnung | fehlt: es gibt noch keinen Tag und keine Uhr |
| 19 | Speichern und Laden | fehlt |

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
3. **Kochen, Teil 3 – Brühe, Hitze, Rühren.** Erledigt (20.11.2026). Bis es den Tag mit
   Vorbereitung und Öffnen gibt, bestellen die Gäste erst, wenn der erste Topf fertig ist.
4. **Gäste kommen und gehen.** Eintreten, Tisch suchen, hinsetzen, bestellen, essen,
   zahlen, gehen; wer zu lange wartet, steht auf und geht.
5. **Der Tag.** Uhr, Öffnen und Schließen, Tagesabrechnung, Speichern und Laden.

Danach folgt Phase 2 des Konzepts (Computer mit Bestellungen und Lieferungen, Geräte
und Möbel kaufen, Bewertungen, weitere Gerichte), dann Mehrspieler und Mitarbeiter.

## Absprachen

- **Nicht vom Konzept abweichen** (Wunsch vom 20.11.2026). Wo das Konzept etwas offen
  lässt, wird die Entscheidung hier festgehalten.
- **Tasten wie im Konzept:** F nimmt auf und legt ab, E benutzt, linke Maustaste arbeitet
  mit dem Werkzeug. Anvisierte Gegenstände bekommen eine dünne Umrandung.
- **Zutaten liegen in der Küche** (Vorratsecke neben dem Herd). Das Konzept erlaubt
  Kühlschrank oder Lager; das Lager wird mit den Lieferungen in Phase 2 gebraucht.
- **Technik bleibt, wie sie ist.** Das Spiel läuft als Desktop-Programm auf Three.js und
  Electron. Ein Wechsel der Technik würde alles Bisherige wegwerfen.
- **Reihenfolge wie im Konzept:** Mitarbeiter, freies Möbelstellen, neue Räume und
  weitere Gerichte kommen in den Phasen 2 bis 4.
- **Werte aus dem Konzept** (250 € Startgeld, 9 € pro Portion, 35 € Zutaten pro Topf)
  übernehme ich mit der Tages- und Geld-Etappe als Ausgangspunkt.
