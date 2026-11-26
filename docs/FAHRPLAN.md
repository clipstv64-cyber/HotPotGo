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
| 4 | Kühlschrank und Zutaten | teilweise: Kartoffeln, Karotten, Zwiebeln als einzelne Gegenstände aus drei Kisten in der Vorratsecke der Küche, mit Vorrat (je 6), der am Computer nachbestellt wird; im Kühlschrank liegen Würste (bis zu 8): am Computer bestellt, am Kühlschrank ausgepackt, mit F herausgenommen, auf dem Brett in Scheiben geschnitten; man braucht sie für den Wurst-Eintopf |
| 5 | Interaktives Schneidebrett | fertig: das Hackbrett auf der Arbeitsinsel; Gemüse mit F darauflegen, das Beil daneben mit F nehmen |
| 6 | Gemüse schneiden | fertig: linke Maustaste startet, Maus seitwärts setzt das Messer, Maus nach unten schneidet; Karotte in Scheiben (5 Schnitte), Kartoffel in Würfel (3 + 3, wird gedreht), Zwiebel in Stücke (2 + 3); Schnittgeräusch; gleichmäßige Schnitte geben bessere Qualität |
| 7 | Zutaten in den Topf geben | fertig: nur geschnittenes Gemüse, die Stücke liegen so im Topf, wie sie geschnitten wurden |
| 8 | Brühe hinzufügen | fertig: Krug vom Herd nehmen (F), linke Maustaste, Maus nach unten kippt den Krug; im Topf zeigt eine Linie die nötige Menge; zu wenig Brühe lässt es schneller ansetzen, zu viel macht es wässrig |
| 9 | Herdtemperatur einstellen | vereinfacht auf Wunsch: E am Herd schaltet an und aus; ohne Rühren setzt es an |
| 10 | Umrühren und Garzeit überwachen | fertig: linke Maustaste am Topf, Maus im Kreis führt die Kelle; ohne Rühren setzt der Eintopf an und brennt dann an; 40 Sekunden Köcheln; Würzen mit dem Streuer (3 Stöße sind richtig) |
| 11 | Fertiger Eintopf mit genau 20 Portionen | fertig: genau 20 Portionen (getestet), Füllstand sinkt sichtbar; angebrannter Eintopf muss weggeworfen werden; Qualität aus Schnitt, Brühe, Würze und Anbrennen bestimmt das Trinkgeld |
| 12 | Schüssel nehmen und Portion einfüllen | fertig: leere Schüssel vom Stapel, Schöpfkelle füllt eine Portion ein; Schüsseln kommen nach dem Essen von selbst zurück (Spülen folgt später) |
| 13 | Kunden treten ein und setzen sich | fertig: solange geöffnet ist, kommen Gäste einzeln durch die Eingangstür, gehen zu ihrem Platz und setzen sich; jeder Gast sucht sich einen freien Stuhl (nicht vor einer schmutzigen Schüssel) |
| 14 | Bestellung entgegennehmen | fertig: Gäste lesen kurz die Karte (drei Punkte), dann zeigt ein Notizblock über dem Kopf, dass sie bestellen möchten (mit eigener Geduld); der Koch geht an den Tisch und nimmt die Bestellung mit E auf, erst dann wartet der Gast auf das Gericht (Sprechblase in dessen Farbe) |
| 15 | Essen zum Tisch bringen | fertig |
| 16 | Kunden bezahlen lassen | fertig: 9 € pro Portion plus Trinkgeld für schnelle Bedienung, Startgeld 250 € |
| 17 | Geduldsanzeige und Verlassen des Restaurants | fertig: nach dem Bezahlen oder wenn die Geduld aufgebraucht ist, stehen sie auf und gehen durch die Tür hinaus |
| 18 | Einfache Tagesabrechnung | fertig: Tag mit Uhr (11 bis 21 Uhr), Feierabend, Abrechnungszettel mit Gästen, Verkauf, Trinkgeld, Zutatenkosten, Tagesgewinn und Kassenstand; danach beginnt der nächste Tag |
| 19 | Speichern und Laden | fertig: das Spiel speichert von selbst (alle 20 Sekunden, bei jedem Abschnitt des Tages, beim Schließen des Fensters) und bietet beim Start „Continue“ oder „New restaurant“ an; Sicherungskopie vom Vortag; Esc hält das Spiel an und zeigt eine Pausenkarte: zurück ins Spiel, jetzt speichern, speichern und beenden |

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
4. **Gäste kommen und gehen.** Erledigt (20.11.2026). Freie Platzwahl ist inzwischen da. Gäste weichen
   dem Koch aus und einander (26.11.2026): wer jemanden vor sich hat, wird langsamer und wartet,
   Schritte und Füße bremsen dabei gemeinsam; wer sich entgegenkommt, hält sich etwas rechts;
   kommen zwei zugleich durch die Tür, geht einer zuerst.
