"""Colour: the nineteen names, and the calls that compute one.

**A colour's channels are whole numbers and its alpha is not**
(`compiled-program.md` section 3.1). Red, green and blue are whole numbers from
0 to 255 in every colour the machine holds, not only in a literal, because every
call that computes one rounds the three channels before it returns, with the
language's own rounding, halves away from zero (`stdlib.md` section 11.2). Alpha
stays a binary64 number from 0 to 1 and becomes a byte only at the contract
boundary, where the conversion is one way and is not a round trip.

The two arrangements `stdlib.md` section 20.9 fixes are the whole of the
arithmetic here, and both were chosen against a mathematically equal alternative
that differs in the last bit, so both are written out rather than described:

- ``mix`` interpolates as ``from + (to - from) * weight``, channel by channel and
  the alpha included. It is not ``from * (1 - weight) + to * weight``.
- ``fade`` sets the alpha to ``(100 - percent) / 100``, the subtraction before
  the division. It is not ``1 - percent / 100``, which is a different number at
  40 of the 101 whole percentages, and it sets the alpha rather than scaling the
  one the colour already carried, which is what makes a nested fade the inner
  call's fade (`stdlib.md` section 11.2).

**The channel table is a copy of a fact this repository holds once.**
`spec/colours.json` is the authority and part of the conformance suite;
`stdlib.md` section 11.1 fixes the values there and gap 4 of section 20.11
records that they are not written out in the specification prose. A package a
host installs cannot read that file at run time, so the table is here, and
``tests/test_colour.py`` holds it to the authority character for character rather
than to the other engine's copy of it. Two copies that agree with each other and
with nothing published are still a contract nobody can implement against.
"""

import math
from typing import NamedTuple

from .rounding import round_half_away
from .values import ABSENT, Value, number


class Colour(NamedTuple):
    """Red, green and blue as whole numbers 0 to 255, alpha as 0 to 1."""

    r: float
    g: float
    b: float
    a: float


_HEX_DIGITS = "0123456789abcdef"


def hex_byte(channel: float) -> str:
    """A whole number from 0 to 255 as two hex digits, from a table.

    Not the decimal rule and no host conversion: each nibble indexes a string of
    sixteen characters, so the spelling cannot pick up a locale, a sign or a
    point on the way.
    """
    value = int(channel)
    if value < 0:
        value = 0
    if value > 255:
        value = 255
    return _HEX_DIGITS[value >> 4] + _HEX_DIGITS[value & 15]


def _channel(x: float) -> float:
    """One computed channel: rounded to a whole number, then held in range.

    The rounding is the requirement of section 11.2 and the clamp is the
    backstop under a diagnostic: a channel argument outside 0 to 255 is refused
    by the checker, because a colour computed from data and landing at 300 is a
    bug in the computation rather than a value to fix silently. A value that
    reached here anyway is held inside the range the value model promises, since
    the alternative is a colour the machine says cannot exist.

    **A channel with no finite value is 0, and no page says so.** It is reachable:
    a blend at an enormous weight overflows the interpolation before the rounding
    ever runs. Neither 11.2 nor 20.9 states an answer, and the first engine's is
    0, so that is what is here, and the silence is recorded where an engine author
    will meet it rather than left for two engines to differ over.
    """
    if not math.isfinite(x):
        return 0.0
    rounded = round_half_away(x)
    if rounded < 0:
        return 0.0
    if rounded > 255:
        return 255.0
    return rounded


def make(r: float, g: float, b: float, a: float) -> Colour:
    """A colour with the value model's invariant already true of it."""
    alpha = 0.0 if a < 0 else (1.0 if a > 1 else (0.0 if a == 0 else a))
    return Colour(_channel(r), _channel(g), _channel(b), alpha)


# The channel values of the named colours, which `spec/colours.json` is the
# authority for. Each is at full opacity, as section 11.1 states.
_CHANNELS: dict[str, tuple[int, int, int]] = {
    "aqua": (0, 255, 255),
    "black": (0, 0, 0),
    "blue": (0, 0, 255),
    "brown": (165, 42, 42),
    "fuchsia": (255, 0, 255),
    "gray": (128, 128, 128),
    "green": (0, 128, 0),
    "lime": (0, 255, 0),
    "maroon": (128, 0, 0),
    "navy": (0, 0, 128),
    "olive": (128, 128, 0),
    "orange": (255, 165, 0),
    "pink": (255, 192, 203),
    "purple": (128, 0, 128),
    "red": (255, 0, 0),
    "silver": (192, 192, 192),
    "teal": (0, 128, 128),
    "white": (255, 255, 255),
    "yellow": (255, 255, 0),
}

# The nineteen names, for a test that has to compare two tables.
NAMES: tuple[str, ...] = tuple(_CHANNELS)


def named(name: str) -> Value:
    """The colour one of the nineteen bare names holds, or absence."""
    channels = _CHANNELS.get(name)
    if channels is None:
        return ABSENT
    return make(float(channels[0]), float(channels[1]), float(channels[2]), 1.0)


def _colour_of(value: Value) -> Colour | None:
    return value if isinstance(value, Colour) else None


def rgb(r: Value, g: Value, b: Value) -> Value:
    """``rgb(r, g, b)``: channels 0 to 255, fully opaque."""
    red = number(r)
    green = number(g)
    blue = number(b)
    if red is None or green is None or blue is None:
        return ABSENT
    return make(red, green, blue, 1.0)


def rgba(r: Value, g: Value, b: Value, a: Value) -> Value:
    """``rgba(r, g, b, a)``: the same with alpha 0 to 1, where 1 is opaque."""
    red = number(r)
    green = number(g)
    blue = number(b)
    alpha = number(a)
    if red is None or green is None or blue is None or alpha is None:
        return ABSENT
    return make(red, green, blue, alpha)


def fade(base: Value, percent: Value) -> Value:
    """``fade(color, percent)``: the same colour at ``percent`` transparency.

    Transparency, not opacity, and a percentage: 100 is invisible. The two
    conventions are opposites and a script that guesses wrong draws something
    nobody can see, so the arithmetic is written out rather than left to be
    inferred from the name. ``withAlpha`` is the call for the other convention.
    """
    colour = _colour_of(base)
    amount = number(percent)
    if colour is None or amount is None:
        return ABSENT
    return make(colour.r, colour.g, colour.b, (100 - amount) / 100)


def mix(a: Value, b: Value, weight: Value) -> Value:
    """``mix(a, b, weight)``: a blend, 0 giving the first and 1 the second."""
    first = _colour_of(a)
    second = _colour_of(b)
    amount = number(weight)
    if first is None or second is None or amount is None:
        return ABSENT
    return make(
        first.r + (second.r - first.r) * amount,
        first.g + (second.g - first.g) * amount,
        first.b + (second.b - first.b) * amount,
        first.a + (second.a - first.a) * amount,
    )


def alpha(base: Value) -> Value:
    """``alpha(color)``: read a colour's alpha, 0 to 1."""
    colour = _colour_of(base)
    return ABSENT if colour is None else colour.a


def with_alpha(base: Value, a: Value) -> Value:
    """``withAlpha(color, a)``: the same colour at a stated alpha."""
    colour = _colour_of(base)
    amount = number(a)
    if colour is None or amount is None:
        return ABSENT
    return make(colour.r, colour.g, colour.b, amount)
