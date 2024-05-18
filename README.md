# json-stream-es

json-stream-es is a modern library that provides a streaming alternative to [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) and [`JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). It is published as an ECMAScript Module (ESM) and uses the new [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) (in particular [`TransformStream`s](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream)), and thus should work in the browser, in Node.js and in any other modern JavaScript environment.

When implementing a web service in the backend (for example a REST API), streaming JSON has the advantage that the data arrives to the user faster (because the web service doesn’t have to wait for all data to be loaded from the database before it can start sending it), and that memory consumption is greatly reduced (because the service only needs to keep small chunks of the data in memory before passing it on to the user).

When consuming a web service from the frontend, streaming JSON has the advantage that you can display the partial data as it loads, and that memory consumption is reduced if you only intend to consume parts of the retrieved data.

## Installation and requirements

json-stream-es is available through [NPM](https://www.npmjs.com/package/json-stream-es). Install it using `npm install -S json-stream-es` or `yarn add json-stream-es`.

json-stream-es relies on the [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) being available as global objects. When used in the backend, it thus requires Node.js >= 18 or a polyfill. In browsers, this API has been widely available since June 2022. If you need to support older browsers, a polyfill is required.

json-stream-es is published as an ECMAScript module. If you want to use it in a Node.js project that still uses CommonJS, you need to use [dynamic `import()`](https://nodejs.org/api/esm.html#import-statements) to import the library, `require()` is not supported.

To use the library in a web app that does not use a bundler, (not recommended in production), one way would be to import it from esm.sh:
```html
<script type="importmap">
	{
		"imports": {
			"json-stream-es": "https://esm.sh/json-stream-es"
		}
	}
</script>
<script type="module">
	import { generateJsonStream, parseJsonStream } from "json-stream-es";
</script>
```

## Usage

### Generate a JSON stream

In its most basic form, [`generateJsonStream()`](#generatejsonstream) can be used to create a stringified JSON stream:

```typescript
import { generateJsonStream } from "json-stream-es";

const jsonStream = generateJsonStream({
	object: {
		property1: "value1",
		property2: "value2"
	},
	array: [
		"value1",
		"value2"
	],
	numberValue: 1.23,
	booleanValue: true,
	nullValue: null
});
```

Like this, there is not much point yet in streaming the result, as the object is available synchronously. Things get interesting when we use the `objectStream()`, `arrayStream()` and `stringStream()` [stream generators](#stream-generators) and callbacks and promises to generate some values asynchronously:

```typescript
import { generateJsonStream, objectStream, arrayStream, stringStream } from "json-stream-es";

async function* generateString(value) {
	yield value;
}

async function* generateObject() {
	yield ["property1", "value1"];
	yield [generateString("property2"), generateString("value2")];
}

async function* generateArray() {
	yield "value1";
	yield generateString("value2");
}

const jsonStream = generateJsonStream({
	object: objectStream(generateObject()),
	array: () => arrayStream(generateArray()),
	numberValue: Promise.resolve(1.23),
	booleanValue: async () => true,
	nullValue: null
});
```

Each value anywhere the JSON document can be a synchronous value, a promise that resolves to a value, or a sync/async function returning a value. Each value can also be an object stream (created by `objectStream()`), an array stream (created by `arrayStream()`) or a string stream (created by `stringStream()`) (see [stream generators](#stream-generators) for details). String streams can also be used as property keys inside object streams. The stream creators accept an `Iterable`, an `AsyncIterable` or a `ReadableStream` data source.

The stringified JSON stream created by `JsonStringifier` is a `ReadableStream<string>`. Since most JavaScript methods work with `ReadableStream<Uint8Array>` instead, we can convert it using [`TextEncoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoderStream) (Node.js >= 18 required). Here is an example of streaming the result in an Express app:
```typescript
import { generateJsonStream, objectStream, arrayStream, stringStream } from "json-stream-es";
import { Writable } from "node:stream";

app.use("/api/test", (req, res) => {
	res.header("Content-type", "application/json");
	new generateJsonStream({
		test: "value"
	})
		.pipeThrough(new TextEncoderStream())
		.pipeTo(Writable.toWeb(res));
});
```

