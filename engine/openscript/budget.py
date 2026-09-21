"""The counters that make a runaway script stop, and the ceilings a host sets.

The engine owns the loop, so every one of these is a number it increments rather
than something it hopes about. A platform running many customers' scripts in one
process needs exactly that: exceeding a budget is a diagnostic on the script that
did it, never a hang and never a frozen tab.

**Two kinds of budget, and the difference matters.**

The *loop budget* is part of the language. Section 8.5 requires two engines to
fail at the same iteration of the same loop on the same bar, so it counts
``TICK`` executions and nothing else, it comes from the program's own ``limits()``
line, and it is identical on every engine.

The *host ceilings* are not part of the language and cannot be. They exist so
that one script cannot take a process down, and a host that sets one accepts
that a program refused here may run elsewhere. None of them silently caps
anything: section 2.4 is explicit that a host refuses at load, naming the limit
and the value it allows, because a program that quietly gets a smaller budget
than it asked for produces a wrong number instead of a message and nothing on
the chart would say which number.

**There is no wall clock here.** A clock measures the machine rather than the
program, so a default one would make the same script pass on a fast machine and
fail on a slow one with nobody having asked for that trade. The step ceiling
below does the work a clock would otherwise do, and it is derived from the
program rather than chosen.
"""

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .diagnostics import Diagnostic, Position, failure, raise_at


@dataclass(frozen=True)
class EngineLimits:
    """What this engine allows, with ``None`` meaning no ceiling of its own."""

    #: Call frames, OS5005 at load.
    frames: int = 64
    #: Code points one string may hold, OS5008.
    #:
    #: No document fixes this number: ``errors.md`` OS5008 states that there is a
    #: ceiling and carries it in the message, and a host that sets one accepts
    #: that a script refused here runs elsewhere. What a number left open does
    #: not excuse is two engines choosing differently, because a case that
    #: reaches the ceiling would then be refused by one of them and run by the
    #: other, and section 10 calls a difference on a channel both answer a
    #: release blocker. So this is the first engine's number, and the day either
    #: moves the other moves with it.
    string_length: int = 100_000
    #: The most a program's own ``limits(loops = ...)`` may ask for, OS5003.
    loops: Optional[int] = None
    #: The most a program's own ``limits(history = ...)`` may ask for, OS5003.
    history: Optional[int] = None
    #: Instructions in the whole program, OS5009 at load.
    instructions: Optional[int] = None
    #: State regions, OS5004 at load.
    states: Optional[int] = None
    #: Reads one file may make, OS5006 at load.
    requests: Optional[int] = None


DEFAULT_LIMITS = EngineLimits()


def all_code(program: Any) -> List[Sequence[Any]]:
    """Every instruction list in the program, the bodies of its reads included.

    A read's expression is part of the program: an engine that cannot run an
    ``ELEM`` cannot run one inside a read either, and a budget or a tag worked
    out from the bar's list alone would say otherwise.
    """
    lists: List[Sequence[Any]] = [program["code"]]
    lists.extend(one["code"] for one in program["functions"])

    def walk(requests: Sequence[Any]) -> None:
        for request in requests:
            body = request["body"]
            lists.append(body["code"])
            lists.extend(one["code"] for one in body["functions"])
            walk(body["requests"])

    walk(program["requests"])
    return lists


def _opcode_of(instruction: Any) -> Optional[str]:
    """The opcode of one element of a list, or nothing when it is not an instruction.

    The budget refusals are step 7 of section 9.4 and verification is step 8, so
    the walks here read lists that nothing has yet proved are instruction lists.
    Reading them defensively is what keeps the order from turning a malformed
    program into a thrown error rather than the OS6018 step 8 is about to report.
    """
    return instruction[0] if isinstance(instruction, list) and instruction else None


def _count_requests(requests: Sequence[Any]) -> int:
    found = 0
    for one in requests:
        found += 1 + _count_requests(one["body"]["requests"])
    return found


def _sites_in(code: Sequence[Any]) -> List[int]:
    return [
        one[1]
        for one in code
        if _opcode_of(one) == "CALL_FN" and len(one) > 1 and isinstance(one[1], int)
    ]


