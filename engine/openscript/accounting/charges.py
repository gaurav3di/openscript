"""What a fill costs, as an ordered list of lines the platform brings.

**The language has three commission spellings and a slippage in ticks, and a real
cost stack is not shaped like that.** It is a flat fee, a percentage, a charge
levied on a charge, and a tax that applies to one side of the trade only.
Teaching the language one market's stack would be teaching it a market, so the
platform passes a schedule instead and the language keeps the three spellings it
has, which turn into a schedule of one line.

**Order is part of the result.** The lines are applied in the order they are
declared, a line charged on other lines may only name lines declared before it,
and that is what makes a schedule evaluable in exactly one order. Two engines
that disagree about the order disagree about the money, and a disagreement in the
last bit is still a failed conformance comparison (``conformance.md`` 6).

**Where it is applied is not here.** ``stdlib.md`` 17.1 puts slippage and
commission on the destination: the engine folds the price it is told and never
adjusts one, so a cost model inside the ledger would be the engine moving a
price, which is the one thing that invariant forbids. This module says what a
charge is and works out what one fill came to.

**What is charged to a fill, and only to a fill.** Every line is measured against
this fill and nothing else, so a tier that changes with the month's cumulative
volume, a cap counted per day and margin and its interest are outside this model
rather than approximated inside it. A cost model that quietly approximates is a
report that is wrong in the strategy's favour and says nothing about it.
"""

import math
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from .shapes import Contract, RecordedFill

#: What a line's rate is measured against. Four bases cover every stack the
#: documentation describes without naming a market: a fraction of turnover, money
#: per unit, money per fill, and a fraction of the lines named before this one,
#: which is the charge on a charge.
BASES: Tuple[str, ...] = ("turnover", "units", "order", "charges")

#: Which side of the trade a line applies to. A transaction tax levied on one
#: side is expressed exactly rather than smeared across both fills at half the
#: rate, which is what makes a reader's figure disagree with their broker's.
SIDES: Tuple[str, ...] = ("buy", "sell", "both")

#: The most digits money is rounded to. A rounding scale is a power of ten and a
#: binary64 holds about fifteen significant decimal digits, so past this the scale
#: itself is approximate and the rounding stops being arithmetic and becomes
#: noise.
MAX_DIGITS = 15

#: A percentage, as the declaration states one, over the fraction a rate is.
PERCENT = 100

#: What a refusal calls the setting it is about, ``errors.md`` OS6021.
SETTING = "The charge schedule"


@dataclass(frozen=True)
class ChargeLine:
    """One line of a schedule, applied to one fill."""

    #: The platform's own word.
    name: str
    base: str
    side: str = "both"
    #: Fraction for turnover and charges, money per unit for units, money for
    #: order.
    rate: float = 0.0
    #: Floor per application.
    min: Optional[float] = None
    #: Cap per application.
    max: Optional[float] = None
    #: Base ``charges`` only: names of lines declared before this one.
    of: Tuple[str, ...] = ()


@dataclass(frozen=True)
class ChargeSchedule:
    """The whole cost model a run was carried out under."""

    currency: str = "CUR"
    digits: int = 2
    slippage_ticks: float = 0.0
    #: Applied in order, and order is part of the result.
    lines: Tuple[ChargeLine, ...] = ()
    #: Where the schedule came from. One derived from the declaration is derived
    #: again on replay rather than stored, because what the program states is
    #: stored once, as the program.
    source: str = "declaration"


@dataclass(frozen=True)
class ChargeBreakdown:
    """What one fill was charged, line by line and in total."""

    lines: Tuple[Tuple[str, float], ...] = ()
    total: float = 0.0


def round_money(amount: float, digits: int) -> float:
    """One money figure, rounded once, halves to even.

    Half to even, and not the language's own rounding. ``round()`` in the language
    is halves away from zero, because a price a trader reads should agree with
    what they would write down (``stdlib.md`` 8.1). Money folded over thousands of
    fills is a different question: away from zero biases every exact half upward,
    and half a unit of the last digit per fill is a bias that grows with the length
    of the backtest.

    A digit count this cannot round by is one ``schedule_problem`` refuses before
    the first bar. If one arrives anyway the amount is returned as it stands,
    because an unrounded figure is worth more than a scale of ten to an impossible
    power.
    """
    if not math.isfinite(amount):
        return amount
    if isinstance(digits, bool) or not isinstance(digits, int) or digits < 0 or digits > MAX_DIGITS:
        return amount

    scale = 10**digits
    scaled = amount * scale
    below = math.floor(scaled)
    fraction = scaled - below

    whole = below
    if fraction > 0.5:
        whole = below + 1
    elif fraction == 0.5 and below % 2 != 0:
        whole = below + 1

    money = whole / scale
    # A negative zero is the same money as a zero and a different set of bytes.
    return 0.0 if money == 0 else money