5. **Der Tag.** Erledigt (20.11.2026): Uhr, Öffnen und Schließen, Tagesabrechnung, Speichern
   und Laden. Damit ist das Abnahmekriterium von Phase 1 erfüllt: Spiel starten, Eintopf
   kochen, Gäste bedienen, Geld verdienen, den Tag beenden, Fortschritt speichern.

Phase 1 ist vollständig (der Kühlschrank hat seit dem 25.11.2026 eine Aufgabe: die Würste).
(Spülen, Pausenmenü, Bestellen am Tisch und freie Platzwahl sind inzwischen da.)

## Stand von Phase 2 (Restaurant-Management)

| Nr. | Punkt aus dem Konzept | Stand |
|---|---|---|
| 1 | Voll funktionsfähiger Restaurant-Computer | fertig in der ersten Fassung: fünf Seiten, „Supplies“ (bestellen), „Accounts“ (heutige Zahlen und frühere Tage), „Reviews“ (Sterne und was die Gäste schreiben), „Menu“ (welche Gerichte heute auf der Karte stehen und was eine Schüssel kostet, 5 bis 16 €; teurer bringt mehr Geld pro Schüssel, aber schlechtere Bewertungen für den Preis und etwas weniger Gäste) und „Shop“ |
| 2 | Zutaten bestellen | fertig: Menge wählen, Summe, Kassenstand, bestellen |
| 3 | Warenlieferung und Lagerverwaltung | fertig in der ersten Fassung: Lieferung kommt nach 30 Sekunden als Karton ins Lager; auspacken in die drei Kisten im Lagerraum (je 12) oder in die Küchenkisten (je 6); aus dem Lager holt der Koch einzelnes Gemüse in die Küche. Bestellen kann man, was in Küche und Lager zusammen passt |
| 4 | Geräte kaufen | fertig in der ersten Fassung: Seite „Shop“ am Computer mit vier Dingen, jedes mit Wirkung: mehr Schüsseln (45 €, 20 statt 10 auf dem Stapel), Tischkerzen (60 €) und Topfpflanzen (110 €) machen den Raum schöner und heben die Bewertungen, ein stärkerer Brenner (220 €) kocht den Eintopf in 28 statt 40 Sekunden; ein zweiter Topf (180 €) steht auf dem anderen Brenner, damit zwei Gerichte gleichzeitig kochen (jeder Topf hat eigenen Inhalt, eigene Hitze und eigenen Dampf; gearbeitet wird an dem Topf, vor dem der Koch steht, und der Rezeptzettel zeigt dessen Gericht); dazu (26.11.2026) größere Kühlschrankfächer (90 €, 16 statt 8 Würste), ein scharfes Hackbeil (120 €, sauberere Schnitte, bessere Qualität) und eine Spülmaschine (160 €, neues Meshy-Modell in der hinteren Küchenecke: bis zu sechs schmutzige Schüsseln mit E hinein, mit leeren Händen E startet sie, nach 25 Sekunden stehen sie sauber auf dem Stapel; man kann sie wie Spüle und Kühlschrank mit gehaltener E-Taste verschieben); Gekauftes steht sofort im Restaurant und bleibt im Spielstand |
| 5 | Möbel kaufen und platzieren | fertig in der ersten Fassung: Ledersofa, Jukebox, Aquarium (neue Meshy-Modelle), Garderobe; nach dem Kauf steht man auf, das Möbel folgt dem Blick als grüner oder roter Umriss, E stellt es hin, F dreht es, E an einem Möbel verschiebt es; jedes Möbel macht den Raum schöner (Bewertungen) |
| 6 | Wände und Böden verändern | fertig: vier Wandfarben (Creme, Salbeigrün, Terrakotta, Blassblau) und drei Böden (alte Fliesen, Holzdielen, Schiefer), gekauft als Farbeimer (reicht für 8 Wandstücke) oder Dielenpaket (6 Bodenfelder); sie werden geliefert, man stellt sie im Gastraum ab und arbeitet mit Werkzeug aus dem Lager: die Farbrolle (langer Stiel) wird in den Eimer getaucht und mit der Maus Bahn für Bahn über die Wand geführt; mit dem Gummihammer kniet der Koch am Bodenfeld und klopft die Dielen Reihe für Reihe fest |
| 7 | Neue Räume freischalten | auf Wunsch anders gelöst: statt neuer Räume werden die vorhandenen Bereiche erweitert (Abschnitt „Expand“ im Shop): größerer Gastraum (die linke Wand rückt nach hinten, mehr Platz für Möbel, mehr Gäste), größere Küchenkisten (12 statt 6), mehr Lager (zweite Kistenreihe, 24 statt 12) |
| 8 | Kundenzufriedenheit und Sternebewertungen | fertig in der ersten Fassung: jeder Gast bewertet seinen Besuch (Essen 35 %, Wartezeit 25 %, Sauberkeit 20 %, Preis 10 %, Atmosphäre 10 %), daraus werden 1 bis 5 Sterne und ein passender Satz; die Sterne des Restaurants sind der Schnitt der letzten 30 Bewertungen und bringen mehr oder weniger Gäste. Atmosphäre steigt mit gekauften Kerzen, Pflanzen, Möbeln und dem größeren Gastraum. Gästetypen (26.11.2026): jeder Stammgast hat seine Art – Bruno und Milo haben es eilig (weniger Geduld, die Wartezeit zählt mehr), Walter und Greta lassen sich Zeit (mehr Geduld), Lola und Raven sind wählerisch (das Essen zählt mehr, mehr Trinkgeld), Otto und Hein schauen aufs Geld (der Preis zählt mehr, weniger Trinkgeld); auf der Seite „Reviews“ steht die Art hinter dem Namen, und in der Sprechblase zeigt ein kleines Zeichen die Art (Sanduhr: eilig, Stern: wählerisch, Münze: aufs Geld); Wählerische bestellen lieber das teuerste Gericht der Karte, Sparsame das billigste (wenn nicht gerade etwas im Topf duftet) |
| 9 | Weitere Rezepte | fertig in der ersten Fassung: neben dem Gemüseeintopf (9 €) gibt es Kartoffelsuppe (2 Kartoffeln, 1 Zwiebel, 8 €) und Karottensuppe (2 Karotten, 1 Zwiebel, 10 €) und Wurst-Eintopf (1 Kartoffel, 1 Zwiebel, 1 Wurst aus dem Kühlschrank, 12 €, Rezept 160 €); die Rezepte kauft man am Computer (Abschnitt „Recipes“, 70 € und 120 €); was in den Topf kommt, entscheidet, was daraus wird; das Rezept an der Wand zeigt das Gericht, die Suppe hat ihre eigene Farbe in Topf und Schüssel; Gäste bestellen eines der Gerichte auf der Karte (Farbe in der Sprechblase), bekommen sie etwas anderes, ist das Essen weniger wert |
| 10 | Reinigungssystem | fertig in der ersten Fassung (mit Spülmaschine und Putzhilfe, 26.11.2026): Flecken und Besen; Abwasch: die leere Schüssel bleibt mit dem Rest Eintopf auf dem Tisch, man räumt sie ab (F), spült sie an der Spüle (E) und stellt sie zurück auf den Stapel; an einem Platz mit schmutziger Schüssel setzt sich kein Gast, und schmutzige Schüsseln kosten in den Bewertungen Sauberkeit; nach dem Essen bleibt manchmal ein Fleck auf dem Tisch: das Putztuch liegt auf dem zweiten Arbeitstisch in der Küche (F), mit der linken Maustaste am Fleck und der Maus im Kreis wischt der Koch ihn weg; Flecken auf Tischen kosten ebenfalls Sauberkeit; fällt eine volle Schüssel auf den Boden oder kippt um, ist der Eintopf verschüttet: die Schüssel ist schmutzig, auf dem Boden ist ein Fleck zum Kehren (26.11.2026) |

