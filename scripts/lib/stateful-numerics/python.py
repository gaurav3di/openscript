"""Execute encoded cases through the actual table without writing package files."""
import json
import math
import pathlib
import struct
import sys
import traceback


def decode(column, index):
    cell = column["values"][index]
    if cell is None or column["kind"] != "number":
        return cell
    return struct.unpack(">d", bytes.fromhex(cell))[0]


def encode(value):
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            return {"nonfinite": "NaN" if math.isnan(value) else "Infinity" if value > 0 else "-Infinity"}
        return {"bits": struct.pack(">d", float(value)).hex()}
    return {"unexpectedType": type(value).__name__, "value": repr(value)}


class Context:
    def __init__(self, case, index):
        self.case = case
        self.index = index

    def bar(self, fact):
        column = self.case.get("bar", {}).get(fact)
        return None if column is None else decode(column, self.index)

    def host(self, fact):
        value = self.case.get("host", {}).get(fact)
        return None if value is None else struct.unpack(">d", bytes.fromhex(value))[0]

    def first_bar(self):
        return self.index == 0

    def kind_of(self, value):
        return "array" if isinstance(value, list) else "none"

    def items_of(self, value):
        return list(value) if isinstance(value, list) else None

    def make_array(self, values):
        return list(values)


def drive(case, entry):
    state = {}
    rows = []
    failure = None
    for at in range(case["bars"]):
        try:
            value = entry.call(Context(case, at), [decode(c, at) for c in case["args"]], state)
            values = value if isinstance(value, list) else [value]
            rows.append([encode(cell) for cell in values])
        except Exception as error:
            failure = {"bar": at, "type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
            break
    return {"id": case["id"], "key": case["key"], "rows": rows, "exception": failure}


def main():
    root = pathlib.Path(sys.argv[1])
    sys.path.insert(0, str(root / "engine"))
    sys.dont_write_bytecode = True
    from openscript.library import stateful_table

    entries = stateful_table()
    cases = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
    with pathlib.Path(sys.argv[3]).open("w", encoding="utf-8", newline="\n") as stream:
        for case in cases:
            stream.write(json.dumps(drive(case, entries[(case["name"], case["arity"])]), separators=(",", ":")) + "\n")
    print(json.dumps({"schemaVersion": 1, "keys": sorted(f"{name}/{arity}" for name, arity in entries), "cases": len(cases)}))


if __name__ == "__main__":
    main()
