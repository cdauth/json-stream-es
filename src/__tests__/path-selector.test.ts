import { expect, test } from "vitest";
import { streamToArray } from "../utils";
import { JsonPathSelector, matchesJsonPathSelector, type JsonPathSelectorExpression } from "../json-path-selector";
import { JsonSerializer } from "../json-serializer";
import { JsonDeserializer } from "../json-deserializer";
import { JsonPathDetector } from "../json-path-detector";

test("matchesPathSelector", () => {
	expect(matchesJsonPathSelector([], [])).toBe(true);
	expect(matchesJsonPathSelector([], ["test"])).toBe(false);
	expect(matchesJsonPathSelector(["test"], [])).toBe(false);

	expect(matchesJsonPathSelector(["a", 2], ["a", 2])).toBe(true);
	expect(matchesJsonPathSelector(["a", 2], [["a", "b"], [1, 2]])).toBe(true);
	expect(matchesJsonPathSelector(["a", 2], [undefined, undefined])).toBe(true);

	expect(matchesJsonPathSelector(["a", 2], ["a", 2, 3])).toBe(false);
	expect(matchesJsonPathSelector(["a", 2], ["a"])).toBe(false);

	expect(matchesJsonPathSelector(["a", 2], (p) => p.length === 2 && p[0] === "a" && p[1] === 2)).toBe(true);
	expect(matchesJsonPathSelector(["a", 2], (p) => false)).toBe(false);
});

test("PathSelector selects path", async () => {
	const json = {
		object: {
			array: [
				"item1",
				2,
				{ key: "item3" }
			]
		}
	};

	const select = async (selector: JsonPathSelectorExpression) => await streamToArray(new JsonSerializer(json).pipeThrough(new JsonPathDetector()).pipeThrough(new JsonPathSelector(selector)).pipeThrough(new JsonDeserializer()));

	expect(await select([])).toEqual([
		{ value: json, path: [] }
	]);

	expect(await select(["object"])).toEqual([
		{ value: json.object, path: ["object"] }
	]);

	expect(await select(["object", "array"])).toEqual([
		{ value: json.object.array, path: ["object", "array"] }
	]);

	expect(await select(["object", undefined])).toEqual([
		{ value: json.object.array, path: ["object", "array"] }
	]);

	expect(await select((path) => path.length === 2 && path[0] === "object" && path[1] === "array")).toEqual([
		{ value: json.object.array, path: ["object", "array"] }
	]);

	expect(await select(["object", "array", 1])).toEqual([
		{ value: json.object.array[1], path: ["object", "array", 1] }
	]);

	expect(await select(["object", "array", undefined])).toEqual([
		{ value: json.object.array[0], path: ["object", "array", 0] },
		{ value: json.object.array[1], path: ["object", "array", 1] },
		{ value: json.object.array[2], path: ["object", "array", 2] }
	]);
});