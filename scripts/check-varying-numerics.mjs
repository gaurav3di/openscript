/** Strict changing-control gate, including restored and replayed state. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insistOnRefusing } from './lib/runtime.mjs';
import { runVaryingAudit } from './lib/varying-numerics/index.mjs';

insistOnRefusing();

try {
  let output, reportOnly = false;
  const args = process.argv.slice(2);
  for (let at = 0; at < args.length; at++) {
    if (args[at] === '--report-only' && !reportOnly) reportOnly = true;
    else if (args[at] === '--output' && output === undefined && args[at + 1] && !args[at + 1].startsWith('--')) output = resolve(args[++at]);
    else throw new Error('Usage: node scripts/check-varying-numerics.mjs [--report-only] [--output directory]');
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const report = await runVaryingAudit({ root, output });
  console.log(JSON.stringify({ mode: reportOnly ? 'report-only' : 'strict', exactAgreement: report.exactAgreement,
    corpusVersion: report.corpusVersion, denominator: report.denominator, controls: report.controls,
    counts: report.counts, execution: report.execution, failureCounts: report.failureCounts,
    platformDiagnostics: report.platformDiagnostics, output: report.output }, null, 2));
  if (!report.exactAgreement) {
    console.error('exactAgreement: false. Numerical differences remain; platform labels are classification only.');
    if (!reportOnly) process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
