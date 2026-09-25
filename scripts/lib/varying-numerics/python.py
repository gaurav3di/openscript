"""Changing controls through the actual table, including checkpoint replacement."""
import copy
import json
import math
from pathlib import Path
import struct
import sys
import traceback


def value_at(column, at):
    value = column["values"][at]
    return struct.unpack(">d", bytes.fromhex(value))[0] if column["kind"] == "number" and value is not None else value


def cell(value):
    if value is None or isinstance(value, bool):
        return value
    if not isinstance(value, (int, float)):
        return {"unexpectedType": type(value).__name__, "value": repr(value)}
    if math.isfinite(value):
        return {"bits": struct.pack(">d", value).hex()}
    return {"nonfinite": "NaN" if math.isnan(value) else "Infinity" if value > 0 else "-Infinity"}


class Context:
    def __init__(self, case, at, source):
        self.case, self.at, self.source = case, at, source
        self.index = case["barIndices"][at] if "barIndices" in case else at

    def bar(self, name):
        if name == "index":
            return float(self.index)
        column = self.case.get("bar", {}).get(name)
        return None if column is None else value_at(column, self.source)

    def host(self, name):
        encoded = self.case.get("host", {}).get(name)
        return None if encoded is None else struct.unpack(">d", bytes.fromhex(encoded))[0]

    def first_bar(self):
        return self.index == 0

    def kind_of(self, value):
        return "array" if isinstance(value, list) else "none"

    def items_of(self, value):
        return list(value) if isinstance(value, list) else None

    def make_array(self, values):
        return list(values)


def invoke(case, entry, state, at, source):
    result = entry.call(Context(case, at, source), [value_at(arg, source) for arg in case["args"]], state)
    return [cell(value) for value in (result if isinstance(result, list) else [result])]


def drive(case, entry):
    state, rows, failure, checkpoint = {}, [], None, None
    restores = {probe["at"]: probe["trial"] for probe in case.get("restore", [])}
    replay = case.get("replayFrom")
    at = 0
    try:
        for at in range(case["bars"]):
            if at == replay:
                checkpoint = copy.deepcopy(state)
            if at in restores:
                saved = copy.deepcopy(state)
                invoke(case, entry, state, at, restores[at])
                state = copy.deepcopy(saved)
            source = (at + 1) % case["bars"] if replay is not None and at >= replay else at
            rows.append(invoke(case, entry, state, at, source))
        if replay is not None:
            state = copy.deepcopy(checkpoint)
            rows = rows[:replay]
            for at in range(replay, case["bars"]):
                rows.append(invoke(case, entry, state, at, at))
    except Exception as error:
        failure = {"bar": at, "type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
    return {"id": case["id"], "key": case["key"], "rows": rows, "exception": failure}


if __name__ == "__main__":
    sys.path.insert(0, str(Path(sys.argv[1]) / "engine"))
    sys.dont_write_bytecode = True
    from openscript.library import stateful_table

    entries = stateful_table()
    cases = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    with Path(sys.argv[3]).open("w", encoding="utf-8", newline="\n") as output:
        for case in cases:
            output.write(json.dumps(drive(case, entries[(case["name"], case["arity"])]), separators=(",", ":")) + "\n")
    print(json.dumps({"schemaVersion": 1, "cases": len(cases), "keys": sorted(f"{name}/{arity}" for name, arity in entries)}))
