/**
 * The compiled program, as `compiled-program.md` section 2 defines it.
 *
 * This file is the artifact's shape and nothing else: no logic, no defaults, no
 * decisions. It is separate because the artifact is the public contract of the
 * project. Somebody implementing an engine in another language reads the
 * specification and then reads this to check the two agree, and a type with a
 * field the specification does not have, or missing one it does, is the defect
 * no test of our own engine would ever catch.
 *
 * Field order here follows the specification's. It is not the order canonical
 * encoding writes: that one sorts keys, and `canonical.ts` is where it happens.
 */

/** One entry of the constant pool, `compiled-program.md` 2.9. */
export type Constant =
  | readonly ['z', null]
  | readonly ['b', boolean]
  | readonly ['n', number]
  | readonly ['s', string]
  | readonly ['c', Colour];

/** Red, green and blue as whole numbers 0 to 255, alpha as a number 0 to 1. */
export type Colour = readonly [number, number, number, number];

/**
 * One instruction: the opcode name, then its operands.
 *
 * The opcode is a string because the format says so (2.14), so a program is
 * readable and diffable by hand and a format that adds an opcode renumbers
 * nothing.
 */
export type Instruction = readonly [string, ...number[]];

/**
 * A declaration field a script wrote with an `input()`, 2.3.
 *
 * The engine resolves it once at load and substitutes the value, so nothing of
 * this form survives to bar 0.
 */
export interface InputReference {
  readonly input: string;
}

/** Anything a declaration field may hold: a value, or a reference to an input. */
export type Field =
  | null
  | boolean
  | number
  | string
  | Colour
  | readonly number[]
  | InputReference;

export interface FormatVersion {
  readonly format: string;
  readonly language: number;
}

export interface CompilerStamp {
  readonly name: string;
  readonly version: string;
}

export interface SourceStamp {
  readonly hash: string;
  readonly lines: number;
  readonly file: string | null;
}

export interface StrategyMeta {
  readonly capital: Field;
  readonly currency: Field;
  readonly qty: Field;
  readonly qtyType: Field;
  readonly product: Field;
  readonly fillOn: Field;
  readonly slippage: Field;
  readonly commission: Field;
  readonly commissionType: Field;
  readonly pyramiding: Field;
  readonly closeOnSessionEnd: Field;
}

export interface Meta {
  readonly kind: 'study' | 'strategy';
  readonly title: Field;
  readonly short: Field;
  readonly overlay: Field;
  readonly precision: Field;
  readonly format: Field;
  readonly range: Field;
  readonly scale: Field;
  readonly group: Field;
  readonly onUnconfirmed: Field;
  /** Present only when `kind` is `"strategy"`, 2.3. */
  readonly strategy?: StrategyMeta;
}

export interface Limits {
  readonly loops: number;
  readonly history: number | null;
}

export interface LibraryFunction {
  readonly name: string;
  readonly arity: number;
  readonly state: boolean;
  readonly effect: 'none' | 'signal' | 'order' | 'draw' | 'log';
}

export interface Library {
  readonly manifest: number;
  readonly functions: readonly LibraryFunction[];
}

export interface CompiledInput {
  readonly key: string;
  readonly kind: string;
  readonly label: string;
  readonly default: Constant;
  readonly min: number | null;
  readonly max: number | null;
  readonly step: number | null;
  readonly options: readonly Constant[] | null;
  readonly group: string;
  readonly tooltip: string | null;
  readonly slot: number;
}

export interface Channel {
  readonly id: number;
  readonly type: 'number' | 'string' | 'color' | 'bool';
  readonly defer: boolean;
  readonly once: boolean;
}

export interface CandleChannels {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly colorUp: Field;
  readonly colorDown: Field;
  readonly wickColor: Field;
  readonly borderColor: Field;
  readonly colorUpChannel: number | null;
  readonly colorDownChannel: number | null;
  readonly wickColorChannel: number | null;
  readonly borderColorChannel: number | null;
}