## Stand von Phase 3 (Mitarbeiter und Mehrspieler)

| Nr. | Punkt aus dem Konzept | Stand |
|---|---|---|
| 1 | Mitarbeiter | fertig in der ersten Fassung (Kellner und Putzhilfe): ein Kellner (neues Meshy-Modell mit Laufanimation), am Computer unter „Staff“ eingestellt (150 €, danach 30 € Lohn am Ende jedes Tages). Der Koch stellt volle Schüsseln auf die Theke (F, drei Plätze), der Kellner bringt sie dem Gast, der dieses Gericht bestellt hat, und nimmt an den Tischen die Bestellungen auf; er geht dabei den Weg der Gäste (an der Theke entlang, an der Vorderwand, dann den Gang bei den Tischen) und von Tisch zu Tisch, solange keine Schüssel auf ihn wartet. Hat er nichts zu tun, räumt er schmutzige Schüsseln von den Tischen ab und stellt sie auf die Theke (links und rechts neben die vollen Schüsseln), wo der Koch sie zum Spülen holt. Der Koch kann weiter selbst bedienen. Dazu (26.11.2026) eine Putzhilfe (neues Meshy-Modell mit Laufanimation, „Staff“, 120 €, 25 € Lohn am Tag): er sucht sich selbst den Weg zwischen den Möbeln, kehrt die Flecken im Gastraum mit seinem Besen weg und wischt verschüttete Reste von Tischen, an denen niemand sitzt; hat er nichts zu tun, wartet er an der Rückwand zwischen Spielautomat und altem Kühlschrank. Kellner, Putzhilfe und Gäste weichen einander aus, die beiden bleiben vor dem Koch kurz stehen. Unter „Staff“ kann man beide wieder entlassen („Let him go“, dann kein Lohn mehr; wieder einstellen kostet den Preis erneut); auf dem Tageszettel steht der Lohn in einer eigenen Zeile |
| 2 | Mehrspieler | offen |

