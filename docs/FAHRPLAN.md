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
| 3 | Gegenstände aufnehmen und ablegen | teilweise: Besen überall ablegbar; Salat und Schüssel nur an ihren Stationen |
| 4 | Kühlschrank und Zutaten | teilweise: ein Salatkopf vom Regal, kein Vorrat, Kühlschrank ohne Funktion |
| 5 | Interaktives Schneidebrett | fehlt (ein Brett mit Beil steht als Deko auf der Arbeitsinsel) |
| 6 | Gemüse schneiden | fehlt |
| 7 | Zutaten in den Topf geben | teilweise: ein Tastendruck, im Topf ist nichts zu sehen |
| 8 | Brühe hinzufügen | fehlt |
| 9 | Herdtemperatur einstellen | fehlt |
| 10 | Umrühren und Garzeit überwachen | teilweise: fester Zeitablauf von 10 Sekunden |
| 11 | Fertiger Eintopf mit genau 20 Portionen | teilweise: 4 Portionen mit Zähler, Füllstand nicht sichtbar |
| 12 | Schüssel nehmen und Portion einfüllen | teilweise: ein Schritt, die Schüssel ist sofort voll |
| 13 | Kunden treten ein und setzen sich | fehlt: acht Gäste sitzen fest an ihren Plätzen |
| 14 | Bestellung entgegennehmen | teilweise: Gäste bestellen von selbst mit einer Blase |
| 15 | Essen zum Tisch bringen | fertig |
| 16 | Kunden bezahlen lassen | fertig (mit Trinkgeld für schnelle Bedienung) |
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

1. **Kochen, Teil 1 – Zutaten und 20 Portionen.** Kartoffeln, Karotten und Zwiebeln als
   eigene Gegenstände aus Kühlschrank und Regal; der große Topf fasst 20 Portionen, der
   Füllstand ist sichtbar; man nimmt eine leere Schüssel und schöpft eine Portion.
2. **Kochen, Teil 2 – Schneiden.** Gemüse aufs Schneidebrett legen, Messer nehmen, mit
   der Mausbewegung schneiden; die Stücke kommen in den Topf und sind dort zu sehen.
3. **Kochen, Teil 3 – Brühe, Hitze, Rühren.** Brühe eingießen, Herdstufe wählen,
   umrühren; zu viel Hitze oder kein Rühren lässt den Eintopf anbrennen; daraus ergibt
   sich die Qualität.
4. **Gäste kommen und gehen.** Eintreten, Tisch suchen, hinsetzen, bestellen, essen,
   zahlen, gehen; wer zu lange wartet, steht auf und geht.
5. **Der Tag.** Uhr, Öffnen und Schließen, Tagesabrechnung, Speichern und Laden.

Danach folgt Phase 2 des Konzepts (Computer mit Bestellungen und Lieferungen, Geräte
und Möbel kaufen, Bewertungen, weitere Gerichte), dann Mehrspieler und Mitarbeiter.

## Wo ich vom Konzept abweichen würde

- **Arbeitsansicht an den Stationen.** Für Schneiden, Gießen und Rühren schaut die
  Kamera auf Brett oder Topf, und die Maus führt das Werkzeug. Jede Bewegung frei mit
  den Armen des Kochs zu spielen wäre sehr viel aufwendiger und ungenauer.
- **Technik bleibt, wie sie ist.** Das Spiel läuft als Desktop-Programm auf Three.js und
  Electron. Ein Wechsel der Technik würde alles Bisherige wegwerfen.
- **Später, nicht jetzt:** Mitarbeiter mit eigener Aufgaben-KI, freies Möbelstellen,
  neue Räume, zehn Gerichte. Das sind große Brocken, die erst Sinn ergeben, wenn ein
  Tag mit einem Gericht Spaß macht.
- **Werte aus dem Konzept** (250 € Startgeld, 9 € pro Portion, 35 € Zutaten pro Topf)
  übernehme ich mit der Tages- und Geld-Etappe als Ausgangspunkt.
