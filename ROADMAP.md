# BioTool Website roadmap

## Direction

The React + TypeScript migration is published. The website now uses npm
workspaces with a Vue 3 + TypeScript discovery/library feature. Phases 1-3
describe the implemented architecture; phase 4 remains a future decision.

**Current release model:** a React application shell and one clearly bounded
Vue module release together. Multiple
frameworks do not require runtime Module Federation or separate deployments.
Keep those options available without taking on their operational costs early.

## Phase 1: Complete the current migration — implemented

Finish and publish the standalone application in
[ccastrotrejo/BioToolWebsite](https://github.com/ccastrotrejo/BioToolWebsite).
Preserve the scientific regression suite, source-file privacy, working
offline behavior, accessible controls, and self-contained exports.

Gate: the production build passes scientific, component and real-browser
workflows, including actual molecular rendering and cross-view selection.

## Phase 2: Introduce workspace boundaries — implemented

Convert the website repository to npm workspaces. Keep the current package
manager; add a task orchestrator only if measured build/test costs justify it.

Current layout:

```text
apps/
  shell/                 React: routing, workbench, molecular viewer
  structure-library/     Vue 3: discovery/library feature
packages/
  contracts/             Typed module lifecycle, commands and snapshots
  core/                  Framework-independent structure and analysis logic
  theme/                 CSS tokens, typography and accessibility conventions
```

Extract existing modules rather than rewriting scientific algorithms. Keep
browser adapters explicitly separated from pure calculations. Do not create
additional packages until a real boundary or a second consumer needs them.

Gate: the React app still works with unchanged scientific results, existing
offline behavior and no dependency on the old Python repository.

## Phase 3: Deliver one Vue feature — implemented

Vue owns the **structure discovery and device-library UI**, including search,
validation, collection buttons and saved-file controls. The tightly linked
molecule, sequence and analysis views remain together in React.

Use an explicit framework-neutral `mount / update / unmount` adapter. The React
shell gives the Vue module read-only library snapshots and typed callbacks for
opening a public accession, opening a saved structure, or requesting an import.
The Vue module must release its app instance, subscriptions and listeners when
unmounted.

Keep these responsibilities in the shell:

- Routing, active source, analysis scope and authoritative residue selection.
- IndexedDB access, source validation, downloads and worker scheduling.
- The single Mol* instance, camera and GPU lifecycle.
- Service-worker registration, cache versions, errors and recovery controls.

Do not pass React contexts, hooks, Vue reactive objects or Pinia stores across
the boundary. Use plain typed payloads with stable source/residue identifiers.
Share visual tokens, not framework-specific component implementations. Scope
Vue styles so they cannot restyle the rest of the workbench.

The Vue module adds no uploads or remote services. Its failures leave the
existing molecular workspace usable, with explicitly labeled React recovery
controls for opening, importing, searching and managing saved files.

Gate: contract tests plus browser tests prove React-to-Vue commands, Vue-to-React
events, repeated mount/unmount, keyboard/focus behavior, theme consistency,
offline use and absence of duplicate downloads or Mol* instances.

## Phase 4: Evaluate independently deployed microfrontends

Only introduce runtime composition, such as a Vite-compatible Module Federation
integration, when independent teams or release schedules make separate
deployments useful. A build-time Vue module in a monorepo is not yet an
independently deployed microfrontend, and that is an acceptable first step.

Before enabling independent releases, design and verify:

- Versioned host/module contracts and an explicit compatibility policy.
- Pinned, trusted module manifests, rollback and module-load failure handling.
- Routing ownership, dependency deduplication and cross-module diagnostics.
- Atomic offline asset versions: never cache an arbitrary `latest` remote entry
  alongside an incompatible shell.
- CSP, module origins and privacy review. A UI module boundary is not a security
  sandbox; all same-page code must remain trusted.
- Bundle and memory budgets, including both React and Vue runtimes.

Prefer shipping the shell and Vue module as one versioned offline-capable
artifact until this additional infrastructure has a demonstrated benefit.

## Backend remains optional

The monorepo and Vue module do not create a need for a backend. Add a Go service
only for a concrete server-side capability, such as authenticated collaboration
or computation that cannot reasonably run locally. Keep that decision separate
from the frontend framework split.