## Absprachen

- **Nicht vom Konzept abweichen** (Wunsch vom 20.11.2026). Wo das Konzept etwas offen
  lässt, wird die Entscheidung hier festgehalten.
- **Tasten (geändert auf Wunsch vom 25.11.2026):** Kleine Dinge (Gemüse, Schüsseln, Pakete,
  Eimer, kleine Deko wie Kasse, Kerzen, Gewürzständer, die Bilder von der Wand – Fisch,
  Geweih, Tafel –, der Schüsselstapel und das Hackbrett, wenn nichts darauf liegt) hält man mit gedrückter linker
  Maustaste vor sich; lässt man los, kommt es an die Stelle, auf die man schaut (Brett,
  Kiste, Schüsselstapel, Theke, Kühlschrank; mit dem Mausrad dreht man es), sonst fällt es mit echter Physik und bleibt
  liegen, wo es landet (in den Topf gefallenes geschnittenes Gemüse ist im Topf, eine Schüssel
  vor dem wartenden Gast ist serviert). Kochen (schneiden, rühren, gießen, würzen) bleibt auf
  der Maustaste. Werkzeuge (Messer, Krug, Streuer, Rolle, Hammer, Tuch, Besen) nimmt man mit
  E. Große Dinge (Pflanze, Garderobe, Spielautomat, Kisten, Regale und Möbel in den
  Hinterzimmern, die Regale mit Gläsern und Gemüse in der Küche, Tische, Stühle, gekaufte
  Möbel, Heizkörper, gekaufte Pflanzen, Barhocker, der zweite Arbeitstisch der Küche mit allem, was darauf steht, Gemüsekisten, Spüle, Spülmaschine und Kühlschrank der Küche – wo
  abgewaschen und Wurst geholt wird, zieht mit um) hebt man an, indem man die linke Maustaste gedrückt hält, bis sich ein kleiner Kreis
  gefüllt hat; solange man hält, folgen sie dem Blick, das Mausrad (oder F) dreht, Loslassen stellt sie hin (oder
  zurück, wenn dort kein Platz ist). Aufheben und die weiße Umrandung gibt es nur für das, was
  man direkt anschaut. Tische werden mit ihren Stühlen getragen und mit dem Mausrad um eine
  Vierteldrehung gedreht; Stühle kann man überall hinstellen und frei drehen, Gäste setzen
  sich aber nur auf Stühle, die an einem Tisch stehen und zu ihm schauen. Das geht nur, wenn
  niemand daran sitzt oder auf dem Weg dahin ist, und nicht auf die Wege der Gäste und des
  Kellners. Was man mit der Maus hält, schwebt vor dem Blick (hoch und runter mit dem Blick)
  und bleibt vor Wänden und Flächen stehen; so lässt man es zum Beispiel in den Topf fallen.
  Wo alles steht, bleibt im Spielstand. Dinge, aus denen man etwas nimmt (Gemüsekisten, Schüsselstapel, Spüle, Kühlschrank),
  verschiebt man mit gedrückter E-Taste (der Kreis füllt sich), damit ein Klick weiter etwas
  herausnimmt. Anvisierte Gegenstände bekommen eine dünne Umrandung. Alle Tasten stehen auf einem Zettel im Pausenmenü (Esc, „Controls“); ein neues Restaurant weist nach ein paar Sekunden darauf hin (26.11.2026).
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
- **Moderner Computer** (Wunsch vom 24.11.2026): Der Schreibtisch im Büro ist ein neues
  Meshy-Modell (rustikales Holz, darauf Flachbildschirm, flache Tastatur, Maus, kleiner
  Rechner); sein Bildschirm leuchtet und zeigt ein kleines Bild des Büro-Programms. Der
  Computer-Bildschirm selbst sieht aus wie ein modernes Büro-Programm: dunkle Seitenleiste,
  Karten, Bestellung und Lieferungen rechts, Kennzahlen unter „Accounts“.
