/**
 * A read of another instrument, served from the case's own file.
 *
 * `conformance.md` section 3: every byte of input lives in the case directory,
 * so a read a host would answer (`host-interface.md` 5.3) is answered from a
 * file the case holds, named after the instrument the read asks for:
 * `bars.OTHER.csv` for a read of `OTHER`, with the columns `bars.csv` has, at
 * the timeframe the read requests. A read of the chart's own instrument is not
 * a file: the engine folds `bars.csv`, as it folds the bars it holds, so this
 * answers nothing for one and the engine goes on to fold.
 *
 * **A read whose file is missing is a case failure, not an absent series.** A
 * silently empty series is exactly the bug the suite is meant to catch. The
 * engine asks once per read, at load, and a question this cannot answer from
 * the directory is recorded and reported by the caller as the `error` of
 * section 9, naming the file, rather than handed to the study as a refusal it
 * would draw around. The one exception is a read with no instrument at all, a
 * setting that held none: there is no file to name, and `host-interface.md`
 * 5.2 says what a host answers then, which is OS6007.
 *
 * The second engine serves the same reads from the same files by the same
 * rule, in `engine/openscript/adapter/secondary.py`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBars } from './case-reading.mjs';

/**
 * The host a case is, for reads: its own files, and nothing it does not hold.
 *
 * `secondary` is the directory's secondary series by file name, as
 * `readCaseDirectory` lists them, and `header` is section 3's `bars.csv`
 * header line. Returns the provider to hand the run and `problem()`, which is
 * the first file a read asked for and could not be served, or `null`.
 */
export function caseReads(directory, secondary, header) {
  let problem = null;
  const provider = (query) => {
    if (query.read !== 'symbol') return undefined;
    if (query.instrument === null) return { refused: { code: 'OS6007' } };
    const name = `bars.${query.instrument}.csv`;
    if (!secondary.includes(name)) {
      problem ??=
        `${name} is missing: the script reads ${query.instrument} at ${query.timeframe}, and ` +
        'conformance.md section 3 serves a read of another instrument from that file. A read ' +
        'whose file is missing is a case failure, not an absent series';
      return { refused: { code: 'OS6007' } };
    }
    const parsed = parseBars(readFileSync(join(directory, name), 'utf8'), header);
    if (!parsed.ok) {
      problem ??= `${name}: ${parsed.reason}`;
      return { refused: { code: 'OS6007' } };
    }
    return { bars: parsed.rows };
  };
  return { provider, problem: () => problem };
}