def call_depth(program: Any) -> int:
    """The deepest chain of call sites, which is the deepest the frame stack goes.

    Recursion is an error in the language, so the call graph is acyclic and the
    walk terminates; the guard below is against a program written by something
    other than a conforming compiler, and it stops rather than looping forever.
    """
    bodies = [one["code"] for one in program["functions"]]
    known: Dict[int, int] = {}
    walking: set = set()

    def depth_of(site: int) -> int:
        if site in known:
            return known[site]
        if site in walking:
            return 1
        walking.add(site)
        entry = program["callSites"][site] if site < len(program["callSites"]) else None
        body = bodies[entry["fn"]] if entry is not None and entry["fn"] < len(bodies) else []
        deepest = 0
        for inner in _sites_in(body):
            deepest = max(deepest, depth_of(inner))
        walking.discard(site)
        known[site] = deepest + 1
        return known[site]

    deepest = 0
    for site in _sites_in(program["code"]):
        deepest = max(deepest, depth_of(site))
    return deepest + 1


def _busiest_pair(program: Any) -> Tuple[str, str]:
    """The two functions whose nesting produced the most call paths.

    OS5004's message names them because the number of paths grows
    multiplicatively where several functions each call the next more than once,
    and a reader told only the total has nowhere to start.
    """
    counts: Dict[str, int] = {}
    listings = [("the top level", program["code"])]
    listings.extend((one["name"], one["code"]) for one in program["functions"])
    for caller, code in listings:
        for instruction in code:
            if _opcode_of(instruction) != "CALL_FN":
                continue
            site = instruction[1]
            if not isinstance(site, int) or site >= len(program["callSites"]):
                continue
            which = program["callSites"][site]["fn"]
            if which >= len(program["functions"]):
                continue
            callee = program["functions"][which]["name"]
            key = f"{caller}\x00{callee}"
            counts[key] = counts.get(key, 0) + 1
    best = ("the top level", "the functions it calls")
    most = 0
    # Sorted before the walk, so the answer does not depend on a table's order.
    for key in sorted(counts):
        if counts[key] <= most:
            continue
        caller, callee = key.split("\x00")
        best, most = (caller, callee), counts[key]
    return best


def check_budgets(program: Any, limits: EngineLimits) -> Optional[Diagnostic]:
    """Step 7 of section 9.4: each ceiling in turn, stopping at the first one over."""
    asked = program["limits"]
    if limits.loops is not None and asked["loops"] > limits.loops:
        return failure("OS5003", option="loops", max=limits.loops, found=asked["loops"])
    history = asked["history"]
    if limits.history is not None and history is not None and history > limits.history:
        return failure("OS5003", option="history", max=limits.history, found=history)
    if limits.instructions is not None:
        found = sum(len(code) for code in all_code(program))
        if found > limits.instructions:
            return failure("OS5009", found=found, max=limits.instructions)
    if limits.states is not None and len(program["states"]) > limits.states:
        first, second = _busiest_pair(program)
        return failure(
            "OS5004",
            found=len(program["states"]),
            max=limits.states,
            first=first,
            second=second,
        )
    if limits.requests is not None:
        found = _count_requests(program["requests"])
        if found > limits.requests:
            return failure("OS5006", found=found, max=limits.requests)
    depth = call_depth(program)
    if depth > limits.frames:
        return failure("OS5005", construct="a call", found=depth, max=limits.frames)
    return None


def step_bound(program: Any) -> int:
    """The most instructions one bar of this program can possibly execute.

    Verification proves three things that together bound a bar: the target of
    every backward jump is a ``TICK``, so no cycle runs without charging the loop
    budget; recursion is an error, so the call graph is acyclic and each call
    site's body runs at most once per acyclic segment; and the lists are finite.
    So a segment between two ``TICK`` executions costs at most the program's
    whole instruction count once, and there are at most ``limits.loops`` such
    segments plus the one that ends at ``HALT``.

    The number is generous by design. It is not a performance budget: it is the
    proof that a bar terminates, turned into a counter so that a program which
    somehow exceeds its own static bound stops instead of running forever.
    """
    acyclic = len(program["code"])
    for site in program["callSites"]:
        acyclic += len(program["functions"][site["fn"]]["code"])
    segments = max(program["limits"]["loops"], 0) + 1
    return max(acyclic, 1) * segments + acyclic