- **Am Computer sitzen** (Wunsch vom 24.11.2026): Den Computer benutzt man im Sitzen. E am
  Bürostuhl: Der Koch geht neben den Stuhl, fasst ihn an der Lehne und zieht ihn vom Tisch
  weg, tritt davor, setzt sich mit Blick zum Tisch und rückt mit dem Stuhl heran; die Hände
  gehen auf die Tastatur, dann geht der Bildschirm an. E oder Esc: Er rückt zurück, steht
  auf, tritt zur Seite und schiebt den Stuhl wieder an den Tisch. Der Stuhl ist ein eigenes
  Meshy-Modell für ihn (niedrig, breit, ohne Armlehnen). Der Aktenschrank steht dafür neben
  der Bürotür.
- **Erweitern statt neuer Räume** (Wunsch vom 24.11.2026): Küche, Gastraum und Lager werden größer, es kommen keine neuen Räume dazu. Die zuerst gebaute Lounge ist wieder entfernt.
- **Streichen und Verlegen von Hand** (Wunsch vom 24. und 25.11.2026): Wände und Böden ändern sich
  nicht mehr auf Knopfdruck. Jede Wand ist in Stücke von etwa 2,5 m geteilt (auch über den Türen),
  der Boden in Felder. Farbe und Dielen kommen als Lieferung ins Lager (höchstens vier auf einmal),
  man trägt sie in den Gastraum und stellt sie auf den Boden (F). Werkzeug liegt im Lager neben der
  Tür: die Farbrolle an der Wand, der Gummihammer davor.
  - Streichen: Die Rolle wird mit E in den Eimer getaucht (sie färbt sich), dann mit gedrückter
    linker Maustaste an der Wand mit der Maus hoch, runter und zur Seite geführt. Wo sie war, ist
    Farbe. Ein Eintauchen reicht für ein Wandstück, ein Eimer für acht. Ein Stück gilt bei 97 %
    als fertig. Was halb gestrichen ist, bleibt bis zum Ende des Spiels stehen, wird aber nicht
    gespeichert.
  - Verlegen: Mit dem Hammer auf ein Bodenfeld schauen, das Paket muss in der Nähe stehen. Der
    Koch kniet sich hin. Maus hoch holt aus, Maus runter klopft eine Reihe fest. Fünf Reihen sind
    ein Feld, er rutscht dabei auf den Knien mit.
  - Neue Meshy-Modelle: Farbrolle mit langem Stiel, Gummihammer, offener Farbeimer (die Farbe im
    Eimer und auf der Rolle zeigt die gekaufte Farbe).
