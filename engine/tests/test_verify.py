"""Load-time refusal: every check of section 3.5, and the order of section 9.4.

Verification is not optional and not a debug mode, so the interesting test is not
that a good program loads. It is that each specific defect is refused, with the
code the page names, and that a program wrong in two ways reports the one the
ordered list reaches first. Two engines that refused in different orders would
hand the same program two different messages, and whichever of the two a user saw
first would be the one they tried to fix.

Every case below starts from a program that loads and breaks exactly one thing,
so a case that stopped catching its defect would pass only by the program having
stopped being valid, which the first test in each group rules out.
"""

import unittest

from tests import support
from tests.support import channel, program, register

from openscript.budget import EngineLimits
from openscript.contracts import LibraryEntry
from openscript.run import load
from openscript.verify import MACHINE_CAPABILITIES, capabilities

FUNCTION = {"name": "same", "params": 1, "slots": 1, "code": [["LOAD", 0], ["RET"]]}
SITE = {"fn": 0, "argc": 1, "cellBase": 0, "stateBase": 0, "series": []}


def refuse(built, **options):
    result = load(built, **options)
    if result.ok:
        raise AssertionError("the program was expected to be refused and was not")
    return result.diagnostic


class AProgramThatLoads(unittest.TestCase):
    """The starting point every case below breaks one thing in."""

    def test_the_smallest_program_loads(self):
        self.assertTrue(load(program([["HALT"]])).ok)

    def test_a_program_with_every_group_of_instruction_loads(self):
        built = program(
            [
                ["SLOAD", 0],
                ["CONST", 3],
                ["HIST", 0],
                ["ADD"],
                ["EMIT", 0],
                ["CONST", 4],
                ["CALL_FN", 0],
                ["POP"],
                ["HALT"],
            ],
            consts=support.RESERVED + [["n", 1], ["n", 2]],
            channels=[channel(0, once=True)],
            series=[register(0, "close")],
            requires=["core.1", "functions"],
            functions=[FUNCTION],
            callSites=[SITE],
        )
        result = load(built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))


class TheVersionSteps(unittest.TestCase):
    """Steps 2 and 3: the major decides, and a minor in either direction loads."""

    def test_another_major_is_refused_in_either_direction(self):
        for version in ("2.0", "0.9"):
            with self.subTest(version=version):
                built = program([["HALT"]])
                built["openscript"] = {"format": version, "language": 1}
                found = refuse(built)
                self.assertEqual(found.code, "OS6016")
                self.assertEqual(found.values["found"], version)

    def test_a_higher_minor_of_this_major_loads(self):
        # A minor bump is additive, and anything whose absence would change a
        # number has to be announced by a tag in requires, which step 4 checks
        # immediately afterwards. An engine that refused here would refuse every
        # program in the world the day the format reached its next minor.
        built = program([["HALT"]])
        built["openscript"] = {"format": "1.9", "language": 1}
        self.assertTrue(load(built).ok)

    def test_a_lower_minor_missing_a_table_that_minor_never_had_loads(self):
        # Section 9.5's first line is a promise about exactly this program.
        built = program([["HALT"]])
        built["openscript"] = {"format": "1.0", "language": 1}
        del built["requests"]
        result = load(built)
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        self.assertEqual(result.run.program.raw["requests"], [])

    def test_this_minor_missing_the_same_table_is_refused(self):
        # An empty table is written as an empty array and never omitted, so its
        # absence here is a defect rather than an older program, and the version
        # is what tells the two apart.
        built = program([["HALT"]])
        del built["requests"]
        found = refuse(built)
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "requests")

    def test_a_language_this_engine_has_no_semantics_for_is_refused(self):
        built = program([["HALT"]])
        built["openscript"] = {"format": "1.1", "language": 2}
        found = refuse(built)
        self.assertEqual(found.code, "OS6017")
        self.assertEqual(found.values["found"], 2)


class Capabilities(unittest.TestCase):
    def test_a_tag_this_engine_does_not_have_is_refused_naming_it(self):
        built = program([["HALT"]], requires=["core.1", "req.symbol"])
        found = refuse(built)
        self.assertEqual(found.code, "OS6006")
        self.assertEqual(found.values["tag"], "req.symbol")

    def test_the_same_program_loads_where_the_stage_that_serves_it_is_wired(self):
        built = program([["HALT"]], requires=["core.1", "req.symbol"])
        self.assertTrue(load(built, capabilities=capabilities("req.symbol")).ok)

    def test_an_instruction_whose_tag_the_program_never_declared_is_refused(self):
        built = program([["ARRAY", 0], ["POP"], ["HALT"]], requires=["core.1"])
        found = refuse(built, capabilities=capabilities("arrays"))
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "requires")
        self.assertIn("arrays", found.values["reason"])

    def test_the_machine_serves_five_tags_and_names_the_rest_as_someone_elses(self):
        self.assertEqual(
            sorted(MACHINE_CAPABILITIES),
            ["alerts", "arrays", "core.1", "functions", "loops"],
        )


