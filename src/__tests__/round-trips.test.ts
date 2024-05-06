import { describe, expect, test } from "vitest";
import { streamToArray, streamToString, stringToStream } from "../utils";
import { JsonParser } from "../json-parser";
import { JsonDeserializer } from "../json-deserializer";
import { JsonSerializer } from "../json-serializer";
import { JsonStringifier } from "../json-stringifier";

const testJsonObjects = [
	{
		key1: {
			test1: "value1",
			test2: "value2"
		},
		key2: {},
		key3: [
			"value1",
			{ test2: "value2" },
			3,
			[4, 5],
			true
		],
		key4: [],
		key5: "test",
		key6: -1.234,
		key7: true,
		key8: false,
		key9: null,
		key10: "Λάμβδα 😋"
	},

	{},

	[
		{ test1: "value1", test2: "value2" },
		{},
		["value1", "value2"],
		[],
		"test",
		-1.234,
		true,
		false,
		null
	],

	[],

	"test",

	-1.234,

	true,

	false,

	null
];

describe.each(testJsonObjects)("Test round trips", async (value) => {
	test("JSON.stringify() → JsonParser → JsonDeserializer", async () => {
		const stream = stringToStream(JSON.stringify(value, undefined, "\t")).pipeThrough(new JsonParser()).pipeThrough(new JsonDeserializer());
		const result = (await streamToArray(stream))[0].value;
		expect(result).toEqual(value);
	});

	test("JSON.stringify() → JsonParser → JsonStringifier → JSON.parse()", async () => {
		const stream = stringToStream(JSON.stringify(value, undefined, "\t")).pipeThrough(new JsonParser()).pipeThrough(new JsonStringifier());
		const result = JSON.parse(await streamToString(stream));
		expect(result).toEqual(value);
	});

	test("JsonSerializer → JsonStringifier → JSON.parse()", async () => {
		const stream = new JsonSerializer(value, "\t").pipeThrough(new JsonStringifier());
		const result = JSON.parse(await streamToString(stream));
		expect(result).toEqual(value);
	});

	test("JsonSerializer → JsonDeserializer", async () => {
		const stream = new JsonSerializer(value, "\t").pipeThrough(new JsonDeserializer());
		const result = (await streamToArray(stream))[0].value;
		expect(result).toEqual(value);
	});

	test("JsonSerializer → JsonStringifier → JsonParser → JsonDeserializer", async () => {
		const stream = new JsonSerializer(value, "\t").pipeThrough(new JsonStringifier()).pipeThrough(new JsonParser()).pipeThrough(new JsonDeserializer());
		const result = (await streamToArray(stream))[0].value;
		expect(result).toEqual(value);
	});
});