- **Shop in Abschnitten** (Wunsch vom 24.11.2026): Kitchen, Room, Furniture, Walls, Floors. Damit die Raummitte frei für Möbel ist, gehen die Gäste jetzt an der Vorderwand entlang zu den Tischen.
- **Bewertungen** (24.11.2026): Ein Gast schreibt nach dem Essen mit 75 % Wahrscheinlichkeit
  eine Bewertung, wer hungrig geht, immer (1 Stern). Der Satz dazu nennt, was am
  schwächsten war (Essen, Wartezeit oder Sauberkeit). Jeder Fleck auf dem Boden kostet ein
  Viertel der Sauberkeit. Die Sterne steigen über dem Gast auf, der Schnitt steht oben
  rechts, alles Weitere auf der Seite „Reviews“ am Computer und auf dem Tageszettel.
- **Bildschirm im Stil des Spiels** (Wunsch vom 24.11.2026): Das Büro-Programm sieht nicht
  mehr wie eine Website aus, sondern wie die Zettel des Spiels: Papier auf dem dunklen
  Küchenholz, mit Pinnnadeln, kursiver Schrift, gepunkteten Linien, Stempeln und Kästchen
  für den Vorrat; Tag und Kasse oben rechts wie in der Spielanzeige.
- **Prüfer-Agenten:** Im Ordner `.claude/agents/` liegen vier Prüfer (Stil, Code, Performance,
  Animationen). Nach passenden Änderungen laufen sie, bevor etwas als fertig gilt.
- **Karton ohne neues Modell:** Der Lieferkarton ist aus dem Kartonstapel im Lager
  herausgeschnitten (`models/d_parcel.glb`), weil gerade keine Meshy-Guthaben da sind.
- **Spielstand:** eine Datei im Benutzerordner des Spiels (`saves/restaurant.json`), dazu
  der Stand vom Vortag als Sicherung. Gespeichert werden Regeln-Zustand, Standort des
  Kochs und Flecken. Nicht gespeichert: der Besen (steht nach dem Laden in der Kammer)
  und Gäste, die gerade unterwegs sind (sie sind nach dem Laden draußen). Eine Datei, die
  sich nicht lesen lässt, wird nicht überschrieben, sondern beiseitegelegt.