If you prefer the generated JSON to be indented, you can pass a number or string as the second parameter to `generateJsonStream()`. It will behave in the same way as the [`space` parameter of `JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#space).

### Consume a JSON stream

[`parseJsonStream()`](#parsejsonstream) parses a stringified JSON stream, selects specific array items or object properties from it and emits their values. It consumes a `ReadableStream<string>`. Since most JavaScript methods emit a `ReadableStream<Uint8Array>`, we can use [`TextDecoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoderStream) to convert that to a string stream (wide browser support since September 2022, so you might need a polyfill). Here is an example how to use it with the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API):

```typescript
import { parseJsonStream, streamToIterable } from "json-stream-es";

const res = await fetch("/api/test"); // Responds with {"results":[{"test":"value1"},"value2"]}
const stream = res
	.pipeThrough(new TextDecoderStream())
	.pipeThrough(parseJsonStream(["results"]));

for await (const value of streamToIterable(stream)) {
	// Will be called twice:
	// - { test: "value1" }
	// - "value2"
	console.log(value);
}
```

`parseJsonStream()` expects a [JSON path selector](#json-path-selector) that matches one or more objects or arrays in the JSON document, causing it to emit their direct child values/elements. If the selector matches any values that are not objects/arrays, those are ignored.

#### Getting object keys

If you need access to not just the object property values, but also their keys, you can use [`parseJsonStreamWithPaths()`](#parsejsonstreamwithpaths) instead. It emits a `ReadableStream<{ value: JsonValue; path: Array<string | number> }>`, where `path` is the array of object property keys and array element indexes where each value is located. In the example above, the stream would emit the following values:
* `{ value: { test: "value1" }, path: ["results", 0] }`
* `{ value: "value2", path: ["results", 1] }`

#### Consuming multiple objects/arrays

Sometimes you want to consume multiple objects/arrays in a JSON stream. This would be an example JSON documents:
```json
{
	"apples": {
		"results": [
			"apple1",
			"apple2"
		]
	},
	"cherries": {
		"results": [
			"cherry1",
			"cherry2"
		]
	}
}
```

If you want to consume all apples and all cherries as a stream, the simplest way would be to use `parseJsonStreamWithPaths([["apples", "cherries"], "results"])`. This will create one stream that emits all apples and all cherries, and you would infer from each emitted value’s `path` whether a value is an apple or a cherry.

json-stream-es also provides an alternative approach to consume multiple objects/arrays. [`parseJsonStreamAsSubStreams`](#parsejsonstreamassubstreams), will emit a `ReadableStream<ReadableStream<JsonValue>>`. In the above example, the stream would emit two chunks: One nested readable stream emitting all the apples, and one nested readable stream emitting all the cherries. While this approach may seem a bit excentric, it has proven to be useful in some scenarios. It also allows you to pipe the individual sub streams to different destinations.

Each of the nested streams gets a `path` property that indicates the path of the object/array whose properties/elements it streams.

```typescript
const stream = res
	.pipeThrough(parseJsonStreamAsSubStreams(["results"]));

for await (const subStream of streamToIterable(stream)) {
	if (subStream.path[0] === "apples") {
		for await (const apple of streamToIterable(subStream)) {
			console.log(apple);
		}
	} else if (subStream.path[0] === "cherries") {
		for await (const cherry of streamToIterable(subStream)) {
			console.log(cherry);
		}
	}
}
```

If you need access to the property keys inside the sub streams, you can use [`parseJsonStreamAsSubStreamsWithPaths`](#parsejsonstreamassubstreamswithpaths) instead. The resulting sub streams have their parent path prefixes removed from their paths, so in the above example, the individual apples and cherries would be emitted with paths `[0]` and `[1]`, without the `["apples", "results"]` and `["cherries", "results"]`.

**Note:** If you iterate over the parent stream without consuming the sub streams, the results of the sub streams will be cached in memory. If you don’t need a particular sub stream, discard it using `subStream.cancel()` (when using `break` in a stream iterator, the stream is canceled automatically).

## Concepts

### Architecture

At its core, json-stream-es handles 3 types of JSON documents:
* A `ReadableStream<string>` is a streamed stringified JSON document
* A `ReadableStream<JsonChunk>` is an internal representation of a JSON document, where each [`JsonChunk`](#jsonchunk-objects) represents a section of the document
* A `JsonValue` is a JavaScript value that can be stringified to JSON (in particular `{ [key: string]: JsonValue } | Array<JsonValue> | string | number | boolean | null`).

The main features of json-stream-es are:
* Provide converters to convert between the 3 types of JSON documents:
	* [`JsonParser`](#jsonparser) (`ReadableStream<string>` → `ReadableStream<JsonChunk>`)
	* [`JsonStringifier`](#jsonstringifier) (`ReadableStream<JsonChunk>` → `ReadableStream<string>`)
	* [`JsonDeserializer`](#jsondeserializer) (`ReadableStream<JsonChunk>` → `JsonValue`)
	* [`JsonSerializer`](#jsonserializer) (`JsonValue` → `ReadableStream<JsonChunk>`)
* Provide helpers to generate, analyze and modify a `ReadableStream<JsonChunk>`:
	* [`JsonPathDetector`](#jsonpathdetector) to detect the property key path for values nested in objects/arrays
	* [`JsonPathSelector`](#jsonpathselector) to filter out values nested in objects/arrays based on their path
	* [`JsonPathStreamSplitter`](#jsonpathstreamsplitter) to split a stream of JSON values into a stream of sub streams for the values under different paths
	* [`JsonChunk` creators](#jsonchunk-creators) to create a stream of `JsonChunk`s by hand

### `JsonChunk` objects

A `JsonChunk` is an internal representation of a section of the JSON document that has a specific semantic meaning; The types of `JsonChunk` are:

| Type            | Description | Properties |
| --------------- | ----------- | ---------- |
| `OBJECT_START`  | A `{` starting an object. | |
| `OBJECT_END`    | A `}` ending an object. | |
| `ARRAY_START`   | A `[` starting an array. | |
| `ARRAY_END`     | A `]` ending an array. | |
| `STRING_START`  | A `"` starting a string (this can be a value or an object property key). | `role`: `StringRole.KEY` if this string is an object property key, otherwise `StringRole.VALUE`. |
| `STRING_CHUNK`  | A part of a string. | `value`: The part of the string.<br>`role`: `StringRole.KEY` if this string is an object property key, otherwise `StringRole.VALUE`. | |
| `STRING_END`    | A `"` ending a string. | `role`: `KEY` if this string is an object property key, otherwise `StringRole.VALUE`. |
| `NUMBER_VALUE`  | A number value. | `value`: The number. | |
| `BOOLEAN_VALUE` | A boolean value. | `value`: The boolean value. | |
| `NULL_VALUE`    | A `null` value. | `value`: `null`. |
| `COMMA`         | A `,` that separates two array/object items. | |
| `COLON`         | A `:` that separates an object property key from its value. | |
| `WHITESPACE`    | Whitespace characters without any semantic meaning appearing between JSON tokens. | |

In addition to the properties outlined above, each `JsonChunk` has a `rawValue` property that represents the string as the chunk appeared in the document. This means that the `rawValues` of all the chunks concatenated are equal to the stringified JSON document.

For example, take the following JSON document:
```json
{
	"string": "Test \u2665",
	"number": -1.23e2
}
```

This document would be represented by the following `JsonChunk`s:

```javascript
{ type: JsonChunkType.OBJECT_START, rawValue: "{" }
{ type: JsonChunkType.WHITESPACE, rawValue: "\n\t" }
{ type: JsonChunkType.STRING_START, role: StringRole.KEY, rawValue: "\"" }
{ type: JsonChunkType.STRING_CHUNK, value: "string", role: StringRole.KEY, rawValue: "string" }
{ type: JsonChunkType.STRING_END, role: StringRole.KEY, rawValue: "\"" }
{ type: JsonChunkType.COLON: rawValue: ":" }
{ type: JsonChunkType.WHITESPACE, rawValue: " " }
{ type: JsonChunkType.STRING_START, role: StringRole.VALUE, rawValue: "\"" }
{ type: JsonChunkType.STRING_CHUNK, value: "Test ♥", role: StringRole.VALUE, rawValue: "Test \\u2665" }
{ type: JsonChunkType.STRING_END, role: StringRole.VALUE, rawValue: "\"" }
{ type: JsonChunkType.COMMA, rawValue: "," }
{ type: JsonChunkType.WHITESPACE, rawValue: "\n\t" }
{ type: JsonChunkType.STRING_START, role: StringRole.KEY, rawValue: "\"" }
{ type: JsonChunkType.STRING_CHUNK, value: "number", role: StringRole.KEY, rawValue: "number" }
{ type: JsonChunkType.STRING_END, role: StringRole.KEY, rawValue: "\"" }
{ type: JsonChunkType.COLON: rawValue: ":" }
{ type: JsonChunkType.WHITESPACE, rawValue: " " }
{ type: JsonChunkType.NUMBER_VALUE, value: -123, rawValue: "-1.23e2" }
{ type: JsonChunkType.WHITESPACE, rawValue: "\n" }
{ type: JsonChunkType.OBJECT_END, rawValue: "}" }
```

Note that depending on the chunks that arrive from the underlying `ReadableStream<string>`, the whitespaces and the strings in the JSON document might be split up into multiple `Whitespace` and `StringChunk` chunks.

### JSON path selector

Some methods expect a JSON path selector to pick only some values from the JSON stream. A JSON path selector is an array of items of the following type, where each item matches one key in the hierarchy of objects/arrays:
* A string matches an object property key
* A number matches an array element index
* `undefined` matches any key/index
* An array of strings/numbers matches any key/index provided in the array

```json
{
	"array": [
		"item1",
		"item2"
	]
}
```

In this example JSON document, the following selectors would select the following values:
* `[]`: The root object itself
* `["array"]`: The array of two items
* `["array", 1]`: `"item2"
* `["array", undefined]`: `"item1"` and `"item2"`
* `["array", [0, 1]]`: `"item1"` and `"item2"`

If this kind of granularity is not enough for you, you can also provide a callback function that accepts the path of a value (an array of strings and numbers) and returns a boolean (`true` indicates that the value should be selected). You can also reuse the [`matchesJsonPathSelector`](#matchesjsonpathselector) function inside the callback:
```typescript
stream.pipeThrough(parseJsonStream((path) => (
	matchesJsonPathSelector(path, ["objects", "results"]) ||
	matchesJsonPathSelector(path, ["my", "nested", "path"])
)));
```

## API

### Convenience functions

#### `generateJsonStream`

`generateJsonStream(value: SerializableJsonValue, space?: string | number): ReadableStream<string>`

A convenience function to serialize a JSON value into a stringified JSON stream. Under the hood, it creates a [`JsonSerializer`](#jsonserializer) and pipes it through a [`JsonStringifier`](#jsonstringifier). See those for details.

#### `parseJsonStream`

`parseJsonStream(selector: JsonPathSelectorExpression): TransformStream<string, JsonValue>`

A convenience function to parse a stringified JSON stream, select certain arrays and/or objects from it and stream their values/elements. `selector` needs to be a [JSON path selector](#json-path-selector) that selects one or more objects/values whose values/elements should be streamed.

Under the hood, creates a transformer chain of a [`JsonParser`](#jsonparser), [`JsonPathDetector`](#jsonpathdetector), [`JsonPathSelector`](#jsonpathselector) and [`JsonDeserializer`](#jsondeserializer), see those for details.

#### `parseJsonStreamWithPaths`

`parseJsonStreamWithPaths(selector: JsonPathSelectorExpression): TransformStream<string, { value: JsonValue; path: Array<string | number> }>`

Like [`parseJsonStream`](#parsejsonstream), but emits a stream of `{ value: JsonValue; path: Array<string | number> }` instead, where `path` is the path of object property keys and array element indexes of each value. This allows you to to access the property keys when streaming a JSON object.

#### `parseJsonStreamAsSubStreams`

`parseJsonStreamAsSubStreams(selector: JsonPathSelectorExpression): TransformStream<string, ReadableStream<JsonValue> & { path: JsonPath }>`

A convenience function to parse a stringified JSON stream, select certain arrays and/or objects return a nested stream for each of them emitting their values/elements. `selector` needs to be a [JSON path selector](#json-path-selector) that selects one or more objects/values whose values/elements should be streamed.

Under the hood, creates a transformer chain of a [`JsonParser`](#jsonparser), [`JsonPathDetector`](#jsonpathdetector), [`JsonPathSelector`](#jsonpathselector) and [`JsonPathStreamSplitter`](#jsonpathstreamsplitter), and then pipes each sub stream through[`JsonDeserializer`](#jsondeserializer).

#### `parseJsonStreamAsSubStreamsWithPaths`

`parseJsonStreamAsSubStreamsWithPaths(selector: JsonPathSelectorExpression): TransformStream<string, ReadableStream<{ value: JsonValue; path: Array<string | number> }> & { path: JsonPath }>`

Like [`parseJsonStreamAsSubStreams`](#parsejsonstreamassubstreams), but the nested streams emit `{ value: JsonValue; path: Array<string | number> }` instead, where `path` is the path of object property keys and array element indexes of each value. In the sub streams, the paths have the path prefix of their containing streamed object/array removed.

### Stream transformers

#### `JsonParser`

A `TransformStream<string, JsonChunk>` that parses the incoming stringified JSON stream and emits [`JsonChunk` objects](#jsonchunk-objects) for the different tokens that the JSON document is made of.

Construct one using `new JsonParser(writableStrategy?: QueuingStrategy<string>, readableStrategy?: QueuingStrategy<JsonChunk>)` and use it by calling [`.pipeThrough()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) on a `ReadableStream<string>`.

Pass the output on to [`JsonPathSelector`](#jsonpathselector) and [`JsonDeserializer`](#jsondeserializer) to consume a JSON stream.

The input stream is expected to contain one valid JSON document. If the document is invalid or the input stream contains zero or multiple documents, the stream aborts with an error. This also means that you can rely on the order of the emitted `JsonChunk` objects to be valid (for example, when a `JsonChunkType.STRING_CHUNK` object is emitted, you can be sure that it was preceded b a `JsonChunkType.STRING_START` object).

#### `JsonStringifier`

A `TransformStream<JsonChunk, string>` that converts a stream of [`JsonChunk` objects](#jsonchunk-objects) into a stringified JSON stream. The reverse of [`JsonParser`](#jsonparser).

Construct one using `new JsonStringifier(writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<string>)` and use it by calling [`.pipeThrough()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) on a `ReadableStream<JsonChunk>`.

Use it in combination with [`JsonSerializer`](#jsonserializer) to generate JSON streams or use the [`JsonChunk` creators](#jsonchunk-creators) if you need manual control over the structure of the generated JSON document.

Under the hood, this stream simply emits the `rawValue` properties of the incoming `JsonChunk` objects. This means that the stream does not perform any validation of the structure of incoming objects. If you pass in `JsonChunk` objects in an invalid order, the output may be invalid JSON.

#### `JsonDeserializer`

A `TransformStream<JsonChunk, { value: JsonValue; path?: Array<string | number> }>` that consumes one or more JSON values in the form of `JsonChunk` objects and converts them into JavaScript values (`JsonValue` includes all JSON-stringifiable types: objects, arrays, strings, numbers, booleans or null).

Construct it using `new JsonDeserializer(writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<string>)` and use it by calling [`.pipeThrough()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) on a `ReadableStream<JsonChunk>`.

Usually this is used on a stream created by [`JsonParser`](#jsonparser) and piped through [`JsonPathSelector`](#jsonpathselector) to consume a JSON stream.

Note that the stream does not check the validity of the incoming `JsonChunk` objects. If you pass in chunks in an order that does not make sense, the stream will produce unpredictable output.

#### `JsonSerializer`

A `ReadableStream<JsonChunk>` that emits the `JsonChunk` objects for a JSON value that it is initialized with. In a way this is the reverse of [`JsonDeserializer`](#jsondeserializer), but only for a single JSON document.

Construct it using `new JsonSerializer(value: SerializableJsonValue, space?: string | number, strategy?: QueuingStrategy<JsonChunk>)`. It is often [piped through](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) [`JsonStringifier`](#jsonstringifier) to generate a stringified JSON stream.

The `SerializableJsonValue` can be any valid JSON value, that is `Record<string, JsonValue> | Array<JsonValue> | string | number | boolean | null`. In addition, for async support, any value anywhere in the JSON document can also be a `Promise<JsonValue>` or a `() => JsonValue | Promise<JsonValue>` callback instead. For streaming support, any object in the JSON document can be an object stream created by `objectStream()`, any array can be an array stream created by `arrayStream()` and any string (including property keys) can be a string stream created by `stringStream()` (for these, see [stream generators](#stream-generators)). Callbacks or promises returning these streams are also supported.

As `space`, you can specify a number of indentation spaces or an indentation string, equivalent to the [space](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#space) parameter of `JSON.stringify()`. This will cause `WHITESPACE` chunks to be emitted in the appropriate places.

##### Stream generators

To support streaming objects, arrays and strings in `JsonSerializer`, some helper functions are provided. Each of these accept an `AnyIterable<T> = Iterable<T> | AsyncIterable<T> | ReadableStream<T>` argument, so you can provide the data stream in the form of an iterator or a stream.

`objectStream(stream: AnyIterable<[key: string | StringStream, value: SerializableJsonValue]>` returns a stream of object properties in the form of `[key, value]` tuples. Nested streams are supported anywhere in the value, and the key can also be a string stream returned by `stringStream()`.

`arrayStream(stream: AnyIterable<SerializableJsonValue>)` returns a stream of array entries. Nested streams are supported anywhere in the entries.

`stringStream(stream: AnyIterable<string>)` returns a string stream. The data source should emit string chunks.

##### Troubleshooting: `Index signature for type 'string' is missing in type`

If you pass an interface instance to `JsonSerializer`, you might encounter the TypeScript error `Index signature for type 'string' is missing in type`:
```typescript
interface Test {
	test: string;
}
const object: Test = { test: "test" };
new JsonSerializer(object); // Error: Index signature for type 'string' is missing in type 'Test'. ts(2345)
```

While this seems confusing at first, TypeScript is technically right: The interface can be augmented through declaration merging, and there is no guarantee that additional properties will match the `SerializableJsonValue` type. There are different solutions to this, some of which are listed [on StackOverflow](https://stackoverflow.com/q/37006008/242365):
* Declare `Test` as `type` instead of `interface`
* Use `const object: Pick<Test, keyof Test>`
* Use `new JsonSerializer({ ...object })`.

If none of these work for you, for example because the interfaces are declared by a third party library and are deeply nested, the following helper type should work:
```typescript
type InterfaceToType<T> = {
	[K in keyof T]: InterfaceToType<T[K]>;
}

const object: InterfaceToType<Test> = { test: "test" };
new JsonSerializer(object);
```

#### `JsonPathDetector`

A `TransformStream<JsonChunk, JsonChunk & { path: Array<string | number> }>` that keeps track of the hierarchy of objects and arrays of the incoming chunks and assigns a path to each chunk.

The path is provided using an array of strings and numbers, where strings are object property keys and numbers are array item indexes. For example, in the JSON document `{ "key1": "value1", "key2": ["value2", "value3"] }`, the chunks of the parts `{ "key1":`, `, "key2":` and `}` would have a path `[]`, the chunks of the part ` "value1"` would have the path `["key1"]`, the chunks of the parts ` [`, `,` and `] ` would have the path `["key2"]`, the chunks of `"value2"` would have the path `["key2", 0]` and `"value3"` would have `["key2", 1]`. In other words, for objects the chunks between `:` and `,`/`}` receive a property key in the path, and for arrays the chunks between `[` and `]` except `,` receive an item index.

`JsonPathSelector` can be constructed using `new JsonPathSelector(writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<JsonChunkWithPath>)`.

Typically, the result is piped through [`JsonPathSelector](#json-path-selector) to filter out chunks based on their path.

#### `JsonPathSelector`

A `TransformStream<JsonChunk & { path: Array<string | number> }, JsonChunk & { path: Array<string | number> }>` filters out the chunks that don’t match the provided path selector.

Expects an array of JSON values with paths as emitted by [`JsonPathDetector`](#jsonpathdetector).

`JsonPathSelector` can be constructed using `new JsonPathSelector(selector: JsonPathSelectorExpression, writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<JsonChunkWithPath>)`. It expects a [JSON path selector](#json-path-selector) expression. All chunks selected by the selector and their descendents are passed through. Notably, this behaviour is different than in the convenience functions such as [`parseJsonStream`](#parsejsonstream), where only the children of the selected objects/arrays would be passed through. If you want to select only the children of an object/array with `JsonPathSelector`, you have to use a `[...path, undefined]` selector.

The `JsonChunk` stream emitted by `JsonPathSelector` is different from other `JsonChunk` streams in the fact that it may emit multiple JSON values on the root level. Typically, the stream is piped through [`JsonDeserializer`](#jsondeserializer) to convert it into actual JavaScript values.

#### `JsonPathStreamSplitter`

A `TransformStream<JsonChunkWithPath, ReadableStream<JsonChunkWithPath> & { path: JsonPath; }>` that consumes a stream of multiple JSON values (such as one emitted by [`JsonPathSelector`](#jsonpathselector)) and emits one nested `ReadableStream` for each JSON value in the stream that emits the chunks for that value. The nested streams can be piped into a [`JsonPathSelector`](#jsonpathselector) or [`JsonDeserializer`](#jsondeserializer) or consumed directly.

The emitted sub-streams have an additional `path` property that represents the path of the value that the sub-stream is for. The individual chunks of the sub-stream have this part of the path removed from their `path`, so that the sub stream behaves like any regular JSON stream where the selected value would be on the root level.

**Note:** If you iterate over the parent stream without consuming the sub streams, the results of the sub streams will be cached in memory. If you don’t need a particular sub stream, discard it using `subStream.cancel()` (when using `break` in a stream iterator, the stream is canceled automatically).

### Utils

#### `matchesJsonPathSelector`

```
matchesJsonPathSelector(
	path: Array<string | number>,
	selector: (
		| Array<Array<string | number> | string | number | undefined>
		| ((path: Array<string | number>) => boolean)
	)
): boolean
```

Returns `true` if the given JSON path (an array of object property keys and array element indexes) matches the given [JSON path selector](#json-path-selector).

#### `JsonChunk` creators

A bunch of helper functions are provided to manually create `JsonChunk` objects. You should always use these helper functions rather than creating `JsonChunk` objects by hand to make sure that the `rawValue` property has the right value.

* `whitespace(rawValue: string)`, where `rawValue` contains the whitespaces
* `comma()`
* `colon()`
* `objectStart()`
* `objectEnd()`
* `arrayStart()`
* `arrayEnd()`
* `stringStart(role = StringRole.VALUE)` (set `role` to `StringRole.KEY` for property keys)
* `stringChunk(value: string, role = StringRole.VALUE)` (set `role` to `StringRole.KEY` for property keys)
* `stringEnd(role = StringRole.VALUE)` (set `role` to `StringRole.KEY` for property keys)
* `numberValue(value: number)`
* `booleanValue(value: boolean)`
* `nullValue(value: null)`

#### `streamToIterable`

`streamToIterable<T>(stream: ReadableStream<T>): AsyncIterable<T>`

According to the latest Streams API specification, `ReadableStream` implements the [async iterable protocol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols), so it can be consumed using `for await`. However, [browser support](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API#browser_compatibility) for this still limited as of 2024, and as a result this has also not been implemented in the TypeScript types yet.

For convenience, json-stream-es exports a helper function that manually converts a `ReadableStream` into an `AsyncIterable` so that you can easily iterate through a stream using `for await (const chunk of streamToIterable(stream))`.

## Acknowledgements

This library is inspired by [creationix/jsonparse](https://github.com/creationix/jsonparse) by Tim Caswell and [dominictarr/JSONStream](https://github.com/dominictarr/JSONStream) by Dominic Tarr.