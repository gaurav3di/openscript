# Numerical audit for release 0.7.0

Release 0.7.0 requires a complete inventory of shipped numerical functions,
comparison of both engines on the same inputs, and correction of confirmed
deviations. Equivalent calculations in the companion chart package must also be
checked. The engine gates now report exact agreement across all 116 scalar and
stateful numerical signatures. The broader chart mapping remains a separate
coverage item; this result does not claim every chart descriptor is equivalent.

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

Two-argument hypotenuse now uses exact integer arithmetic followed by one
nearest-even binary64 rounding in both engines. Independent rational comparisons
against adjacent-float midpoints certify 849 input pairs, also executed through
the same compiled program in both engines. Shared vectors changed only where
those certificates showed the previous last-bit result was wrong. This closes
the hypotenuse finding.

Exponential and logarithmic kernels now use the interval recipe in
`stdlib.md` section 20.10.2. Independent decimal enclosures and exact rational
rounding cells check their outputs, including actual compiled programs and the
derived Gaussian, historical-volatility and choppiness readings. Seventy changed
vector cells were individually certified before their expected bits were updated.
Power and trigonometry now follow sections 20.10.3 and 20.10.4. Power checks
include 18,174 independently certified cases with exact midpoint ties;
trigonometry checks include 22,247 independent certificates. Compiled programs
exercise historical values and replacement of forming bars. Before regeneration,
all 1,512 proposed scalar vector cells were independently checked: 46 existing
trigonometric cells changed and 189 power cells joined the vector inventory.
The Python vector driver now requires exact bits for every scalar case.

The three strict gates together compare 601,740 accepted calls across 3,308
cases, with zero differing bits, absence differences, oracle failures or
baseline failures. Five numeric array reducers and the three conversion signatures
`text/1`, `text/2` and `toNumber/1` have separate compiled checks, completing the
124 shipped entries in the primary numerical inventory. Planned functions are
not part of that shipped denominator.
These are finite test corpora and independently justified kernels, not an
exhaustive enumeration of every possible program or input history.

`node --disallow-code-generation-from-strings scripts/bench-alma.mjs` reports
compiled Gaussian workloads after both build commands. It compares both engines
and measures fixed and changing parameter tuples separately. The pure weight
cache retains at most eight tuples and 4,096 coefficients; changing parameters
can therefore cost substantially more than reusing a kernel. This report does
not raise the existing release performance budgets.

`npm run audit:stateful` compares every stateful numerical registry key in both
engines with the committed scope and vector inventory, then runs the expanded
input matrix and independent edge-case oracles. Run `npm run build` first. A
missing key, changed output shape, exception, non-finite leak, failed oracle or
differing bit makes the strict command fail. Platform labels only classify
findings; they do not allow a numerical difference.

`npm run audit:stateless` covers 35 declared scalar numerical calls, including
power in the shared vector inventory. It retains 146 baseline cases and
adds 8,260 edge comparisons and 11 independent oracle cases. It checks the
registry bindings directly, including raw signed-zero inputs, and reports any
non-normalized output. Compiled-program boundary checks separately establish
which raw binding behavior is visible through a public engine.

`npm run audit:varying` covers all 81 stateful signatures with 109 configurable
controls. Its 1,042 cases include 950 changing-control and source patterns, 81
checkpoint replays and 11 independent oracles. Temporary same-call contributions
and deliberately changed replay suffixes must leave accepted outputs identical
to an ordinary execution in each engine. Sparse execution indices are included;
they do not establish every compiled conditional or public update behavior.

`npm run test:audit` attacks the audit harnesses and their input protocol with deliberate
wrong numbers, absence shifts, missing columns, omitted functions and malformed
records. Commands ending in `:report` are exploratory modes that can finish
successfully while printing `exactAgreement: false`. It is not a release gate.
Use `--output <directory>` with the underlying script to retain every input,
output, difference and summary in a chosen directory. With no directory, it uses
a temporary directory and prints its location.

The stateful gate covers constant-parameter calls and includes exact baseline
vectors, extreme values, overflow followed by ordinary values, independent holes
and anchor patterns. The varying gate supplements it with changing controls.
Array, conversion and compiled-program checks remain additional requirements;
these commands do not silently claim them.

`npm run audit:numerics` runs the harness tests followed by all three strict gates.
Both publishing workflows require it after the full package checks. A remaining
platform-math difference blocks publication, even when it is only one bit.

Each defect needs a failing regression, an identified contract and a correction to
the responsible implementation. Keep both runtimes dependency-free and compiled
format version 1.1 unless a separately justified format change is required. No
additional market-data adapter is part of the audit.

Run full package checks, expanded numerical comparisons, compiled chart adapter
tests and installed-package probes before publishing. Both companion packages
carry 0.7.0 from one immutable source tag. Update the changelog and documentation
for every changed result, follow [the release procedure](../../RELEASING.md), and
verify artifacts after both workflows succeed.

The 0.7.0 local release candidate passes the complete package checks: 2,131
JavaScript tests, 948 Python tests and 102 shared conformance cases, with 19
compiler-only cases correctly skipped by the Python engine. All existing
performance budgets pass. Fresh installs outside the checkout run 322 compiled
programs across every numerical gate key: 35,035 historical bars and 70,070
forming deliveries produce 119,910 exactly matching output cells. Archive checks
confirm all runtime modules are included and imports resolve to the installed
packages. Registry verification is a separate step after publication.

The expanded chart composition sweep found additional overflowing-change and
range-sum cases after the first candidate. Python's TSI, RSI and Ultimate
Oscillator now normalize those named intermediate results before retaining or
dividing them. Ten new independent stateful oracles and compiled historical and
forming-bar regressions pass. The constant-parameter gate now includes 2,074
cases and 19 independent oracles. Ordinary vector expectations are unchanged.

The companion chart release remains a separate 2.5.4 deliverable. Its deferred
higher-timeframe input controls remain excluded. Testing existing requested
calculations does not add those controls.

The [implementation plan](../superpowers/plans/2026-09-25-numerical-audit.md)
records the work and verification steps. Raw research and execution logs remain
outside this repository.
