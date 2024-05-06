import { expect, test, vi } from "vitest";
import { streamToArray, stringToStream } from "../utils";
import { JsonParser } from "../json-parser";
import { PathSelector, type PathSelectorExpression } from "../path-selector";
import { StringRole, arrayEnd, arrayStart, colon, comma, numberValue, objectEnd, objectStart, stringChunk, stringEnd, stringStart } from "../types";
import { JsonSerializer } from "../json-serializer";
import { JsonDeserializer } from "../json-deserializer";

test("PathSelectorStream adds path", async () => {
	const stream = new JsonSerializer({
		object: {
			array: [
				"item1",
				2,
				{ key: "item3" }
			]
		}
	}).pipeThrough(new PathSelector([]));

	expect(await streamToArray(stream)).toEqual([
		{ ...objectStart(), path: [] },
		{ ...stringStart(StringRole.KEY), path: [] },
		{ ...stringChunk("object", StringRole.KEY), path: [] },
		{ ...stringEnd(StringRole.KEY), path: [] },
		{ ...colon(), path: [] },
		{ ...objectStart(), path: ["object"] },
		{ ...stringStart(StringRole.KEY), path: ["object"] },
		{ ...stringChunk("array", StringRole.KEY), path: ["object"] },
		{ ...stringEnd(StringRole.KEY), path: ["object"] },
		{ ...colon(), path: ["object"] },
		{ ...arrayStart(), path: ["object", "array"] },
		{ ...stringStart(), path: ["object", "array", 0] },
		{ ...stringChunk("item1"), path: ["object", "array", 0] },
		{ ...stringEnd(), path: ["object", "array", 0] },
		{ ...comma(), path: ["object", "array"] },
		{ ...numberValue(2), path: ["object", "array", 1] },
		{ ...comma(), path: ["object", "array"] },
		{ ...objectStart(), path: ["object", "array", 2] },
		{ ...stringStart(StringRole.KEY), path: ["object", "array", 2] },
		{ ...stringChunk("key", StringRole.KEY), path: ["object", "array", 2] },
		{ ...stringEnd(StringRole.KEY), path: ["object", "array", 2] },
		{ ...colon(), path: ["object", "array", 2] },
		{ ...stringStart(), path: ["object", "array", 2, "key"] },
		{ ...stringChunk("item3"), path: ["object", "array", 2, "key"] },
		{ ...stringEnd(), path: ["object", "array", 2, "key"] },
		{ ...objectEnd(), path: ["object", "array", 2] },
		{ ...arrayEnd(), path: ["object", "array"] },
		{ ...objectEnd(), path: ["object"] },
		{ ...objectEnd(), path: [] }
	]);
});

test("PathSelectorStream selects path", async () => {
	const json = {
		object: {
			array: [
				"item1",
				2,
				{ key: "item3" }
			]
		}
	};

	const select = async (selector: PathSelectorExpression) => await streamToArray(new JsonSerializer(json).pipeThrough(new PathSelector(selector)).pipeThrough(new JsonDeserializer()));

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