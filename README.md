# json-stream-es

json-stream-es is a modern library that provides a streaming alternative to [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) and [`JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). It is published as an ECMAScript Module (ESM) and uses the new [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) (in particular [`TransformStream`s](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream)), and thus should work in the browser, in Node.js and in any other modern JavaScript environment.

When implementing a web service in the backend (for example a REST API), streaming JSON has the advantage that the data arrives to the user faster (because the web service doesn’t have to wait for all data to be loaded from the database before it can start sending it), and that memory consumption is greatly reduced (because the service only needs to keep small chunks of the data in memory before passing it on to the user).

When consuming a web service from the frontend, streaming JSON has the advantage that you can display the partial data as it loads, and that memory consumption is reduced if you only intend to consume parts of the retrieved data.

## Installation and requirements

json-stream-es is available on [NPM](https://www.npmjs.com/package/json-stream-es). Install it using `npm install -S json-stream-es` or `yarn add json-stream-es`.

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
	import { JsonParser, JsonDeserializer } from "json-stream-es";
</script>
```

## Usage

### Generate a JSON stream

In its most basic form, [`generateJsonStream()`](#generatejsonstream) can be used to create a stringified JSON stream:

```typescript
import { generateJsonStream() } from "json-stream-es";

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
	const jsonStream = new generateJsonStream({
		test: "value"
	});
	jsonStream.pipeTo(Writable.toWeb(res));
});
```

If you prefer the generated JSON to be indented, you can pass a number or string as the second parameter to `generateJsonStream()`. It will behave in the same way as the [`space` parameter of `JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#space).

### Consume a JSON stream

[`parseJsonStream()`](#parsejsonstream) is a convenience function that parses a stringified JSON stream, selects specific array items or object properties from it and emits their values along with a path where the value is located in the tree of objects and arrays. It consumes a `ReadableStream<string>`. Since most JavaScript methods emit a `ReadableStream<Uint8Array>`, we can use [`TextDecoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoderStream) to convert that to a string stream (wide browser support since September 2022, so you might need a polyfill). Here is an example how to use it with the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API):

```typescript
import { parseJsonStream } from "json-stream-es";

const res = await fetch("/api/test"); // Responds with {"results":[{"test":"value1"},"value2"]}
const stream = res
	.pipeThrough(new TextDecoderStream())
	.pipeThrough(parseJsonStream(["results", undefined));

const reader = stream.getReader();
while (true) {
	const { done, value } = await reader.read();
	if (done) {
		break;
	} else {
		// Will be called twice:
		// - { test: "value1" }, ["results", 0]
		// - "value2", ["results", 1]
		console.log(value.value, value.path);
	}
}
```

`parseJsonStream()` expects an array of strings, numbers and `undefined` values, where strings refer to object properties with the specified key, numbers refer to array items with the specified index and `undefined` refers to any object property or array items. In the above example, `["results", undefined]` refers to any value found in the array/object under the `results` property. We could also specify `["results", 1]` to pick only the second array item.

Note that if the root value of your JSON document is an array, you need to use `parseJsonStream([undefined])` to stream its items, as an empty path would select the array itself rather than its items.

`parseJsonStream()` can also be passed a function that receives the path of each JSON chunk in the form of an `Array<string | number>` and returns a boolean to indicate whether the chunk should be included.

## Architecture

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
	* [`PathSelector`](#pathselector) to detect the context for values nested in objects/arrays and filter values based on their context
	* [`JsonChunk` creators](#jsonchunk-creators)

### `JsonChunk` objects

A `JsonChunk` is an internal representation of a section of the JSON document that has a specific semantic meaning; The types of `JsonChunk` are:

| Type            | Description | Properties |
| --------------- | ----------- | ---------- |
| `WHITESPACE`    | Whitespace characters without any semantic meaning appearing between JSON tokens. | |
| `COMMA`         | A `,` that separates two array/object items. | |
| `COLON`         | A `:` that separates an object property key from its value. | |
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

## API

### `generateJsonStream`

`generateJsonStream(value: SerializableJsonValue, space?: string | number): ReadableStream<string>`

A convenience function to serialize a JSON value into a stringified JSON stream. Under the hood, it creates a [`JsonSerializer`](#jsonserializer) and pipes it through a [`JsonStringifier`](#jsonstringifier). See those for details.

### `parseJsonStream`

`parseJsonStream(selector: PathSelectorExpression): TransformStream<string, { value: JsonValue; path: Array<string | number> }>`

A convenience function to parse a stringified JSON stream, select certain array items and/or object properties from it and stream their values. Returns a transformer chain of a [`JsonParser`](#jsonparser), [`PathSelector`](#pathselector) and [`JsonDeserializer`](#jsondeserializer), see those for details.

### `JsonParser`

A `TransformStream<string, JsonChunk>` that parses the incoming stringified JSON stream and emits [`JsonChunk` objects](#jsonchunk-objects) for the different tokens that the JSON document is made of.

Construct one using `new JsonParser(writableStrategy?: QueuingStrategy<string>, readableStrategy?: QueuingStrategy<JsonChunk>)` and use it by calling [`.pipeThrough()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) on a `ReadableStream<string>`.

Pass the output on to [`PathSelector`](#pathselector) and [`JsonDeserializer`](#jsondeserializer) to consume a JSON stream.

The input stream is expected to contain one valid JSON document. If the document is invalid or the input stream contains zero or multiple documents, the stream aborts with an error. This also means that you can rely on the order of the emitted `JsonChunk` objects to be valid (for example, when a `JsonChunkType.STRING_CHUNK` object is emitted, you can be sure that it was preceded b a `JsonChunkType.STRING_START` object).

### `JsonStringifier`

A `TransformStream<JsonChunk, string>` that converts a stream of [`JsonChunk` objects](#jsonchunk-objects) into a stringified JSON stream. The reverse of [`JsonParser`](#jsonparser).

Construct one using `new JsonStringifier(writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<string>)` and use it by calling [`.pipeThrough()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) on a `ReadableStream<JsonChunk>`.

Use it in combination with [`JsonSerializer`](#jsonserializer) to generate JSON streams or use the [`JsonChunk` creators](#jsonchunk-creators) if you need manual control over the structure of the generated JSON document.

Under the hood, this stream simply emits the `rawValue` properties of the incoming `JsonChunk` objects. This means that the stream does not perform any validation of the structure of incoming objects. If you pass in `JsonChunk` objects in an invalid order, the output may be invalid JSON.

### `JsonDeserializer`

A `TransformStream<JsonChunk, { value: JsonValue; path?: Array<string | number> }>` that consumes one or more JSON values in the form of `JsonChunk` objects and converts them into JavaScript values (`JsonValue` includes all JSON-stringifiable types: objects, arrays, strings, numbers, booleans or null).

Construct it using `new JsonDeserializer(writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<string>)` and use it by calling [`.pipeThrough()`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) on a `ReadableStream<JsonChunk>`.

Usually this is used on a stream created by [`JsonParser`](#jsonparser) and piped through [`PathSelector`](#pathselector) to consume a JSON stream.

Note that the stream does not check the validity of the incoming `JsonChunk` objects. If you pass in chunks in an order that does not make sense, the stream will produce unpredictable output.

### `JsonSerializer`

A `ReadableStream<JsonChunk>` that emits the `JsonChunk` objects for a JSON value that it is initialized with. In a way this is the reverse of [`JsonDeserializer`](#jsondeserializer), but only for a single JSON document.

Construct it using `new JsonSerializer(value: SerializableJsonValue, space?: string | number, strategy?: QueuingStrategy<JsonChunk>)`. It is often [piped through](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/pipeThrough) [`JsonStringifier`](#jsonstringifier) to generate a stringified JSON stream.

The `SerializableJsonValue` can be any valid JSON value, that is `Record<string, JsonValue> | Array<JsonValue> | string | number | boolean | null`. In addition, for async support, any value anywhere in the JSON document can also be a `Promise<JsonValue>` or a `() => JsonValue | Promise<JsonValue>` callback instead. For streaming support, any object in the JSON document can be an object stream created by `objectStream()`, any array can be an array stream created by `arrayStream()` and any string (including property keys) can be a string stream created by `stringStream()` (for these, see [stream generators](#stream-generators)). Callbacks or promises returning these streams are also supported.

As `space`, you can specify a number of indentation spaces or an indentation string, equivalent to the [space](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#space) parameter of `JSON.stringify()`. This will cause `WHITESPACE` chunks to be emitted in the appropriate places.

#### Stream generators

To support streaming objects, arrays and strings in `JsonSerializer`, some helper functions are provided. Each of these accept an `AnyIterable<T> = Iterable<T> | AsyncIterable<T> | ReadableStream<T>` argument, so you can provide the data stream in the form of an iterator or a stream.

`objectStream(stream: AnyIterable<[key: string | StringStream, value: SerializableJsonValue]>` returns a stream of object properties in the form of `[key, value]` tuples. Nested streams are supported anywhere in the value, and the key can also be a string stream returned by `stringStream()`.

`arrayStream(stream: AnyIterable<SerializableJsonValue>)` returns a stream of array entries. Nested streams are supported anywhere in the entries.

`stringStream(stream: AnyIterable<string>)` returns a string stream. The data source should emit string chunks.

#### Troubleshooting: `Index signature for type 'string' is missing in type`

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

### `PathSelector`

A `TransformStream<JsonChunk, JsonChunk & { path: ReadonlyArray<string | number> }>` that keeps track of the hierarchy of objects and arrays of the incoming chunks, assigns a path to each chunk and filters out the ones that don’t match the provided path selector.

The path is provided using an array of strings and numbers, where strings are object property keys and numbers are array item indexes. For example, in the JSON document `{ "key1": "value1", "key2": ["value2", "value3"] }`, the chunks of the parts `{ "key1":`, `, "key2":` and `}` would have a path `[]`, the chunks of the part ` "value1"` would have the path `["key1"]`, the chunks of the parts ` [`, `,` and `] ` would have the path `["key2"]`, the chunks of `"value2"` would have the path `["key2", 0]` and `"value3"` would have `["key2", 1]`. In other words, for objects the chunks between `:` and `,`/`}` receive a property key in the path, and for arrays the chunks between `[` and `]` except `,` receive an item index.

`PathSelector` can be constructed using `new PathSelector(selector: Array<string | number | undefined> | ((path: JsonChunkPath) => boolean), writableStrategy?: QueuingStrategy<JsonChunk>, readableStrategy?: QueuingStrategy<JsonChunkWithPath>)`. If you specify the selector as an array, it will match any values with this path. `undefined` in the selector array will act as a wildcard that matches any key. Alternatively, you can specify a selector function to have more control. Note that once a selector matches a path, it will also match all sub paths of the matched value.

The `JsonChunk` stream emitted by `PathSelector` is different from other `JsonChunk` streams in the fact that it may emit multiple JSON values on the root level. Typically, the stream is piped through [`JsonDeserializer`](#jsondeserializer) to convert it into actual JavaScript values.

### `JsonChunk` creators

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

## Acknowledgements

This library is inspired by [creationix/jsonparse](https://github.com/creationix/jsonparse) by Tim Caswell and [dominictarr/JSONStream](https://github.com/dominictarr/JSONStream) by Dominic Tarr.