/** Exact scalar numerical gate. A diagnostic classification cannot waive a bit. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insistOnRefusing } from './lib/runtime.mjs';
import { runStatelessAudit } from './lib/stateless-numerics/index.mjs';

insistOnRefusing();

try {
  const argv = process.argv.slice(2);
  const options = { root: fileURLToPath(new URL('../', import.meta.url)) };
  let reportOnly = false;
  while (argv.length) {
    const argument = argv.shift();
    if (argument === '--report-only' && !reportOnly) reportOnly = true;
    else if (argument === '--output' && options.output === undefined && argv[0] && !argv[0].startsWith('--')) options.output = resolve(argv.shift());
    else throw new Error('Usage: node scripts/check-stateless-numerics.mjs [--report-only] [--output directory]');
  }
  const report = await runStatelessAudit(options);
  console.log(JSON.stringify({ mode: reportOnly ? 'report-only' : 'strict', exactAgreement: report.exactAgreement,
    denominator: report.denominator, edgeComparisons: report.edgeComparisons, counts: report.counts,
    failureCounts: report.failureCounts, platformDiagnostics: report.platformDiagnostics, output: report.output }, null, 2));
  if (!report.exactAgreement) {
    console.error('exactAgreement: false. Scalar numerical differences remain; no tolerance has been applied.');
    process.exitCode = reportOnly ? 0 : 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
