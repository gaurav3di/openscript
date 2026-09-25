# Numerical audit implementation plan

> For agentic workers: use subagent-driven development with exclusive file
> ownership. Parent owns integration, shared manifests, specification and releases.

**Goal:** Validate shipped numerical calculations, fix confirmed deviations
between both engines and equivalent chart calculations, and release both engine
packages as 0.7.0.

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
- Retain compiled format 1 and caller signatures unless a demonstrated defect
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
- [ ] Inventory names, arities, paths, parameter contracts and existing fixtures
  from engine manifests and the chart registry.
- [ ] Include numeric reducers and conversions outside current vector groups.
- [ ] Partition cases by family with exclusive source and test-file ownership.
  Check the final ledger against live manifests to prevent silent omissions.

## 2. Window-state disagreements

- [ ] Probe `sum` with source `[1, 2, 3]` and lengths `[3, 3, 2]` in both engines.
  Determine whether the compiler accepts that changing input.
- [ ] Read the specified window contract before choosing the expected sequence.
- [ ] Add shrinking/growing windows, source holes and restored state to the
  existing series test families in both engines.
- [ ] Demonstrate a failing regression, correct the violating implementation,
  then run focused tests and shared fixtures before committing.

## 3. Numerical comparison coverage

- [ ] Extend generation in a separate module consumed by
  `scripts/generate-library-vectors.mjs`, which is already at its size limit.
- [ ] Reuse bit-pattern columns and existing Python replay drivers. Add
  adversarial sequences, independent paired holes, parameter variants, seed
  edges, anchors and extreme finite inputs.
- [ ] Add drivers for numerical callables missing from the current generator.
  Refuse missing drivers and count each executed function and output.
- [ ] Prove comparison mutations fail for changed numbers, shifted absence,
  missing columns and missing functions.
- [ ] Give each defect independent expected arithmetic before changing a runtime
  or its vectors. Track open differences by function, case, output and bar.

## 4. Compiled programs and charts

- [ ] Execute affected calculations as real programs in both engines through
  full history, forming updates and state restoration.
- [ ] Map every chart indicator to equivalent calls or a compiled composition,
  specifying source fields, parameters, seed and session policy.
- [ ] Compare shared fixtures and correct proven chart defects with regressions
  in the separate chart worktree.
- [ ] Run chart adapter integration against both the corrected engine candidate
  and the previously published engine.

## 5. Review and release

- [ ] Independently review fixes, open findings and inventory coverage.
- [ ] Update arithmetic documentation and changelog; bump both manifests and the
  lockfile to 0.7.0 while retaining compiled format 1.
- [ ] Run `npm test`, expanded comparisons and compiled chart integration.
- [ ] Build and inspect both distributions, install outside the repository and
  execute compiled numerical probes through installed entry points.
- [ ] Commit and push tested source; tag and dispatch both release workflows
  according to `RELEASING.md`.
- [ ] Verify workflows, registry versions, downloaded artifacts and installed
  results. Report release links and any explicitly unresolved limitation.
