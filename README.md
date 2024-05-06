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

In its most basic form, [`JsonSerializer`](#jsonserializer) can be combined with [`JsonStringifier`](#jsonstringifier) to create a stringified JSON stream:

```typescript
import { JsonSerializer, JsonStringifier } from "json-stream-es";

const jsonStream = new JsonSerializer({
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
}).pipeThrough(new JsonStringifier());
```

Like this, there is not much point yet in streaming the result, as the object is available synchronously. Things get interesting when we use the `objectStream()`, `arrayStream()` and `stringStream()` [stream generators](#stream-generators) and callbacks and promises to generate some values asynchronously:

```typescript
import { JsonSerializer, JsonStringifier, objectStream, arrayStream, stringStream } from "json-stream-es";

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

const jsonStream = new JsonSerializer({
	object: objectStream(generateObject()),
	array: () => arrayStream(generateArray()),
	numberValue: Promise.resolve(1.23),
	booleanValue: async () => true,
	nullValue: null
}).pipeThrough(new JsonStringifier());
```

Each value anywhere the JSON document can be a synchronous value, a promise that resolves to a value or a sync/async function returning a value. Each value can also be an object stream (created by `objectStream()`), an array stream (created by `arrayStream()`) or a string stream (created by `stringStream()`). String streams can also be used as property keys inside object streams. The stream creators accept an `Iterable`, an `AsyncIterable` or a `ReadableStream` data source.

The stringified JSON stream created by `JsonStringifier` is a `ReadableStream<string>`. Since most JavaScript methods work with `ReadableStream<Uint8Array>` instead, we can convert it using [`TextEncoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoderStream) (Node.js >= 18 required). Here is an example of streaming the result in an Express app:
```typescript
import { JsonSerializer, JsonStringifier, objectStream, arrayStream, stringStream } from "json-stream-es";
import { Writable } from "node:stream";

app.use("/api/test", (req, res) => {
	res.header("Content-type", "application/json");
	const jsonStream = new JsonSerializer({
		test: "value"
	}).pipeThrough(new JsonStringifier())
	jsonStream.pipeTo(Writable.toWeb(res));
});
```

### Consume a JSON stream

[`JsonParser`](#jsonparser) reads a stringified JSON stream into a stream of [`JsonChunk`s](#jsonchunk-objects), and [`JsonDeserializer`](#jsondeserializer) can be used to generate JSON objects from that. Since most JavaScript methods emit a `ReadableStream<Uint8Array>`, we can use [`TextDecoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoderStream) to convert that to a string stream (wide browser support since September 2022, so you might need a polyfill). Here is an example how to use it with the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API):

```typescript
import { JsonParser, JsonDeserializer } from "json-stream-es";

const res = await fetch("/api/test");
const stream = res
	.pipeThrough(new TextDecoderStream())
	.pipeThrough(new JsonParser())
	.pipeThrough(new JsonDeserializer());

const reader = stream.getReader();
while (true) {
	const { done, value } = await reader.read();
	if (done) {
		break;
	} else {
		console.log(value);
	}
}
```

`JsonDeserializer` reads the JSON chunks and emits a JSON value (an object/array/string/number/boolean/null) each time one has been completely received on the root level of the input stream. Since a JSON document only consists of one JSON value on the root level, in the above example `JsonDeserializer` would emit only one JSON value when the whole input stream has been received, so there is not much point yet in streaming the result.

Streams become useful when consuming values nested somewhere in the JSON document, for example in an array. [`PathFilter`](#pathfilter) can be used to pick out JSON values nested somewhere inside the JSON document:
```typescript
import { JsonParser, JsonDeserializer, PathEnrichter, PathFilter } from "json-stream-es";

// Our API endpoint returns:
// {"results":[{"test":"value1"},"value2"]}
const res = await fetch("/api/test");
const stream = res
	.pipeThrough(new TextDecoderStream())
	.pipeThrough(new JsonParser())
	.pipeThrough(new PathEnricher()) // Needed for PathFilter to work
	.pipeThrough(new PathFilter(["results", undefined]))
	.pipeThrough(new JsonDeserializer());

const reader = stream.getReader();
while (true) {
	const { done, value } = await reader.read();
	if (done) {
		break;
	} else {
		// Will run twice:
		// - { test: "value1" }
		// - "value2"
		console.log(value);
	}
}
```

`PathFilter` expects an array of strings, numbers and `undefined` values, where strings refer to object properties with the specified key, numbers refer to array items with the specified index and `undefined` refers to any object property or array items. In the above example, `["results", undefined]` refers to any value found in the array/object under the `results` property. We could also specify `["results", 1]` to pick only the second array item.

`PathFilter` can also be passed a function that receives the path of each JSON chunk in the form of an `Array<string | number>` and returns a boolean to indicate whether the chunk should be included. This not only allows you to pick very specific values from the stream, it also makes it possible to omit certain properties from the returned values.

## Architecture

At its core, json-stream-es handles 3 types of JSON documents:
* A `ReadableStream<string>` is a streamed stringified JSON document
* A `ReadableStream<JsonChunk>` is an internal representation of a JSON document, where each [`JsonChunk`](#jsonchunk-objects) represents a section of the document
* A `JsonValue` is a JavaScript value that can be stringified to JSON (in particular `{ [key: string]: JsonValue } | Array<JsonValue> | string | number | boolean | null`).

The main featurs of json-stream-es are:
* Provide converters to convert between the 3 types of JSON documents:
	* [`JsonParser`](#jsonparser) (`ReadableStream<string>` → `ReadableStream<JsonChunk>`)
	* [`JsonStringifier`](#jsonstringifier) (`ReadableStream<JsonChunk>` → `ReadableStream<string>`)
	* [`JsonDeserializer`](#jsondeserializer) (`ReadableStream<JsonChunk>` → `JsonValue`)
	* [`JsonSerializer`](#jsonserializer) (`JsonValue` → `ReadableStream<JsonChunk>`)
* Provide helpers to generate, analyze and modify a `ReadableStream<JsonChunk>`:
	* [`PathEnricher`](#pathenricher) to provide context to values nested in objects/arrays
	* [`PathFilter`](#pathfilter) to get values nested at a certain context.
	* [`JsonChunk` creators](#jsonchunk-creators)

### `JsonChunk` objects

A `JsonChunk` is an internal representation of a section of the JSON document that has a specific semantic meaning; The types of `JsonChunk` are:

| Type          | Description | Properties |
| -------------- | ----------- | ---------- |
| `WHITESPACE`   | Whitespace characters without any semantic meaning appearing between JSON tokens. | |
| `COMMA`        | A `,` that separates two array/object items. | |
| `COLON`        | A `:` that separates an object key from its value. | |
| `OBJECT_START`  | A `{` starting an object. | |
| `OBJECT_END`    | A `}` ending an object. | |
| `ARRAY_START`   | A `[` starting an array. | |
| `ARRAY_END`     | A `]` ending an array. | |
| `STRING_START`  | A `"` starting a string (this can be a value, or a key inside an object). | `role`: `StringRole.KEY` if this string is an object property key, otherwise `StringRole.VALUE`. |
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

### `JsonParser`

### `JsonStringifier`

### `JsonDeserializer`

### `JsonSerializer`

### `PathEnricher`

### `PathFilter`

### Stream generators

### `JsonChunk` creators

## Attribution

This library is inspired by [creationix/jsonparse](https://github.com/creationix/jsonparse) by Tim Caswell.