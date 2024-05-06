import { expect, test } from "vitest";
import { JsonSerializer, arrayStream, objectStream, stringStream } from "../json-serializer";
import { JsonStringifier } from "../json-stringifier";
import { streamToString } from "../utils";

test.each([
	{ space: undefined, desc: "undefined" },
	{ space: "\t", desc: "tab" },
	{ space: 4, desc: "4" },
])("JsonSerializer ($desc space)", async ({ space }) => {
	const stream = new JsonSerializer({
		test1: { test: 'object' },
		test2: {
			one: "one",
			two: [ { object: 'one' }, { object: 'two' } ],
			three: "three"
		},
		test3: objectStream(Object.entries({
			one: "one",
			two: arrayStream([ { object: 'one' }, { object: 'two' } ]),
			three: "three"
		})),
		test4: arrayStream([
			"one",
			objectStream(Object.entries({ object1: "one", object2: "two" })),
			"three"
		]),
		test5: stringStream(["chunk1", "chunk2"]),
		test6: () => stringStream(["chunk1", "chunk2"]),
		test7: Promise.resolve("promise"),
		test8: () => Promise.resolve("promise"),
		test9: undefined,
		test10: () => Promise.resolve(undefined),
		test11: "string"
	}, space);

	expect(await streamToString(stream.pipeThrough(new JsonStringifier()))).toBe(JSON.stringify({
		test1: {
			test: "object"
		},
		test2: {
			one: "one",
			two: [{ object: "one" }, { object: "two" }],
			three: "three"
		},
		test3: {
			one: "one",
			two: [{ object: "one" }, { object: "two" }],
			three: "three"
		},
		test4: [
			"one",
			{ object1: "one", object2: "two" },
			"three"
		],
		test5: "chunk1chunk2",
		test6: "chunk1chunk2",
		test7: "promise",
		test8: "promise",
		test11: "string"
	}, undefined, space));
});