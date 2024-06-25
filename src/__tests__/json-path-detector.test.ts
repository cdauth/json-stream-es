import { expect, test } from "vitest";
import { streamToArray } from "../utils.ts";
import { StringRole, arrayEnd, arrayStart, colon, comma, numberValue, objectEnd, objectStart, stringChunk, stringEnd, stringStart } from "../types.ts";
import { serializeJsonValue } from "../json-serializer.ts";
import { JsonPathDetector } from "../json-path-detector.ts";

test("PathDetector adds path", async () => {
	const stream = serializeJsonValue({
		object: {
			array: [
				"item1",
				2,
				{ key: "item3" }
			]
		}
	}).pipeThrough(new JsonPathDetector());

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

test("PathDetector handles empty object", async () => {
	const stream = serializeJsonValue({
		outer: {
			inner: {}
		}
	}).pipeThrough(new JsonPathDetector());

	expect(await streamToArray(stream)).toEqual([
		{ ...objectStart(), path: [] },
		{ ...stringStart(StringRole.KEY), path: [] },
		{ ...stringChunk("outer", StringRole.KEY), path: [] },
		{ ...stringEnd(StringRole.KEY), path: [] },
		{ ...colon(), path: [] },
		{ ...objectStart(), path: ["outer"] },
		{ ...stringStart(StringRole.KEY), path: ["outer"] },
		{ ...stringChunk("inner", StringRole.KEY), path: ["outer"] },
		{ ...stringEnd(StringRole.KEY), path: ["outer"] },
		{ ...colon(), path: ["outer"] },
		{ ...objectStart(), path: ["outer", "inner"] },
		{ ...objectEnd(), path: ["outer", "inner"] },
		{ ...objectEnd(), path: ["outer"] },
		{ ...objectEnd(), path: [] }
	]);
});

test("PathDetector handles empty array", async () => {
	const stream = serializeJsonValue({
		outer: {
			inner: []
		}
	}).pipeThrough(new JsonPathDetector());

	expect(await streamToArray(stream)).toEqual([
		{ ...objectStart(), path: [] },
		{ ...stringStart(StringRole.KEY), path: [] },
		{ ...stringChunk("outer", StringRole.KEY), path: [] },
		{ ...stringEnd(StringRole.KEY), path: [] },
		{ ...colon(), path: [] },
		{ ...objectStart(), path: ["outer"] },
		{ ...stringStart(StringRole.KEY), path: ["outer"] },
		{ ...stringChunk("inner", StringRole.KEY), path: ["outer"] },
		{ ...stringEnd(StringRole.KEY), path: ["outer"] },
		{ ...colon(), path: ["outer"] },
		{ ...arrayStart(), path: ["outer", "inner"] },
		{ ...arrayEnd(), path: ["outer", "inner"] },
		{ ...objectEnd(), path: ["outer"] },
		{ ...objectEnd(), path: [] }
	]);
});
