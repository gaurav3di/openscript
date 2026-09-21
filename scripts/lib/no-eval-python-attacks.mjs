/**
 * The corpus the Python arm of the no-eval check is attacked with, every run.
 *
 * The same discipline as `no-eval-attacks.mjs` next door, and written after
 * reading it, because the lesson there was paid for four times and none of it
 * is language specific: **answering a bypass with a pattern answers that
 * bypass**. A watched name can be spelled arbitrarily many ways, so a list of
 * spellings only ever has to be beaten once more. The three questions worth
 * asking of a form are which files the check opens, which matcher each one is
 * given, and what the masker leaves behind.
 *
 * Every form below is one JavaScript string literal, which `javascript.mjs`
 * masks before any JavaScript rule sees this file, so the whole attack set can
 * live here with nothing exempted from either arm of the check.
 *
 * ## The one that is Python's alone, and the reason this is not a translation
 *
 * The interpreter normalises every identifier with NFKC before it resolves it.
 * A name written in mathematical letters, in fullwidth letters or with a
 * modifier letter in it is a different sequence of code points, the same name
 * to the interpreter, and invisible to every pattern written against ASCII.
 * The three spellings below were run before they were written down: each one
 * really does call the string evaluator. `python-source.mjs` normalises a name
 * the way the interpreter does, which takes the whole family away at once
 * rather than a spelling at a time.
 *
 * ## What is deliberately refused outright rather than argued with
 *
 * The import machinery, the object loaders, the process starters and the
 * namespace of the built-in names are refused wherever they appear, not read
 * for whether their argument was written down. On the JavaScript side that
 * inversion had to exist because loading a module at run time is how a test
 * runner works. Here there is nothing to protect: an engine that reads a
 * compiled program has no plugin to load, no subprocess to start and no
 * pickled object to accept, so the narrower rule buys nothing and the wider one
 * cannot be got round by assembling an argument somewhere this cannot see.
 */

/**
 * Forms that build code out of text, or reach the machinery that does, and must
 * be refused in every Python file this project holds.
 *
 * The comment on each names the door, because the doors are the point and the
 * count is not.
 */
export const ATTACKS = [
  // The two plain spellings, which were never the interesting part.
  'value = eval(body)',
  'exec(body, region)',

  // Taken as a value first, so that no call site carries the name.
  'runner = eval',
  'from builtins import eval as runner',

  // The same name after normalisation, which the interpreter performs and a
  // pattern over ASCII does not. All three of these really do run the body.
  'value = \u{1D452}val(body)',
  'value = ｅｖａｌ(body)',
  'value = ᵉval(body)',

  // The compiler underneath both of them, which needs neither name.
  'program = compile(body, "<text>", "exec")',
  'program = compile(tree, "<text>", "eval")',

  // The namespace the two names live in, reached by a name assembled out of
  // pieces so that no pattern over spellings can see it.
  'runner = getattr(builtins, name)',
  'runner = getattr(builtins, "ev" + "al")',
  'setattr(builtins, name, runner)',
  'builtins.__dict__[name](body)',
  'runner = __builtins__["eval"]',

  // A module loaded by a name this file never writes down, at every spelling of
  // the machinery.
  'module = __import__(name)',
  'module = importlib.import_module(name)',
  'loader = importlib.machinery.SourceFileLoader(name, path)',
  'spec = importlib.util.spec_from_file_location(name, path)',
  'module = module_from_spec(spec)',
  'spec.loader.exec_module(module)',

  // A callable built out of bytes rather than out of characters, which is the
  // same guarantee broken with the text taken away.
  'program = marshal.loads(blob)',
  'plan = pickle.loads(blob)',
  'from pickle import loads',
  'store = shelve.open(path)',

  // The function object itself, built or replaced.
  'step = types.FunctionType(program, region)',
  'program = types.CodeType(*pieces)',
  'step.__code__ = other.__code__',
  'step.__globals__[name] = runner',

  // A namespace taken as a dictionary, where any name can be looked up or
  // written without either spelling appearing anywhere.
  'runner = globals()[name]',
  'table = vars()',
  'handler = locals()[name]',

  // The table of loaded modules, where a module nobody imported is installed.
  'sys.modules[name] = module',

  // A process, which is where text becomes a program that no scan here read.
  'subprocess.run([sys.executable, "-c", body])',
  'os.system(command)',
  'os.popen(command).read()',
  'os.execv(sys.executable, arguments)',
  'proc = multiprocessing.Process(target=step)',

  // Machine code, called directly.
  'library = ctypes.CDLL(path)',

  // The modules whose whole purpose is running text handed to them.
  'runpy.run_path(path)',
  'timeit.timeit(body)',
  'doctest.testmod(module)',
  'console = code.InteractiveInterpreter(region)',
  'compiler = codeop.CommandCompiler()',
  'pdb.set_trace()',

  // Inside a formatted string, where the braces are code and the rest is text.
  // A masker that read the whole literal as text would see none of this.
  'message = f"the answer is {eval(body)}"',
  'message = f"{getattr(builtins, name)(body)}"',

  // A module named as text and reached without an import statement, and the
  // flag that carries a program on a command line.
  'name = "importlib"',
  'arguments = [sys.executable, "-c"]',
  'command = "python -c print(1)"',
];

