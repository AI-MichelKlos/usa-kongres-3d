# Kongreskortet

Interaktivt kort over partifordelingen i USA's Kongres. Hver delstat kan man pege på. Teksten er på dansk.

I **Repræsentanternes Hus** blander farven rød og blå efter andelen af demokrater og republikanere. En uafhængig får et guldmærke og trækker ikke farven. I **Senatet** følger farven caucus (blå, rød eller lilla, når delegationen er delt), og et guldmærke markerer en uafhængig. Beige betyder, at en af pladserne er ledig.

**Valgnat** farver staterne fra øst mod vest i deres *nuværende* farver, som når resultater tikker ind. Det er ikke en prognose.

## Siden

Når workflowet har kørt, ligger siden på:

**https://ai-michelklos.github.io/usa-kongres-3d/**

Under **Settings → Pages → Build and deployment** skal **Source** være **GitHub Actions**. Workflowet [`.github/workflows/pages.yml`](.github/workflows/pages.yml) bygger med Vite ved push til `main` og kan også startes manuelt under fanen Actions. Det er den indstilling, deployet her bruger.

## Data

Medlemmerne kommer kun fra det åbne datasæt [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) (`legislators-current.json`). Ingen navne eller partier er skrevet ind i hånden. Den kompakte fil er `public/data/congress.json`, og siden viser hvornår den er hentet.

```bash
python3 scripts/build_congress_data.py
```

Workflowet [`.github/workflows/refresh-data.yml`](.github/workflows/refresh-data.yml) kører hver mandag kl. 07.00 UTC og kan startes manuelt. Det henter filen igen, committer `public/data/congress.json` til standardbranchen og starter Pages-workflowet, så fodnoten får den nye dato. Det andet skridt er nødvendigt, fordi et commit fra Actions ikke selv udløser et push-workflow.

Ledige pladser er forskellen mellem den lovbestemte mandatfordeling og de medlemmer, kilden faktisk opregner. Husets størrelse er folketællingen i 2020 (U.S. Census Bureau). Et distriktnummer vises kun, når de besatte distrikter er en ren delmængde af 1…N, så nummeret kan udledes. Ellers står der blot «ledig plads». En tom senatsplads kan få et klassenummer fra statens faste senatsklasser — stadig uden et navn.

Delegerede fra D.C. og territorierne (herunder Puerto Ricos residentkommissær) stemmer ikke i Huset og sidder ikke i Senatet. De står på deres egen liste og er ikke tegnet på kortet.

## Meningsmålinger

`public/data/polls.json` er en manuel afskrift af enkelte, offentliggjorte målinger til midtvejsvalget 3. november 2026. Den er ikke en del af kongresdataene, og workflowet henter den ikke automatisk. Aggregater og prognoser (Silver Bulletin, RealClearPolitics, Decision Desk HQ, 270toWin, FiftyPlusOne, Ballotpedia og lignende) er ikke taget med. Gennemsnittet regnes i browseren ud fra rækkerne i filen.

Sådan opdateres filen:

1. Kør `python3 scripts/compile_polls.py`. Det kræver netadgang til Wikipedia og læser kun tabeller over enkelte målinger. Feltarbejde uden for de seneste 30 dage udelades. Manglende stikprøve eller fejlmargin bliver stående som tomme felter.
2. Læs diffen. Ret ikke en procent i hånden, medmindre tabellens celle og den oprindelige kilde er uenige. Så skal tallet tages fra kilden, eller rækken skal ud. Gæt aldrig et tal.
3. Commit `public/data/polls.json`. Der er ikke et ugentligt job, fordi automatisk indlæsning ikke er pålidelig.

RMG Researchs generiske måling 13.–14. oktober 2026 er afskrevet fra Napolitan-artiklen, fordi Wikipedias ene celle (RV 51–43) ikke er den samme opgørelse som artiklens sandsynlige vælgere uden leaners (52–41).

## Lokalt

```bash
npm install
python3 scripts/build_congress_data.py
npm run dev
```

Tjek og produktion:

```bash
npm test
npm run build
npm run preview
```

Kortgeometrien er [us-atlas](https://github.com/topojson/us-atlas) 3.0.1 (`states-10m.json`, ISC, Mike Bostock) og projiceres i browseren med `d3-geo`s `geoAlbersUsa`.

## Valg USA 2026

Den aktuelle danske valgguide [Valg USA 2026](https://valgkort-usa-2026-michel.danske-a-kas-7580.chatgpt.site/) ligger i mappen [`valg-usa-2026/`](valg-usa-2026/). Mappen indeholder både den viste side (`dist/`), datakilderne og kontrollerne. Kongreskortet beskrevet ovenfor er bevaret som et separat projekt.
