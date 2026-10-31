# Valg USA 2026: Hvem får magten?

Dansk, interaktiv valgguide til USA's midtvejsvalg 3. november 2026. Version 3 dækker Senatet, Repræsentanternes Hus, guvernørvalg og valgene i Chicago. Siden er bygget i HTML/CSS/JavaScript uden et framework-build. Alle klientbiblioteker og kortdata følger med lokalt.

I denne version er scenarier fjernet fra alle offentliggjorte brugerflader. Kortet fungerer som en almindelig valgguide med kandidater, nuværende partifordeling og kildeoplysninger.

## Indhold

- **Senatet:** kort med alle 50 stater og de 35 sæder på valg. En oversigt viser, at **13 demokratiske sæder og 22 republikanske sæder er på valg**, inklusive særvalgene i Florida og Ohio. Oversigten indeholder antal og partier uden personnavne.
- **Repræsentanternes Hus:** alle 435 stemmeberettigede distrikter med nationalt overblik, visning af en enkelt delstat og valg af distrikt i en liste.
- **Guvernører:** de 36 guvernørvalg i USA's stater og de 14 poster, som ikke er på valg. DC og territorier er udeladt.
- Kandidater, partier, kildehenvisninger og relevante forbehold ved klik eller valg i en liste.
- Den valgte delstats indbyggertal vises diskret i detaljeboksen. Tallene er U.S. Census Bureaus skøn for 1. juli 2025 og omfatter alle indbyggere, ikke kun stemmeberettigede. Kilde: [State Population Totals and Components of Change: 2020–2025](https://www.census.gov/data/datasets/time-series/demo/popest/2020s-state-total.html); lokalt kildesnapshot: `research/NST-EST2025-ALLDATA.csv`.
- Delstatens år i USA og nummer i rækkefølgen vises under indbyggertallet. Kilde: [Arkansas Secretary of State, Order of States’ Admission](https://www.sos.arkansas.gov/education/arkansas-history/history-of-the-flag/order-of-states-admission); lokalt kildesnapshot: `research/statehood.json`. De første 13 årstal er datoerne for ratificering af forfatningen.
- Chicago-guide med kandidater til delstatsdækkende valg, øvrige embeder og seks vejledende spørgsmål.
- Delingslinks, som genskaber den valgte visning, delstat og eventuelt distrikt.
- Gamle scenarielinks åbner den almindelige guide. Tidligere valg af vindere kasseres i brugerfladen og medtages ikke i nye delingslinks.

## Datering og afgrænsning

Data er et dateret øjebliksbillede kontrolleret **31. oktober 2026**. Kontroldatoen og kildens udgivelsesdato er forskellige oplysninger og skal bevares hver for sig. Siden indeholder ingen live-resultater, automatiske resultatopdateringer, prognoser, meningsmålinger eller vurderinger af vinderchancer.

Kandidatfelter følger de anførte kilder. Manglende kandidater fra et stort parti bliver ikke tilføjet som pladsholdere. Dækningen af write-in-kandidater, eventuelle senere ændringer og særlige valgregler fremgår af kandidatnoterne.

### Senatet

Kandidater og kilder findes pr. valg i `research/senate-races.json`. Partifordelingen, de faste sæder og vicepræsidentens rolle er dokumenteret i `research/senate-baseline.json`, blandt andet med [Senatets partifordeling](https://www.senate.gov/about/parties-leadership/party-division.shtml) og [reglen om stemmelighed](https://www.senate.gov/legislative/TieVotes.htm).

Oversigten over sæder på valg beregnes fra `incumbentParty` for hvert af de 35 senatsvalg. Den tæller det parti, som har sædet ved kontroltidspunktet, og giver 13 demokratiske og 22 republikanske sæder. De 22 republikanske sæder omfatter både de 20 ordinære valg og særvalgene i Florida og Ohio. Kandidatnavne indgår i de enkelte valgs detaljer, ikke i denne samlede oversigt.

### Repræsentanternes Hus

Kandidaterne kommer fra [House Clerk's officielle nomineringsliste](https://clerk.house.gov/member_info/electionInfo/2026/120-nominations.pdf), udgivet **8. oktober 2026**. Listen indeholder 1.158 kandidater i de 435 distrikter. Nuværende medlemmer er sammenkoblet med [House Clerk's medlemsdata](https://clerk.house.gov/xml/lists/MemberData.xml), dateret **1. oktober 2026**. Kildesnapshots og metode findes i `research/house-races.json` og `research/house-source/`.

**Den nuværende partifarve følger medlemmet i 119. Kongres for samme delstat og distriktsnummer.** Flere distriktsgrænser er ændret til 2026. Farven er derfor ikke et beregnet tidligere valgresultat inden for de nye grænser og betyder ikke, at kandidaten repræsenterer præcis samme geografiske område som før. Et nuværende medlem kan desuden stille op i et andet distrikt. Den officielle kandidatlistes markering af nuværende medlemmer og distriktsnummerkoblingen er to forskellige oplysninger.

Kildernes datering og noter skal følge med ved fremtidige opdateringer. Kandidatlisten er en national status fra 8. oktober, og eventuelle senere ændringer er ikke selvstændigt kontrolleret i alle delstater. Louisianas House-valg har særlige regler om åbent primærvalg og muligt runoff, som er beskrevet ved de relevante valg.

### Guvernører

`research/governor-races.json` dokumenterer de 36 valg, partibaseline og kilderne for hvert kandidatfelt. Kontrollen har forskellige niveauer:

| Kildeniveau | Betydning |
| --- | --- |
| `official` | Kandidatnavne og felt er kontrolleret i en læsbar officiel kilde. |
| `official-indexed` | Officielt kildeindhold er læst i søgeresultater; hele dokumentet kunne ikke læses. |
| `mixed` | Officiel kilde til kandidatfeltet er suppleret med en sekundær kilde til partier. |
| `secondary` | Kandidatfeltet er kontrolleret i en sekundær kilde; selvstændig officiel kontrol udestår. |

Disse niveauer og kandidatnoterne skal bevares. Guvernørdata må ikke beskrives samlet som fuldt verificeret i officielle stemmesedler. Nationalt scope og partifordeling bygger på NGA, Ballotpedia og 270toWin; de konkrete kilder fremgår af datasættet.

## Partifordeling og sæder på valg

| Valg | Samlet antal | På valg i 2026 | Fortolkning |
| --- | --- | --- | --- |
| Senatet | 100 sæder | 35 sæder | 13 demokratiske og 22 republikanske sæder er på valg. |
| Repræsentanternes Hus | 435 stemmeberettigede sæder | 435 sæder | Nuværende parti kobles på delstat og distriktsnummer med forbehold for ændrede grænser. |
| Guvernører | 50 delstatsposter | 36 poster | Hver post tilhører en selvstændig delstat. De øvrige 14 poster er ikke på valg. |

Senatets nuværende fordeling er 45 demokrater, 53 republikanere og to uafhængige, som samarbejder med Demokraterne. Den viste Demokratiske gruppe tæller derfor 47. De 65 sæder uden valg består af 32 demokratiske, 31 republikanske og de to uafhængige sæder. Ved 50 mod 50 kan den republikanske vicepræsidents afgørende stemme give republikansk kontrol; 50 er ikke et flertal af 100 senatorer.

I et fuldt besat Repræsentanternes Hus giver 218 af de 435 mandater flertal. Nuværende uafhængige medlemmer og ledige pladser vises særskilt i statusfordelingen. Guvernørfordelingen viser 50 selvstændige embeder og har ingen national kontroltærskel. De 14 guvernørposter uden valg omfatter seks demokratiske og otte republikanske poster.

## Kortdata og Missouri-rettelse

Delstatskortet bruger publiceret US Atlas-geometri. House-kortet bruger [Census TIGERweb: 120th Congressional Districts](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0) med en dokumenteret rettelse for Missouri.

[Census' aktuelle 2026-vejledning](https://www.census.gov/programs-surveys/decennial-census/about/rdo/congressional-districts.html) oplyser, at Missouri bruger samme distriktsplan som ved valgene i 2022 og 2024 efter retsafgørelsen 23. september 2026. De publicerede 120th Congress-geometrier var endnu ikke rettet. Derfor er alle otte Missouri-distrikter erstattet med geometri fra [Census' 119th Congress-lag](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2025/MapServer/54).

Den endelige TopoJSON-fil indeholder præcis 435 distrikter i `objects.districts`, med stabile ID'er som `IL-07` og `AK-00`. DC, territorier og områder uden defineret distrikt er udeladt. De ni stater med ændrede 2026-planer er Alabama, Californien, Florida, Louisiana, North Carolina, Ohio, Tennessee, Texas og Utah.

Geometrien er forenklet til kortvisning og zoom på delstatsniveau. Ringretningen er allerede tilpasset D3. Kilde-URL'er, Missouri-rettelsen, simplificeringen og kontrollen af alle distrikter findes i `research/house-geometry.json`; selve kortet ligger i `research/house-districts-2026.json`.

## Design

Et valgfrit efterårspræg kan tilpasses i sidens CSS. Bevar de tydelige partifarver, kontrasten, læsbarheden og den ensartede betydning af farver på tværs af kort, kandidater og mandatvisning. Visuelle temavalg skal holdes adskilt fra datagrundlaget.

## Filer

- `dist/`: den komplette webside med lokale biblioteker og data.
- `research/`: daterede kildesnapshots, kandidatfelter, metoder og kortgeometri.
- `build-data.py`: kompilerer kilderne til `dist/assets/data.js`, herunder `elections.senate`, `elections.house` og `elections.governors`.
- `dist/assets/math.js`: fælles validering og linkfunktioner. Tidligere scenariefunktioner er bevaret som intern kompatibilitetskode og er ikke tilgængelige i den offentliggjorte brugerflade.
- `checks.mjs`: kontroller af data, 435 distriktskoblinger, ugyldige input og links samt interne kontroller af den bevarede kompatibilitetskode.

Opdater først research-filerne og datostemplerne, når nye oplysninger er verificeret. Kør derefter `python build-data.py` og `node checks.mjs`. Bevar korrekt revisionshåndtering i den interne kompatibilitetskode ved ændringer i kandidaternes rækkefølge. Gamle scenarieparametre må ikke genaktivere scenarier eller valg af vindere i brugerfladen.

Brug det officielle Sites-forløb til kildehistorik og publicering. Bevar sidens eksisterende adgangsniveau.

## Licenser

D3 7.9.0 og topojson-client 3.1.0 anvendes under ISC-licens. US Atlas' publicerede kortdata er baseret på U.S. Census Bureau. Licensoplysninger følger med under dist/assets/licenses/.