class TheLibraryManifest(unittest.TestCase):
    """Check 9: the entries carry facts the engine knows, to be disagreed with."""

    def setUp(self):
        self.built = program(
            [["CALL_LIB", 0, 0, -1], ["POP"], ["HALT"]],
            lib={"manifest": 1, "functions": [
                {"name": "now", "arity": 0, "state": False, "effect": "none"}
            ]},
        )
        self.library = support.Library({"now": LibraryEntry("now", 0, False, "none")})

    def test_an_agreeing_manifest_loads(self):
        self.assertTrue(load(self.built, {}, self.library).ok)

    def test_a_name_this_engine_does_not_have_is_refused(self):
        found = refuse(self.built, library=support.Library({}))
        self.assertEqual(found.code, "OS6004")
        self.assertEqual(found.values["name"], "now")

    def test_an_arity_that_differs_is_refused(self):
        other = support.Library({"now": LibraryEntry("now", 1, False, "none")})
        self.assertEqual(refuse(self.built, library=other).code, "OS6004")

    def test_an_effect_that_differs_is_refused(self):
        # The entry would otherwise run as a pure call and perform its effect in
        # the middle of a bar that may be thrown away.
        other = support.Library({"now": LibraryEntry("now", 0, False, "order")})
        self.assertEqual(refuse(self.built, library=other).code, "OS6004")

    def test_whether_it_holds_state_that_differs_is_refused(self):
        other = support.Library({"now": LibraryEntry("now", 0, True, "none")})
        self.assertEqual(refuse(self.built, library=other).code, "OS6004")


class TheBudgetsAHostIsWillingToSpend(unittest.TestCase):
    def test_a_loop_budget_past_what_the_host_allows_is_refused(self):
        built = program([["HALT"]], limits={"loops": 5000, "history": None})
        found = refuse(built, limits=EngineLimits(loops=1000))
        self.assertEqual(found.code, "OS5003")
        self.assertEqual(found.values["option"], "loops")
        self.assertEqual(found.values["found"], 5000)

    def test_a_retained_depth_past_what_the_host_allows_is_refused(self):
        built = program([["HALT"]], limits={"loops": 10, "history": 5000})
        found = refuse(built, limits=EngineLimits(history=100))
        self.assertEqual(found.values["option"], "history")

    def test_more_instructions_than_the_host_allows_is_refused(self):
        built = program([["CONST", 0], ["POP"], ["HALT"]])
        found = refuse(built, limits=EngineLimits(instructions=2))
        self.assertEqual(found.code, "OS5009")
        self.assertEqual(found.values["found"], 3)

    def test_more_state_regions_than_the_host_allows_is_refused(self):
        built = program(
            [["HALT"]],
            lib={"manifest": 1, "functions": [
                {"name": "held", "arity": 0, "state": True, "effect": "none"}
            ]},
            states=[{"id": 0, "fn": 0}, {"id": 1, "fn": 0}],
        )
        library = support.Library({"held": LibraryEntry("held", 0, True, "none")})
        found = refuse(built, library=library, limits=EngineLimits(states=1))
        self.assertEqual(found.code, "OS5004")
        self.assertEqual(found.values["found"], 2)

    def test_a_call_chain_deeper_than_the_host_allows_is_refused(self):
        built = program(
            [["CONST", 0], ["CALL_FN", 0], ["POP"], ["HALT"]],
            requires=["core.1", "functions"],
            functions=[FUNCTION],
            callSites=[SITE],
        )
        found = refuse(built, limits=EngineLimits(frames=1))
        self.assertEqual(found.code, "OS5005")
        self.assertEqual(found.values["found"], 2)