def _bounded(raw: float, line: ChargeLine) -> float:
    """The floor and the cap, per application.

    Which is applied first does not decide the answer, because a floor above a cap
    is refused before the first bar rather than resolved here by whichever
    comparison runs first.
    """
    amount = raw
    if line.min is not None and amount < line.min:
        amount = line.min
    if line.max is not None and amount > line.max:
        amount = line.max
    return amount


def _base_of(
    line: ChargeLine, turnover: float, units: float, applied: Sequence[Tuple[str, float]]
) -> float:
    """What a line's rate is measured against, for this fill.

    The earlier lines are searched rather than indexed. An index would be a map,
    and this module depends on no map's iteration order; a schedule is a handful
    of lines, so the search costs nothing and the promise costs one less thing to
    be careful about.
    """
    if line.base == "turnover":
        return turnover
    if line.base == "units":
        return units
    if line.base == "order":
        return 1.0
    # A name whose line did not apply to this side is absent and adds nothing,
    # which is a charge levied on a charge that was never taken.
    total = 0.0
    for named in line.of:
        for one, amount in applied:
            if one == named:
                total += amount
    return total


def charge_for(
    schedule: ChargeSchedule, fill: RecordedFill, contract: Contract
) -> ChargeBreakdown:
    """What one fill cost, line by line and in total.

    **The lines are the arithmetic and the total is the money.** Each line's
    amount is computed in binary64 and left unrounded, and the per-fill total is
    rounded once, half to even, to the contract's digits. Rounding each line would
    round once per line, and two engines rounding in two places disagree in the
    last bit. So a reader adding the lines up by hand may land a fraction of the
    last digit away from the total, and that is the honest way round: the total is
    the figure the report accumulates.

    **A line that does not apply to this side is not in the breakdown at all.** A
    name beside a zero reads as a charge that was levied and came to nothing, and
    a later line levied on that name is levied on nothing, which is exactly what a
    tax on one side of the trade does.
    """
    turnover = fill.units * fill.price * contract.point_value
    applied: List[Tuple[str, float]] = []

    for line in schedule.lines:
        if line.side != "both" and line.side != fill.side:
            continue
        base = _base_of(line, turnover, fill.units, applied)
        applied.append((line.name, _bounded(line.rate * base, line)))

    exact = 0.0
    for _name, amount in applied:
        exact += amount

    return ChargeBreakdown(lines=tuple(applied), total=round_money(exact, contract.digits))


def _commission_line(commission: float, commission_type: str) -> ChargeLine:
    """The one line a declared commission is, in the base its spelling names."""
    if commission_type == "perUnit":
        return ChargeLine(name="commission", base="units", rate=commission)
    if commission_type == "percent":
        return ChargeLine(name="commission", base="turnover", rate=commission / PERCENT)
    return ChargeLine(name="commission", base="order", rate=commission)


def schedule_from_declaration(
    commission: float,
    commission_type: str,
    slippage: float,
    currency: str,
    digits: int,
) -> ChargeSchedule:
    """The declaration's own cost model, as the one schedule this module evaluates.

    **The declaration is not a second cost engine.** Its three commission
    spellings are a schedule of one line: a flat fee is a line charged per fill, a
    per unit fee is a line charged per unit, and a percentage is a line charged on
    turnover.

    **A commission of zero is no line at all**, rather than a line charging
    nothing. A zero line would put a name in every breakdown and would make a
    declaration that states no commission indistinguishable from one that states a
    commission.

    **A flat fee is charged per fill**, which is the one place ``language.md``
    13.3 lets a reasonable person read the words two ways. A charge is attributed
    to the fill that incurred it everywhere in this module, because that is what
    attributes it to a trade, so a round trip of two fills is charged twice.

    The currency and the digit count are parameters because neither is the
    declaration's to state: the declaration's currency is a label and is often
    left blank, and money rounding is a fact about the contract.
    """
    return ChargeSchedule(
        currency=currency,
        digits=digits,
        slippage_ticks=slippage,
        lines=() if commission == 0 else (_commission_line(commission, commission_type),),
        source="declaration",
    )


