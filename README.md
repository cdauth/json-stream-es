# json-stream-es

json-stream-es is a modern library that provides a streaming alternative to [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) and [`JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). It is published as an EcmaScript Module (ESM) and uses the new [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) (in particular [`TransformStream`s](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream)), and thus should work in the browser, in Node.js and in any other modern JavaScript environment.

When implementing a web service in the backend (for example a REST API), streaming JSON has the advantage that the data arrives to the user faster (because the web service doesn’t have to wait for all data to be loaded from the database before it can start sending it), and that memory consumption is greatly reduced (because the service only needs to keep small chunks of the data in memory before passing it on to the user).

When consuming a web service from the frontend, streaming JSON has the advantage that you can display the partial data as it loads, and that memory consumption is reduced if you only intend to consume parts of the retrieved data.

## Usage

### Generate a JSON stream

### Consume a JSON stream

## Architecture

At its core, json-stream-es handles 3 types of JSON documents:
* A `ReadableStream<string>` is a streamed stringified JSON document
* A `ReadableStream<JsonChunk>` is an internal representation of a JSON document, where each [`JsonChunk`](#jsonchunk-objects) represents a section of the document
* A `JsonValue` is a JavaScript value that can be stringified to JSON (in particular `Record<string, JsonValue> | Array<JsonValue> | string | number | boolean | null`, but represented as `any` in the code base because TypeScript doesn’t allow circular references).

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

### `JsonChunk` creators

## Attribution

This library is inspired by [creationix/jsonparse](https://github.com/creationix/jsonparse) by Tim Caswell.