class TheInstructionListChecks(unittest.TestCase):
    """Checks 2 to 7, each against a list broken in exactly one way."""

    def test_an_opcode_this_engine_does_not_implement(self):
        found = refuse(program([["PUSH", 0], ["HALT"]]))
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "instruction 0")

    def test_an_operand_count_that_is_not_the_formats(self):
        found = refuse(program([["CONST", 0, 1], ["POP"], ["HALT"]]))
        self.assertIn("operands", found.values["reason"])

    def test_an_operand_outside_the_table_it_indexes(self):
        found = refuse(program([["CONST", 99], ["POP"], ["HALT"]]))
        self.assertIn("consts", found.values["reason"])

    def test_a_jump_target_outside_the_list(self):
        found = refuse(program([["JUMP", 9], ["HALT"]]))
        self.assertIn("jump target", found.values["reason"])

    def test_a_list_that_does_not_end_in_its_terminator(self):
        found = refuse(program([["CONST", 0], ["POP"]]))
        self.assertIn("HALT", found.values["reason"])

    def test_a_halt_that_is_not_the_last_instruction(self):
        found = refuse(program([["HALT"], ["HALT"]]))
        self.assertIn("only ever the last", found.values["reason"])

    def test_a_stack_that_is_not_empty_at_the_terminator(self):
        found = refuse(program([["CONST", 0], ["HALT"]]))
        self.assertIn("must be empty", found.values["reason"])

    def test_a_stack_taken_below_zero(self):
        found = refuse(program([["POP"], ["HALT"]]))
        self.assertIn("below zero", found.values["reason"])

    def test_two_paths_that_reach_one_instruction_at_different_depths(self):
        built = program(
            [["CONST", 1], ["JUMP_FALSE", 3], ["CONST", 0], ["HALT"]],
            consts=support.RESERVED,
        )
        found = refuse(built)
        self.assertIn("two paths", found.values["reason"])

    def test_a_backward_jump_that_does_not_land_on_a_tick(self):
        # The whole of the loop budget's integrity, checkable by looking at one
        # instruction: no cycle in the control flow graph can run without
        # charging the budget.
        built = program([["CONST", 0], ["POP"], ["JUMP", 0], ["HALT"]])
        found = refuse(built)
        self.assertIn("not a TICK", found.values["reason"])

    def test_a_loop_that_does_charge_the_budget_loads(self):
        built = program(
            [
                ["TICK", 0],
                ["CONST", 1],
                ["JUMP_FALSE", 4],
                ["JUMP", 0],
                ["HALT"],
            ],
            consts=support.RESERVED,
            requires=["core.1", "loops"],
            loops=[{"id": 0, "kind": "while", "line": 3, "col": 1}],
        )
        self.assertTrue(load(built).ok, msg=str(load(built).diagnostic))

    def test_a_channel_declared_once_and_written_on_only_one_path(self):
        built = program(
            [
                ["CONST", 1],
                ["JUMP_FALSE", 4],
                ["CONST", 0],
                ["EMIT", 0],
                ["HALT"],
            ],
            consts=support.RESERVED,
            channels=[channel(0, once=True)],
        )
        found = refuse(built)
        self.assertEqual(found.values["location"], "channels[0]")

    def test_the_same_channel_written_on_every_path_loads(self):
        built = program(
            [
                ["CONST", 1],
                ["JUMP_FALSE", 5],
                ["CONST", 0],
                ["EMIT", 0],
                ["JUMP", 7],
                ["CONST", 0],
                ["EMIT", 0],
                ["HALT"],
            ],
            consts=support.RESERVED,
            channels=[channel(0, once=True)],
        )
        self.assertTrue(load(built).ok, msg=str(load(built).diagnostic))


class TheTableChecks(unittest.TestCase):
    """Check 1, at the fields a later step would have indexed into."""

    def test_a_required_table_of_the_wrong_type(self):
        built = program([["HALT"]])
        built["consts"] = {}
        self.assertEqual(refuse(built).values["location"], "consts")

    def test_a_constant_pool_entry_that_is_not_a_tag_and_a_value(self):
        built = program([["HALT"]], consts=support.RESERVED + [["n"]])
        self.assertEqual(refuse(built).values["location"], "consts[3]")

    def test_a_colour_channel_outside_its_range(self):
        built = program([["HALT"]], consts=support.RESERVED + [["c", [300, 0, 0, 1]]])
        self.assertIn("0 to 255", refuse(built).values["reason"])

    def test_a_channel_whose_id_is_not_its_position(self):
        built = program([["HALT"]], channels=[{"id": 3, "type": "number",
                                               "defer": False, "once": False}])
        self.assertEqual(refuse(built).values["location"], "channels[0].id")

    def test_a_call_site_that_passes_the_wrong_number_of_arguments(self):
        built = program(
            [["CONST", 0], ["CALL_FN", 0], ["POP"], ["HALT"]],
            requires=["core.1", "functions"],
            functions=[FUNCTION],
            callSites=[{"fn": 0, "argc": 2, "cellBase": 0, "stateBase": 0, "series": []}],
        )
        self.assertEqual(refuse(built).values["location"], "callSites[0].argc")

    def test_a_plot_that_points_at_a_channel_that_is_not_there(self):
        built = program([["HALT"]])
        built["outputs"]["plots"] = [{
            "key": "p0", "title": "A", "type": "line", "channel": 2,
            "color": None, "colorChannel": None, "width": 1.5,
            "lineStyle": "solid", "offset": 0, "overlay": None, "scale": "right",
            "precision": None, "priceFormat": None, "ohlc": None,
        }]
        self.assertEqual(refuse(built).values["location"], "outputs.plots[0].channel")


