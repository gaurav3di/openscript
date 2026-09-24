# session/flags

A session from 09:00 to 12:00 on weekdays, over hourly bars from 07:00 to 14:00
on a Tuesday.

## What it pins

`stdlib.md` 12.4 and `host-interface.md` 4.3: `session.isFirstBar` is true on the
first bar inside the session, the 09:00 bar, and `session.isLastBar` on the bar
whose slot reaches the scheduled close, the 11:00 bar of a sixty minute
interval. Bars outside the session read false for both.

## What a wrong engine does differently

- The last bar taken as the one after the close: 12:00 reads one.
- A bar outside the session read as absent rather than false.

## Reference

By the rules above, by hand, from the session in `instrument.json`.