/**
 * Forms that are none of the above and must pass.
 *
 * This half keeps the rules honest in the other direction, and it is the half
 * that decides whether the rules survive contact with the engine being written
 * above them. A pattern loose enough to match everything passes every attack
 * and fails here, and a rule that reported an ordinary line would be turned off
 * inside a week.
 */
export const INNOCENT = [
  // The one reader of text that is safe and is allowed: it parses a literal and
  // builds a value, it runs nothing, and it is how a number or a string comes
  // out of a document without a compiler anywhere near it.
  'value = ast.literal_eval(cell)',
  'from ast import literal_eval',
  'number = literal_eval(text)',

  // Ordinary words that carry a watched name inside them. A rule that fired on
  // these would be unusable in an engine whose whole job is evaluating a
  // program and executing instructions.
  'evaluated = evaluate(node, frame)',
  'self.execute_instruction(program, bar)',
  'marshalled = None',
  'order = self.compile_time_order',
  'def compile_note(self, entry):',

  // The pattern builder, which is a different function with the same name and
  // is reached through a module.
  'pattern = re.compile(r"^[a-z]+$")',
  'self.matcher = re.compile(NAME)',

  // Prose about the rule, in a comment and in a docstring, which is the reason
  // the mask exists at all.
  '# eval and exec are refused here, and so is the compiler',
  '"""A docstring naming eval, exec, compile and builtins."""',
  'note = "eval is refused everywhere in this package"',

  // A raw literal, whose escapes the interpreter does not resolve. Decoded as
  // an ordinary literal this one reads as a watched name, which is the failure
  // in the other direction from the respellings above.
  'pattern = r"\\x65val"',

  // The standard library this engine is allowed to know.
  'import json',
  'import struct',
  'from pathlib import Path',
  'from decimal import Decimal',

  // A relative import, which is how one module of the package reaches another.
  'from .machine import step',
  'from . import library',

  // The two reflective builtins used the way anybody uses them, on an object
  // that is not the namespace of the built-in names.
  'name = getattr(entry, "name")',
  'setattr(self, field, value)',
  'fields = vars(entry)',

  // The rest of a module whose other members are refused.
  'point = types.SimpleNamespace(high=high, low=low)',
  'if sys.version_info < (3, 12):',
  'here = os.path.dirname(path)',

  // A formatted string whose substitutions are ordinary values.
  'message = f"{value:.2f} at bar {index}"',
  'label = f"{entry.name}({entry.arity})"',

  // A dictionary key that happens to be a word this check watches for in other
  // positions. A rule that read every literal as a module name would report
  // every diagnostic in the engine.
  'row = {"code": code, "message": message}',
];