def _money_problem(schedule: ChargeSchedule, contract: Optional[Contract]) -> Optional[str]:
    """The currency the money is in and the digits it is rounded to.

    A schedule states both and so does the contract, and the two are compared here
    rather than one of them being quietly preferred. A schedule in another currency
    charges a fill in money the contract is not priced in, and a total nobody can
    add to the profit is worse than no total.
    """
    digits = schedule.digits
    if isinstance(digits, bool) or not isinstance(digits, int) or digits < 0 or digits > MAX_DIGITS:
        return (
            f"it rounds money to {digits} digits, and a digit count is a whole "
            f"number from 0 to {MAX_DIGITS}"
        )
    if schedule.currency.strip() == "":
        return "it names no currency, so what it charges is a number with no unit on it"
    if contract is None:
        return None
    if schedule.currency != contract.currency:
        return (
            f"it charges in {schedule.currency} and the contract is priced in "
            f"{contract.currency}"
        )
    if digits != contract.digits:
        return f"it rounds money to {digits} digits and the contract rounds to {contract.digits}"
    return None


def _slippage_problem(schedule: ChargeSchedule, contract: Optional[Contract]) -> Optional[str]:
    """The slippage, which this module refuses and does not apply.

    A slippage in ticks with no tick size to measure a tick in would charge
    nothing at all, and a backtest that silently charges nothing is one that lies
    in the strategy's favour.
    """
    ticks = schedule.slippage_ticks
    if not math.isfinite(ticks) or ticks < 0:
        return (
            f"it states {ticks} ticks of slippage, and slippage is adverse, so it "
            "is never negative"
        )
    if ticks == 0 or contract is None:
        return None
    tick = contract.tick_size
    if tick is None or not tick > 0:
        return (
            f"it states {ticks} ticks of slippage and the contract has no tick "
            "size to measure a tick in"
        )
    return None


def _bound_problem(line: ChargeLine) -> Optional[str]:
    """The floor and the cap: money, not negative, and the floor no higher than the cap."""
    if line.min is not None and (not math.isfinite(line.min) or line.min < 0):
        return f'the line "{line.name}" has a floor of {line.min}, and a bound on a charge is money'
    if line.max is not None and (not math.isfinite(line.max) or line.max < 0):
        return f'the line "{line.name}" has a cap of {line.max}, and a bound on a charge is money'
    if line.min is not None and line.max is not None and line.min > line.max:
        return f'the line "{line.name}" has a floor of {line.min} above its cap of {line.max}'
    return None


def _levy_problem(line: ChargeLine, declared: Sequence[str]) -> Optional[str]:
    """What a line is levied on, which is the rule the whole ordering exists for.

    A line levied on lines not declared before it has no single evaluation order,
    so two engines would charge two different amounts and both would be
    defensible. Naming itself, naming a line declared after it and naming a line
    that is not in the schedule at all are one problem in three spellings.
    """
    name = line.name
    if line.base != "charges":
        if not line.of:
            return None
        return (
            f'the line "{name}" names {len(line.of)} lines to be levied on and its '
            f"base is {line.base}, so the names are read by nothing"
        )
    if not line.of:
        return f'the line "{name}" is levied on charges and names none, so it is levied on nothing'

    seen: List[str] = []
    for named in line.of:
        if named not in declared:
            return f'the line "{name}" is levied on "{named}", which is not declared before it'
        if named in seen:
            return (
                f'the line "{name}" is levied on "{named}" twice, so that line is '
                "charged on twice over"
            )
        seen.append(named)
    return None


def _line_problem(line: ChargeLine, declared: Sequence[str]) -> Optional[str]:
    name = line.name
    if name.strip() == "":
        return "a line carries no name, and a line levied on charges names the lines it is levied on"
    if name in declared:
        return f'two lines are named "{name}", so a line levied on that name is levied on two answers'
    if not math.isfinite(line.rate) or line.rate < 0:
        return (
            f'the line "{name}" charges a rate of {line.rate}, and a charge is '
            "money taken, never given"
        )
    return _bound_problem(line) or _levy_problem(line, declared)


def _lines_problem(lines: Sequence[ChargeLine]) -> Optional[str]:
    declared: List[str] = []
    for line in lines:
        problem = _line_problem(line, declared)
        if problem is not None:
            return problem
        declared.append(line.name)
    return None


def schedule_problem(
    schedule: ChargeSchedule, contract: Optional[Contract] = None
) -> Optional[Tuple[str, str]]:
    """Why this schedule cannot be carried out, or none.

    **Asked before the first bar, and answered once.** Everything here is a fact
    about the schedule rather than about any fill, so a run that would produce a
    number nobody can explain is refused while nothing has been computed and the
    cost of correcting it is one run.

    The first problem found is the one reported. A list of everything wrong with a
    schedule reads as a worse schedule than it is, and it is corrected one line at
    a time regardless. What comes back is the setting and the problem, which are
    the two values OS6021's message names: the sentence itself is the catalogue's.
    """
    problem = (
        _money_problem(schedule, contract)
        or _slippage_problem(schedule, contract)
        or _lines_problem(schedule.lines)
    )
    return None if problem is None else (SETTING, problem)
