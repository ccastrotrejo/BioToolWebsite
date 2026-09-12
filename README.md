# BioTool Web

A local-first protein workbench built with a React shell, a Vue 3 structure
library, strict TypeScript, Vite and Mol*. All parsing and analysis run in your browser; local files are not uploaded.
No Go service is needed for the current application.

## Run and build

Requires Node.js **22.12+** and npm.
Run all commands from the website root; npm installs the workspaces together.

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
fonts, lazy Vue library, lazy molecular viewer, parser worker and bundled example. Wait for
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

## React + Vue architecture

This is an npm-workspaces monorepo. React owns the application shell and linked
molecule, sequence and analysis views. Vue 3 owns the collection, device-library
controls and structure-search dialog. Both use the same CSS tokens and ship in
one versioned, offline-capable build. No runtime federation server is required.

The shell lazy-loads `@biotool/structure-library` through the versioned
`@biotool/contracts` API: `mount(container, snapshot, host)` returns
`update(snapshot)` and `unmount()`. Updates preserve Vue's query and focus
instead of remounting the app. Each instance cleans up its dialog and listeners.

Snapshots contain **metadata only**: catalog entries, saved identifiers,
filenames, display labels, residue counts and open/selected state. Source bytes,
protein coordinates, React contexts and Vue reactive objects do not cross this
boundary. Typed commands return to React for downloads, imports, IndexedDB
changes and confirmations. The shell retains the only Mol* viewer and parser
worker lifecycle.

If the Vue module cannot load or render, the workbench remains available and
the library explicitly enters **recovery mode**, with React open/import/search
controls and a retry action. A browser may retain a failed module request until
reload; if retry still fails, use the recovery controls and reload after the
connection returns. This boundary isolates lifecycle failures, not untrusted
code: both frameworks execute in the same page.

The [roadmap](ROADMAP.md) tracks the remaining option of independently deployed
microfrontends, including contract compatibility and atomic offline releases.

## Code map

| Directory | Responsibility |
| --- | --- |
| `apps/shell/src` | React shell, linked workbench, error recovery |
| `apps/shell/src/workers` | Cancelable, off-main-thread parsing |
| `apps/shell/src/data` | Source validation, downloads and IndexedDB library |
| `apps/shell/src/viewer` | Mol* lifecycle, residue identity mapping and camera |
| `apps/structure-library/src` | Vue library/search, typed mount adapter and lifecycle tests |
| `packages/contracts/src` | Framework-neutral versioned metadata and command contract |
| `packages/core/src/domain` | Shared scientific and source-file types |
| `packages/core/src/formats` | PDB, mmCIF and BinaryCIF parsing |
| `packages/core/src/analysis` | Composition and legacy propensity rules |
| `packages/core/src/exports` | Source, FASTA and standalone HTML downloads |
| `packages/theme` | Shared CSS tokens, layout and accessible visual conventions |
| `e2e` | Production-build browser workflows |

## Verification

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The typecheck covers both React TypeScript and Vue SFCs (`vue-tsc`); the build
also runs it. Unit tests cover scientific rules and the cross-framework lifecycle.
The browser suite serves the production build. On Linux CI, install browser
system dependencies with `npx playwright install --with-deps chromium`.
The parent repository still runs the original Python regression suite.
Normal tests need no Python checkout. To regenerate the committed golden
triplet fixture from the original source, run
`python3 packages/core/src/analysis/fixtures/generate_legacy.py /path/to/BioTool/biotool/app.py`.

## Data and dependencies

The bundled [`1CRN` mmCIF](https://files.rcsb.org/download/1CRN.cif) is from the
[PDB archive](https://www.wwpdb.org/about/usage-policies), distributed under CC0.
Consult the [structure entry](https://www.rcsb.org/structure/1CRN) for its
authors and primary citation. Catalog summaries are short original descriptions.

Mol*, React, React DOM and Vue are MIT-licensed. IBM Plex Sans and
IBM Plex Mono are distributed under the SIL Open Font License. See
[Mol*](https://github.com/molstar/molstar),
[React](https://github.com/facebook/react),
[Vue](https://github.com/vuejs/core), and
[IBM Plex](https://github.com/IBM/plex) for upstream licenses and credits.
The production build includes `third-party-licenses.txt` with the license
notices found in bundled dependency packages.
This migration does not invent a license for the surrounding BioTool project.