export interface Plot {
  readonly key: string;
  readonly title: Field;
  readonly type: string;
  readonly channel: number;
  readonly color: Field;
  readonly colorChannel: number | null;
  readonly width: Field;
  readonly lineStyle: Field;
  readonly offset: Field;
  readonly overlay: Field;
  readonly scale: Field;
  readonly precision: Field;
  readonly priceFormat: Field;
  readonly ohlc: CandleChannels | null;
}

export interface Band {
  readonly between: readonly [string, string];
  readonly colorUp: Field;
  readonly colorDown: Field;
  readonly colorUpChannel: number | null;
  readonly colorDownChannel: number | null;
  readonly opacity: Field;
  readonly overlay: Field;
}

export interface Level {
  readonly title: Field;
  readonly channel: number;
  readonly color: Field;
  readonly lineStyle: Field;
  readonly lineWidth: Field;
}

export interface Marker {
  readonly key: string;
  readonly channel: number;
  readonly position: Field;
  readonly shape: Field;
  readonly color: Field;
  readonly textColor: Field;
}

export interface TableOptions {
  readonly textColor: Field;
  readonly bgColor: Field;
  readonly borderWidth: Field;
}

export interface Grid {
  readonly key: string;
  readonly title: Field;
  readonly slot: number;
  readonly position: Field;
  readonly rows: Field;
  readonly cols: Field;
  readonly options: TableOptions;
}

export interface Alert {
  readonly key: string;
  readonly title: Field;
  readonly condChannel: number;
  readonly messageChannel: number | null;
  readonly frequency: Field;
}

export interface Paint {
  readonly channel: number;
}

export interface Outputs {
  readonly plots: readonly Plot[];
  readonly fills: readonly Band[];
  readonly levels: readonly Level[];
  readonly markers: readonly Marker[];
  readonly tables: readonly Grid[];
  readonly alerts: readonly Alert[];
  readonly barColor: Paint | null;
  readonly background: Paint | null;
}

export interface Register {
  readonly id: number;
  readonly kind: 'bar' | 'computed' | 'argument';
  readonly field: string | null;
  readonly name: string | null;
}

export interface Frame {
  readonly slots: number;
}

export interface Cell {
  readonly id: number;
  readonly kind: 'var' | 'live';
  readonly name: string | null;
}

export interface StateRegion {
  readonly id: number;
  readonly fn: number;
}

export interface CompiledFunction {
  readonly name: string;
  readonly params: number;
  readonly slots: number;
  readonly code: readonly Instruction[];
}

export interface CallSite {
  readonly fn: number;
  readonly argc: number;
  readonly cellBase: number;
  readonly stateBase: number;
  readonly series: readonly number[];
}

export interface Loop {
  readonly id: number;
  readonly kind: 'for' | 'forIn' | 'while';
  readonly line: number;
  readonly col: number;
}

/** `[instructionIndex, line, column]`, ascending by index, 2.15. */
export type Position = readonly [number, number, number];

export interface DebugNames {
  readonly slots: readonly string[];
  readonly cells: readonly string[];
  readonly series: readonly string[];
  readonly channels: readonly string[];
}

export interface Debug {
  readonly pos: readonly Position[];
  readonly fnPos: readonly (readonly [number, readonly Position[]])[];
  readonly names: DebugNames;
  readonly retain: boolean;
}

export interface CompiledProgram {
  readonly openscript: FormatVersion;
  readonly requires: readonly string[];
  readonly compiler: CompilerStamp;
  readonly source: SourceStamp;
  readonly meta: Meta;
  readonly limits: Limits;
  readonly lib: Library;
  readonly inputs: readonly CompiledInput[];
  readonly channels: readonly Channel[];
  readonly outputs: Outputs;
  readonly consts: readonly Constant[];
  readonly series: readonly Register[];
  readonly frame: Frame;
  readonly cells: readonly Cell[];
  readonly states: readonly StateRegion[];
  readonly functions: readonly CompiledFunction[];
  readonly callSites: readonly CallSite[];
  readonly loops: readonly Loop[];
  readonly code: readonly Instruction[];
  readonly debug: Debug;
}
