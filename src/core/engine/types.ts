/**
 * The compiled program, as the engine sees it.
 *
 * The shape is the emitter's, and deliberately not a second declaration of it.
 * `compiled-program.md` is the contract, `emit/program.ts` is that contract
 * written in types, and an engine that declared its own copy would be the first
 * place the two could drift: a field renamed on one side and not the other
 * would compile on both and fail at a customer's.
 *
 * Nothing is imported at run time. Every import here is a type, so the engine
 * carries no dependency on the emitter in a build: a host that only runs
 * compiled programs never loads a line of the compiler.
 */
export type {
  Alert,
  Band,
  CallSite,
  CandleChannels,
  Cell,
  Channel,
  Colour,
  CompiledFunction,
  CompiledInput,
  CompiledProgram,
  Constant,
  Debug,
  Field,
  Grid,
  InputReference,
  Instruction,
  Level,
  Library,
  LibraryFunction,
  Limits,
  Loop,
  Marker,
  Meta,
  Outputs,
  Plot,
  Position,
  Register,
  StateRegion,
} from '../emit/index.js';
