# Kongreskortet

Interaktivt 3D-kort over partifordelingen i USA's Kongres. Hver delstat er en ekstruderet form, man kan dreje, zoome og klikke på. Teksten er på dansk.

I **Repræsentanternes Hus** er højden statens antal pladser, og farven blander rød og blå efter andelen af demokrater og republikanere. En uafhængig får et guldmærke og trækker ikke farven. I **Senatet** har alle stater samme højde. Farven følger caucus (blå, rød eller lilla, når delegationen er delt), og et guldmærke markerer en uafhængig. Dæmpet farve betyder, at en af pladserne er ledig.

**Valgnat** animerer staterne ind fra øst mod vest i deres *nuværende* farver, som når resultater tikker ind. Det er ikke en prognose.

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
