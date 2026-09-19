/**
 * The source text and the index over it. The one place that normalises a file,
 * so every offset in the compiler means the same thing.
 */
export type { SourceFile, SourcePosition } from './source.js';
export { normaliseSource, sourceFile } from './source.js';
