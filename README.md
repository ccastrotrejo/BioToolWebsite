# BioTool Web

A local-first protein workbench built with React, strict TypeScript, Vite and
Mol*. All parsing and analysis run in your browser; local files are not uploaded.
No Go service is needed for the current application.

## Run and build

Requires Node.js **22.12+** and npm.

```sh
npm ci
npm run dev
```

For the deployable build and its offline behavior:

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to a static HTTPS host. Relative asset URLs
support a subdirectory deployment. Serve `sw.js` with revalidation rather than
a long immutable cache; content-hashed assets may use immutable caching.
Keep `index.html`, `sw.js`, fonts, examples and all generated chunks together.
HTTPS or localhost is required for service workers and SHA-256 hashing.

This folder is independent of the Python application. Its standalone
destination is [ccastrotrejo/BioToolWebsite](https://github.com/ccastrotrejo/BioToolWebsite).
When working from the Python repository, copy `web/` (excluding `node_modules/`,
`dist/`, and test output) to the new repository root and run `npm ci`.
The included `.github/workflows/ci.yml` works from that standalone root.

## Explore

- **Structures:** seven curated starting points, direct PDB IDs and extended
  `pdb_` identifiers, plus local PDB, mmCIF, BinaryCIF and gzip import. Crambin
  (`1CRN`) is bundled; other public structures download on demand from RCSB.
- **Molecule:** ribbon, atoms, molecular surface and points; chain, element or
  triplet-propensity coloring; optional ligands; pointer and keyboard-accessible
  camera controls; PNG export. A theme-aware dotted workspace sits behind the
  protein; it is a screen-space guide, not a molecular distance scale.
- **Linked views:** picking a residue in the molecule or sequence updates the
  inspector. Composition and triplet selections highlight their residues.
  Sequence navigation and triplet lists are paginated rather than rendering
  arbitrarily large sets of buttons.
- **Scope:** choose a chain for analysis without treating a representation or
  ligand-visibility change as a change to the scientific counts.
- **Exports:** original coordinate file, observed per-chain FASTA, self-contained
  HTML composition/coordinate and triplet reports. Downloaded reports need no
  CDN or running BioTool site. Public links retain accession, chain scope,
  representation and color, but not camera or local/private files.
- **Access:** light/dark themes, reduced-motion support, semantic tables,
  keyboard sequence navigation and useful analysis even without WebGL.

## Offline storage and privacy

The production build installs a service worker that caches the app shell,
fonts, lazy molecular viewer, parser worker and bundled example. Wait for
**Ready for offline use** before going offline. The Vite development server
does not install that production cache.

Parsed, validated source files are saved to IndexedDB on this browser and
origin. Subsequent opens use the saved source before trying the network.
Explicit **Refresh from RCSB** validates a new source before replacing it.
A damaged saved file produces an error instead of a silent network fallback.
An error's refresh/clear actions also work when the initial workspace cannot
open. Canceling or failing a new load preserves the previous valid view.

Use the library controls to remove saved structures. This does not remove
the currently displayed in-memory structure or the cached application shell.
Browser storage can be evicted, is not a backup, and is not shared between
devices. Export important work. Updates activate after older tabs close,
avoiding an automatic reload in the middle of an analysis.

Local imports stay on this device. Only explicitly requested public coordinates
are fetched from RCSB; the viewer does not fetch remote annotations or send
local coordinates elsewhere. Fonts are bundled, with no analytics or account
service. Opening an external RCSB/Mol* link is a normal external navigation.

Files are limited to **20 MiB** (also after decompression), with a
**100,000 full-source atom-record** ceiling, including other models, alternates
and excluded HETATM records. These are application admission limits, not
restrictions of the coordinate formats or guaranteed memory bounds. Large
structures and surfaces can still be expensive on limited GPUs. Mol* is
lazy-loaded; the sequence and charts do not depend on WebGL initialization.

## Scientific interpretation

The web implementation preserves the desktop calculation, not a replacement
secondary-structure predictor:

- First deposited model only, with each chain analyzed independently.
- Protein counts use `ATOM` records plus `HETATM` MSE normalized to methionine.
- Observed sequence comes from accepted CA atoms in file order. Unsupported
  residues with a CA atom are explicit errors rather than silently becoming X.
- Alternate atom sites prefer blank, then A, then other labels, matching the
  original algorithm rather than an occupancy-based conformer policy.
- Triplets are complete, **non-overlapping** groups within each observed chain.
  Repeated instances count separately. Trailing one/two residues contribute
  to composition, but not triplet totals.
- Missing-coordinate gaps are absent from observed sequences. A triplet can
  span an unresolved gap; author numbering is retained in residue labels.
- Scores are rounded to four decimals before the original ordered thresholds.
  Exhaustive regression tests cover all 8,000 possible amino-acid triplets.

Ribbon geometry is derived from structure; propensity colors are a separate
sequence heuristic. Neither is a folding simulation. Deposited coordinates
are not an automatically generated biological assembly. Report coordinate
projections are explicitly unbonded points rather than invented bonds.

This migration does not yet implement trajectory simulation, assembly
generation, structural alignment, contact maps, accounts or collaborative
projects. Those require separate scientific and product decisions.

## Architecture roadmap

The [roadmap](ROADMAP.md) includes an npm-workspaces monorepo with a React shell
and a Vue 3 feature module. The first proposed Vue boundary is structure
discovery/library UI. Independently deployed microfrontends are a later option,
not a prerequisite for combining React and Vue or shipping the current site.

## Code map

| Directory | Responsibility |
| --- | --- |
| `src/domain` | Shared scientific and source-file types |
| `src/formats` | PDB, mmCIF and BinaryCIF parsing |
| `src/analysis` | Composition and legacy propensity rules |
| `src/workers` | Cancelable, off-main-thread parsing |
| `src/data` | Source validation, downloads and IndexedDB library |
| `src/viewer` | Mol* lifecycle, residue identity mapping and camera |
| `src/features` | Linked React workbench and accessible controls |
| `src/exports` | Source, FASTA and standalone HTML downloads |
| `e2e` | Production-build browser workflows |

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite serves the production build. On Linux CI, install browser
system dependencies with `npx playwright install --with-deps chromium`.
The parent repository still runs the original Python regression suite.

## Data and dependencies

The bundled [`1CRN` mmCIF](https://files.rcsb.org/download/1CRN.cif) is from the
[PDB archive](https://www.wwpdb.org/about/usage-policies), distributed under CC0.
Consult the [structure entry](https://www.rcsb.org/structure/1CRN) for its
authors and primary citation. Catalog summaries are short original descriptions.

Mol* is MIT-licensed; React and React DOM are MIT-licensed. IBM Plex Sans and
IBM Plex Mono are distributed under the SIL Open Font License. See
[Mol*](https://github.com/molstar/molstar),
[React](https://github.com/facebook/react) and
[IBM Plex](https://github.com/IBM/plex) for upstream licenses and credits.
The production build includes `third-party-licenses.txt` with the license
notices found in bundled dependency packages.
This migration does not invent a license for the surrounding BioTool project.