class TheInputReferenceChecks(unittest.TestCase):
    """Check 10, whose two halves have two codes and two reasons."""

    def _with_input(self, kind="number", default=None, **extra):
        declared = {
            "key": "len", "kind": kind, "label": "Length",
            "default": default if default is not None else ["n", 14],
            "min": None, "max": None, "step": None, "options": None,
            "group": "", "tooltip": None, "slot": 0,
        }
        declared.update(extra)
        return program([["HALT"]], inputs=[declared], frame={"slots": 1})

    def test_a_reference_naming_an_input_the_program_never_declared(self):
        # The compiler's defect, and not repairable by hand, so it is OS6018
        # naming the field rather than the code a user can act on.
        built = self._with_input()
        built["meta"]["precision"] = {"input": "missing"}
        found = refuse(built)
        self.assertEqual(found.code, "OS6018")
        self.assertEqual(found.values["location"], "meta.precision")

    def test_a_reference_naming_a_declared_input_resolves_before_bar_zero(self):
        built = self._with_input()
        built["meta"]["precision"] = {"input": "len"}
        result = load(built, {"len": 2})
        self.assertTrue(result.ok, msg=str(result.diagnostic))
        self.assertEqual(result.run.declaration(["meta", "precision"]), 2.0)

    def test_a_setting_of_the_wrong_type_is_refused_and_not_ignored(self):
        # A settings dialog that silently ignored what a user typed would be
        # worse than one that says the value is out of range.
        found = refuse(self._with_input(), settings={"len": "fourteen"})
        self.assertEqual(found.code, "OS6019")
        self.assertEqual(found.values["key"], "len")

    def test_a_setting_outside_the_declared_bounds_is_refused(self):
        found = refuse(self._with_input(min=2, max=50), settings={"len": 90})
        self.assertEqual(found.code, "OS6019")
        self.assertIn("50", found.values["validation"])

    def test_a_setting_that_is_not_one_of_the_listed_choices_is_refused(self):
        built = self._with_input(
            kind="select", default=["s", "fast"], options=[["s", "fast"], ["s", "slow"]]
        )
        self.assertEqual(refuse(built, settings={"len": "medium"}).code, "OS6019")

    def test_a_source_input_names_one_of_the_eight(self):
        built = self._with_input(kind="source", default=["s", "close"])
        self.assertTrue(load(built).ok)
        self.assertEqual(refuse(built, settings={"len": "vwap"}).code, "OS6019")


class TheOrderOfTheRefusals(unittest.TestCase):
    """Section 9.4 is an ordered list, and a program wrong twice reports the first."""

    def test_a_wrong_major_is_reported_before_a_malformed_table(self):
        built = program([["HALT"]])
        built["openscript"] = {"format": "2.0", "language": 1}
        built["consts"] = {}
        self.assertEqual(refuse(built).code, "OS6016")

    def test_a_capability_is_reported_before_a_language_version(self):
        # It names the feature that was refused rather than a number the reader
        # has to look up.
        built = program([["HALT"]], requires=["core.1", "req.symbol"])
        built["openscript"] = {"format": "1.1", "language": 2}
        self.assertEqual(refuse(built).code, "OS6006")

    def test_a_language_version_is_reported_before_a_manifest_disagreement(self):
        built = program(
            [["CALL_LIB", 0, 0, -1], ["POP"], ["HALT"]],
            lib={"manifest": 1, "functions": [
                {"name": "now", "arity": 0, "state": False, "effect": "none"}
            ]},
        )
        built["openscript"] = {"format": "1.1", "language": 2}
        self.assertEqual(refuse(built).code, "OS6017")

    def test_a_manifest_disagreement_is_reported_before_a_budget(self):
        built = program(
            [["CALL_LIB", 0, 0, -1], ["POP"], ["HALT"]],
            lib={"manifest": 1, "functions": [
                {"name": "now", "arity": 0, "state": False, "effect": "none"}
            ]},
            limits={"loops": 5000, "history": None},
        )
        found = refuse(built, limits=EngineLimits(loops=10))
        self.assertEqual(found.code, "OS6004")

    def test_a_budget_is_reported_before_a_malformed_instruction_list(self):
        built = program([["PUSH", 0], ["HALT"]], limits={"loops": 5000, "history": None})
        found = refuse(built, limits=EngineLimits(loops=10))
        self.assertEqual(found.code, "OS5003")


if __name__ == "__main__":
    unittest.main()
