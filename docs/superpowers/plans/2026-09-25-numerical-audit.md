# Numerical audit implementation plan

> For agentic workers: use subagent-driven development with exclusive file
> ownership. Parent owns integration, shared manifests, specification and releases.

**Goal:** Validate shipped numerical calculations, fix confirmed deviations
between both engines and equivalent chart calculations, and release both engine
packages as 0.7.0, followed by a corrective 0.7.1 release for the subsequently
confirmed directional-overflow discrepancy.

**Architecture:** Extend manifest-driven vectors and real compiled-program
comparisons. Keep independent expectations separate from generated observations.
Preserve existing runtime and adapter boundaries.

**Tech stack:** The existing typed compiler, JavaScript and Python runtimes,
binary64 fixtures and dependency-free test tools.

**Spec:** [Numerical audit contract](../../integrating/numerical-audit.md).

## Global constraints

- No runtime dependencies, dynamic code construction or copied external code.
- No comparison names, real instruments, emoji or long dash characters.
- Every code file stays within its existing modularity limit.
- Retain compiled format 1.1 and caller signatures unless a demonstrated defect
  requires a documented language change.
- Both packages ship one version from one immutable tag.
- Higher-timeframe input controls and additional feed adapters remain excluded.

## Review focus

1. Missing callables must not disappear from the coverage count.
2. Equality includes warm-up absence and every output column.
3. Agreeing implementations can share formula or argument-order mistakes.
4. Changing inputs and restored state need checks beyond constant-input batches.
5. Installed-package tests must not import the development checkout.

## 1. Baseline and inventory

- [x] Create an isolated branch from the current development revision.
- [x] Run the complete existing suite before changing code and retain its log.
- [x] Inventory names, arities, paths, parameter contracts and existing fixtures
  from engine manifests and the chart registry.
- [x] Include numeric reducers and conversions outside current vector groups.
- [x] Partition cases by family with exclusive source and test-file ownership.
  Check the final ledger against live manifests to prevent silent omissions.

## 2. Window-state disagreements

- [x] Probe `sum` with source `[1, 2, 3]` and lengths `[3, 3, 2]` in both engines.
  Determine whether the compiler accepts that changing input.
- [x] Read the specified window contract before choosing the expected sequence.
- [x] Add shrinking/growing windows, source holes and restored state to the
  existing series test families in both engines.
- [x] Demonstrate a failing regression, correct the violating implementation,
  then run focused tests and shared fixtures before committing.

## 3. Numerical comparison coverage

- [x] Extend generation in separate audit modules, retaining the shared baseline
  generator and its published vectors.
- [x] Reuse bit-pattern columns and existing Python replay drivers. Add
  adversarial sequences, independent paired holes, parameter variants, seed
  edges, anchors and extreme finite inputs.
- [x] Add drivers for numerical callables missing from the current generator.
  Refuse missing drivers and count each executed function and output.
- [x] Prove comparison mutations fail for changed numbers, shifted absence,
  missing columns and missing functions.
- [x] Give each defect independent expected arithmetic before changing a runtime
  or its vectors. Track open differences by function, case, output and bar.

## 4. Compiled programs and charts

- [x] Execute affected calculations as real programs in both engines through
  full history, forming updates and state restoration.
- [ ] Map every chart indicator to equivalent calls or a compiled composition,
  specifying source fields, parameters, seed and session policy.
- [ ] Compare shared fixtures and correct proven chart defects with regressions
  in the separate chart worktree.
- [ ] Run chart adapter integration against both the corrected engine candidate
  and the previously published engine.

## 5. Review and release

- [x] Independently review engine fixes, open findings and inventory coverage.
- [x] Update arithmetic documentation and changelog; bump both manifests and the
  lockfile to 0.7.0 while retaining compiled format 1.1.
- [x] Run `npm test`, expanded comparisons and compiled chart integration for
  the 0.7.0 engine release.
- [x] Build and inspect both distributions, install outside the repository and
  execute compiled numerical probes through installed entry points.
- [x] Commit and push tested 0.7.0 source; tag and dispatch both release workflows
  according to `RELEASING.md`.
- [x] Verify 0.7.0 workflows, registry versions, downloaded artifacts and installed
  results. Report release links and any explicitly unresolved limitation.

## Verified implementation progress

The engine inventory is complete: all 116 scalar/stateful keys plus five numeric
array reducers and three conversions have drivers. The separate audit modules
retain the shared baseline vectors and add adversarial inputs, changing controls,
independent oracles, rollback and replay checks. All three strict gates pass,
covering 1,504,908 accepted calls across 6,836 cases without tolerance. Corrected
kernels and vector changes have independent rounding certificates.

Both 0.7.0 packages were published from immutable tag `v0.7.0`, at commit
`f9ab00e4e9238b442ae0ad3639f52bc5dc45394b`, with compiled format 1.1 unchanged.
The release workflows passed, and freshly downloaded distributions passed 363
installed compiled programs across all 116 numerical signatures and 41
independent expected-result cases. Archive source bytes, registry digests and
attestation source and digest claims were checked. Attestation signatures were
not cryptographically verified. The companion chart release and remaining
native definition differences are separate work; the engine result does not
close that coverage.

Expanded compiled chart compositions exposed Python overflow-boundary defects
in TSI, RSI and Ultimate Oscillator. Regression tests failed before their
normalization fixes. An independent field-stress matrix also found MFI and CCI
overflow in Python and correlation overflow in JavaScript. These now propagate
absence at the specified boundaries and recover with fresh finite windows.
The complete suite now passes 2,161 JavaScript tests and 956 Python tests.
All strict numerical gates pass, including declared defaults, isolated field
shocks, 963 checkpoint restoration cases and 963 replay cases.
These checks preceded the completed 0.7.0 publication.

## Corrective 0.7.1 release checkpoint

After publication, an independent chart composition exposed a selected
directional movement overflowing before Python's ADX smoother. The correction
normalizes the selected movement to absence after the raw direction comparisons.
It preserves finite arithmetic, tie handling, caller signatures and compiled
format 1.1. Published 0.7.0 source and artifacts remain unchanged.

The isolated corrective candidate passes 2,209 JavaScript tests, 960 Python
tests and 102 shared conformance cases, with the same 19 compiler-only skips.
The strict gates compare 1,504,918 accepted calls across 6,838 cases, with no
differing bits or absence results. Both directions, pre-seed and post-seed
overflow, competing finite movement, ties, missing fields and forming-bar
replacement have independent expected cases.

Fresh local installations pass 379 compiled programs over all 116 numerical
signatures and 57 independent expected-result cases. At this pre-publication
checkpoint, source integration, release workflows and fresh public artifact
verification are the remaining 0.7.1 release operations.
