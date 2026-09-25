"""Scalar numerical calls through the public stateless table."""
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
    def __init__(self, item, index):
        self.item, self.index = item, index

    def bar(self, name):
        column = self.item.get("bar", {}).get(name)
        return None if column is None else value_at(column, self.index)

    def host(self, name):
        encoded = self.item.get("host", {}).get(name)
        return None if encoded is None else struct.unpack(">d", bytes.fromhex(encoded))[0]

    def first_bar(self):
        return self.index == 0

    def kind_of(self, _value):
        return "none"

    def items_of(self, _value):
        return None

    def make_array(self, values):
        return list(values)


def calculate(item, entry):
    rows, failure = [], None
    for index in range(item["bars"]):
        try:
            result = entry.call(Context(item, index), [value_at(argument, index) for argument in item["args"]])
            rows.append([cell(result)])
        except Exception as error:
            failure = {"bar": index, "type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
            break
    return {"id": item["id"], "key": item["key"], "rows": rows, "exception": failure}


if __name__ == "__main__":
    sys.path.insert(0, str(Path(sys.argv[1]) / "engine"))
    sys.dont_write_bytecode = True
    from openscript.library import table

    registry = table()
    cases = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    required = set(json.loads(Path(sys.argv[4]).read_text(encoding="utf-8"))["keys"])
    keys = sorted(f"{name}/{arity}" for (name, arity), entry in registry.items()
                  if f"{name}/{arity}" in required and entry.state is False and entry.effect == "none")
    with Path(sys.argv[3]).open("w", encoding="utf-8", newline="\n") as output:
        for case in cases:
            output.write(json.dumps(calculate(case, registry[(case["name"], case["arity"])]), separators=(",", ":")) + "\n")
    print(json.dumps({"schemaVersion": 1, "cases": len(cases), "keys": keys}))
