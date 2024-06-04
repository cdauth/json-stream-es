import { expect, test } from "vitest";
import { stringifyJsonStream, parseJsonStream, parseNestedJsonStream, parseNestedJsonStreamWithPaths, parseJsonStreamWithPaths } from "../convenience";
import { arrayStream, objectStream } from "../json-serializer";
import { streamToArray, streamToIterable, streamToString, stringToStream } from "../utils";
import type { JsonPath } from "../json-path-detector";

const testObject = {
	apples: {
		results: ["apple1", "apple2"]
	},
	cherries: {
		results: {
			"1": "cherry1",
			"2": "cherry2"
		}
	}
};

test.each([
	{ space: undefined, description: "no indentation" },
	{ space: "\t", description: "tab indentation" },
	{ space: 4, description: "4 spaces indentation" }
])("stringifyJsonStream ($description)", async ({ space }) => {
	const stream = stringifyJsonStream({
		apples: { results: arrayStream(testObject.apples.results) },
		cherries: { results: objectStream(Object.entries(testObject.cherries.results)) }
	}, space);
	expect(await streamToString(stream)).toBe(JSON.stringify(testObject, undefined, space));
});

test("parseJsonStream", async () => {
	const stream = stringToStream(JSON.stringify(testObject))
		.pipeThrough(parseJsonStream([["apples", "cherries"], "results"]));
	expect(await streamToArray(stream)).toEqual(["apple1", "apple2", "cherry1", "cherry2"]);
});

test("parseJsonStream fails for multiple documents", async () => {
	const stream = stringToStream(`"value1"\n"value2"`)
		.pipeThrough(parseJsonStream([]));
	await expect(async () => await streamToArray(stream)).rejects.toThrowError("Unexpected character");
});

test("parseJsonStream multi", async () => {
	const documents = [
		"value1",
		2,
		{ test3: "value3" },
		["value4"]
	];
	const stream = stringToStream(documents.map((v) => `\x1e${JSON.stringify(v)}`).join("\n"))
		.pipeThrough(parseJsonStream(undefined, { multi: true }));
	expect(await streamToArray(stream)).toEqual(documents);
});

test("parseJsonStream multi no values", async () => {
	const stream = stringToStream("")
		.pipeThrough(parseJsonStream(undefined, { multi: true }));
	expect(await streamToArray(stream)).toEqual([]);
});

test("parseJsonStreamWithPaths", async () => {
	const stream = stringToStream(JSON.stringify(testObject))
		.pipeThrough(parseJsonStreamWithPaths([["apples", "cherries"], "results"]));
	expect(await streamToArray(stream)).toEqual([
		{ value: "apple1", path: ["apples", "results", 0] },
		{ value: "apple2", path: ["apples", "results", 1] },
		{ value: "cherry1", path: ["cherries", "results", "1"] },
		{ value: "cherry2", path: ["cherries", "results", "2"] }
	]);
});

test("parseNestedJsonStream", async () => {
	const stream = stringToStream(JSON.stringify(testObject))
		.pipeThrough(parseNestedJsonStream([["apples", "cherries"], "results"]));

	let results: Array<{ path: JsonPath; chunks: any[] }> = [];
	for await (const subStream of streamToIterable(stream)) {
		results.push({
			path: subStream.path,
			chunks: await streamToArray(subStream)
		});
	}

	expect(results).toEqual([
		{
			path: ["apples", "results"],
			chunks: ["apple1", "apple2"]
		},
		{
			path: ["cherries", "results"],
			chunks: ["cherry1", "cherry2"]
		}
	]);
});

test("parseNestedJsonStreamWithPaths", async () => {
	const stream = stringToStream(JSON.stringify(testObject))
		.pipeThrough(parseNestedJsonStreamWithPaths([["apples", "cherries"], "results"]));

	let results: Array<{ path: JsonPath; chunks: any[] }> = [];
	for await (const subStream of streamToIterable(stream)) {
		results.push({
			path: subStream.path,
			chunks: await streamToArray(subStream)
		});
	}

	expect(results).toEqual([
		{
			path: ["apples", "results"],
			chunks: [
				{ value: "apple1", path: [0] },
				{ value: "apple2", path: [1] }
			]
		},
		{
			path: ["cherries", "results"],
			chunks: [
				{ value: "cherry1", path: ["1"] },
				{ value: "cherry2", path: ["2"] }
			]
		}
	]);
});