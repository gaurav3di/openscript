# Numerical audit for release 0.7.0

Release 0.7.0 requires a complete inventory of shipped numerical functions,
comparison of both engines on the same inputs, and correction of confirmed
deviations. Equivalent calculations in the companion chart package must also be
checked. The audit is in progress; complete numerical agreement is not claimed.

## Comparison contract

Compare every output at every bar, including absence, the first available value,
multi-output ordering and state after an update. Use binary64 bit patterns so
decimal formatting cannot conceal a difference. The target is exact agreement
between the two engines. Existing exceptions for platform mathematics are
findings to resolve or explicitly report, not implicit passes.

The language specification determines intended arithmetic, seeds, windows and
missing-value behavior. Two agreeing engines can still implement the wrong
formula. Each correction needs a small independently derived expected case or an
independently justified invariant as well as cross-engine agreement. Do not
regenerate expected files simply to accept an implementation change.

Compare chart calculations with the same source, parameters, session boundaries
and units. Record differences in documented defaults separately from defects.
Where no equivalent language call exists, test a compiled composition when one
can express the calculation and record it. Missing equivalents and untested
indicators stay open coverage items.

## Inventory and inputs

Inventory names and arities from the engine manifests, including aliases, numeric
array reducers, conversions and operations outside existing vector groups.
Inventory every shipped chart descriptor and output key, including external-data
indicators with deterministic fixture providers. Keep declared, executable,
compared and independently checked counts separate.

The input matrix covers:

- Ordinary, flat, trending, alternating and reversing sequences.
- Empty and short histories, length one, seed boundaries and long histories.
- Missing values before, during and after warm-up; independent paired holes;
  missing and zero volume.
- Changing lengths and parameters wherever the public language permits them.
- Large finite values, small values, cancellation and signed-zero normalization.
- Ties, pivot confirmation, shifted outputs, sessions and anchor resets.
- Multiple outputs and absent optional arguments.
- Full replay, incremental execution, forming-bar replacement, state restoration,
  requested contexts and chart adapter updates.

Use fixed synthetic inputs and recorded deterministic seeds. Drivers must refuse
unknown functions, unexpected output shapes and cases comparing no values.
Comparator self-tests must reject changed values, shifted absence, omitted output
columns and missing functions.

## Fix and release gates

`npm run audit:stateful` compares every stateful numerical registry key in both
engines with the committed scope and vector inventory, then runs the expanded
input matrix and independent edge-case oracles. Run `npm run build` first. A
missing key, changed output shape, exception, non-finite leak, failed oracle or
differing bit makes the strict command fail. Platform labels only classify
findings; they do not allow a numerical difference.

`npm run test:audit` attacks the comparator and input protocol with deliberate
wrong numbers, absence shifts, missing columns, omitted functions and malformed
records. `npm run audit:stateful:report` is an exploratory mode that can finish
successfully while printing `exactAgreement: false`. It is not a release gate.
Use `--output <directory>` with the underlying script to retain every input,
output, difference and summary in a chosen directory. With no directory, it uses
a temporary directory and prints its location.

This gate covers constant-parameter calls and includes exact baseline vectors,
extreme values, independent holes and anchor patterns. Varying-parameter,
stateless, array, conversion and compiled-program checks remain additional
requirements; this command does not silently claim them.

Each defect needs a failing regression, an identified contract and a correction to
the responsible implementation. Keep both runtimes dependency-free and compiled
format version 1 unless a separately justified format change is required. No
additional market-data adapter is part of the audit.

Run full package checks, expanded numerical comparisons, compiled chart adapter
tests and installed-package probes before publishing. Both companion packages
carry 0.7.0 from one immutable source tag. Update the changelog and documentation
for every changed result, follow [the release procedure](../../RELEASING.md), and
verify artifacts after both workflows succeed.

The companion chart release remains a separate 2.5.4 deliverable. Its deferred
higher-timeframe input controls remain excluded. Testing existing requested
calculations does not add those controls.

The [implementation plan](../superpowers/plans/2026-09-25-numerical-audit.md)
records the work and verification steps. Raw research and execution logs remain
outside this repository.