def suggest_budget(budget: int) -> int:
    """A budget with room to spare, for OS5001's fix line.

    The catalogue asks for a budget that would have completed the bar, and the
    engine cannot know one: it stopped the loop rather than finishing it. Twice
    the budget, rounded to one significant figure so the number reads like
    something a person would type, is the nearest honest thing, and the message
    beside it says the first fix is the exit condition.
    """
    doubled = max(budget * 2, 1000)
    magnitude = 10 ** math.floor(math.log10(doubled))
    return int(math.ceil(doubled / magnitude) * magnitude)


class Budget:
    """The per-bar counters, reset at step 3 of every execution of a bar.

    Per bar rather than per loop so that ten sequential loops and one nested
    loop are treated alike, and reset each bar so that a long dataset is never
    itself a reason to fail.
    """

    def __init__(self, step_ceiling: int, loop_ceiling: int, string_ceiling: int) -> None:
        self._step_ceiling = step_ceiling
        self._loop_ceiling = loop_ceiling
        self._string_ceiling = string_ceiling
        self._loops = 0
        self._steps = 0

    def begin(self) -> None:
        self._loops = 0
        self._steps = 0

    def step(self) -> bool:
        """One instruction executed, and whether the ceiling is now past.

        Answers rather than raising, so the dispatch loop does the check inline
        and the cost is one comparison on the path every instruction takes.
        """
        self._steps += 1
        return self._steps > self._step_ceiling

    @property
    def loops(self) -> int:
        return self._loops

    def tick(self, position: Position, line: int) -> None:
        """Section 5.5: one iteration of a loop charged to the per-bar budget."""
        self._loops += 1
        if self._loops > self._loop_ceiling:
            self.spent(position, line)

    def text(self, position: Position, built: str) -> str:
        """A string the bar built, against the ceiling, counted in code points.

        `stdlib.md` section 10 counts a string in code points and not in the
        storage unit of the language an engine happens to be written in, which on
        this host is what a string already is, so the length is the count.

        Answers the string so that a caller applies the ceiling in the expression
        that produces the value, rather than in a line above it that is easy to
        move away from the thing it guards.
        """
        self.measured(position, len(built))
        return built

    def measured(self, position: Position, length: Optional[int]) -> None:
        """The same ceiling against a length nothing has built yet.

        ``None`` is a call the library cannot measure in advance, which is every
        call but the two that can be asked for a string no engine could hold:
        a repeat is a length times a count, and a fixed decimal conversion is one
        character per decimal place asked for. Measuring those first is the
        difference between reporting that a string is too long and running out of
        memory finding out (`stdlib.md` section 10, on ``text(x, decimals)``).

        The refusal is the run's and not the library's: nothing in that package
        raises, because a wrong argument there is absence and a ceiling is the
        engine's to spend.
        """
        if length is not None and length > self._string_ceiling:
            raise_at("OS5008", position, max=self._string_ceiling, found=length)

    def spent(self, position: Position, line: Optional[int]) -> None:
        """The refusal, whichever of the two counters ran out.

        The step ceiling is the static bound of ``step_bound`` and a loop is the
        only construct that can approach it, so the loop that was running is the
        one to name. A bar that passes it with no loop running contradicts what
        verification proved about the program, which is OS6018's case.
        """
        if line is None:
            raise_at(
                "OS6018",
                position,
                location=f"step {self._steps}",
                reason=(
                    "the bar executed more instructions than the program can reach without a "
                    "loop, so the instruction list is not the one verification walked"
                ),
            )
        raise_at(
            "OS5001",
            position,
            budget=self._loop_ceiling,
            line=line,
            suggested=suggest_budget(self._loop_ceiling),
        )
