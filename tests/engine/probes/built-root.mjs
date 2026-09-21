/**
 * A probe of the built package root, run in a process of its own.
 *
 * It imports the file the manifest's root entry names, statically and by its
 * path, the way a consumer's bundler resolves the package, and answers with
 * what it found there: whether `loadText` is a function on that door, and what
 * it says of the text it was handed. One JSON object on standard output, so
 * the test that spawns this reads a document and not prose. Nothing is decided
 * here; the test beside this file holds the answer to what the door promises.
 */
import { loadText } from '../../../dist/core/index.js';

const callable = typeof loadText === 'function';
const loaded = callable ? loadText(process.argv[2] ?? '') : null;

process.stdout.write(
  JSON.stringify({
    callable,
    ok: loaded === null ? null : loaded.ok,
    code: loaded === null || loaded.ok ? null : loaded.diagnostic.code,
  }),
);
