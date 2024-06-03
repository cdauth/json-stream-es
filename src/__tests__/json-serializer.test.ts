import { expect, test } from "vitest";
import { arrayStream, objectStream, serializeJsonValue, stringStream } from "../json-serializer";
import { JsonStringifier } from "../json-stringifier";
import { streamToString } from "../utils";

test.each([
	{ space: undefined, desc: "undefined" },
	{ space: "\t", desc: "tab" },
	{ space: 4, desc: "4" },
])("JsonSerializer ($desc space)", async ({ space }) => {
	const testObject = {
		one: "one",
		two: "chunk1chunk2",
		three: [{ object: 'one' }, { object: 'two' }],
		four: { object1: "one", object2: "two" },
		five: 4,
		six: true,
		seven: null,

		convert1: Object("one"),
		convert2: Object(2),
		convert3: Object(true),
		convert4: Infinity,
		convert5: NaN,
		convert6: { toJSON: (key: string) => `six ${key}` },
		convert7: new Date(0),
		convert8: (JSON as any).rawJSON("12345678901234567890"),
		convert9: 12345678901234567890,
		convert10: (JSON as any).rawJSON("12345678901234567890"), // bigint is used below
		convert11: (JSON as any).rawJSON("12345678901234567890"), // BigInt is used below

		invalid1: undefined,
		invalid2: Symbol(),
		invalid3: () => undefined,
		[Symbol()]: "invalid4"
	};

	const getTestObject = () => Object.fromEntries(Object.entries(testObject).map(([k, v]) => {
		switch (k) {
			case "two": return ["two", stringStream(["chunk1", "chunk2"])];
			case "three": return ["three", arrayStream([{ object: 'one' }, { object: 'two' }])];
			case "four": return ["four", objectStream([["object1", "one"], ["object2", "two"]])];
			case "convert10": return ["convert10", 12345678901234567890n];
			case "convert11": return ["convert11", Object(12345678901234567890n)];
			default: return [k, v];
		}
	}));

	const stream = serializeJsonValue({
		test1: getTestObject(),
		test2: objectStream(Object.entries(getTestObject())),
		test3: arrayStream(Object.values(getTestObject())),

		async1: () => stringStream(["chunk1", "chunk2"]),
		async2: Promise.resolve("promise"),
		async3: () => Promise.resolve("promise"),
		async4: () => Promise.resolve(undefined),

		...testObject
	} as any, space);

	const expectedResult = {
		test1: testObject,
		test2: testObject,
		test3: Object.values(testObject),
		async1: "chunk1chunk2",
		async2: "promise",
		async3: "promise",
		async4: undefined,
		...testObject
	};

	expect(await streamToString(stream.pipeThrough(new JsonStringifier()))).toBe(JSON.stringify(expectedResult, undefined, space));
});