# json-stream-es

json-stream-es is a modern library that provides a streaming alternative to [`JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) and [`JSON.stringify()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). It is published as an EcmaScript Module (ESM) and uses the new [Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API) (in particular [`TransformStream`s](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream)), and thus should work in the browser, in Node.js and in any other modern JavaScript environment.

When implementing a web service in the backend (for example a REST API), streaming JSON has the advantage that the data arrives to the user faster (because the web service doesn’t have to wait for all data to be loaded from the database before it can start sending it), and that memory consumption is greatly reduced (because the service only needs to keep small chunks of the data in memory before passing it on to the user).

When consuming a web service from the frontend, streaming JSON has the advantage that you can display the partial data as it loads, and that memory consumption is reduced if you only intend to consume parts of the retrieved data.

## `JsonChunk` objects

At its core, json-stream-es is a library that provides helpers to convert `ReadableStream<string>` to and from a `ReadableStream<JsonChunk>`. A `JsonChunk` is an internal representation of a section of the JSON document that has a specific semantic meaning; The types of `JsonChunk` are:

| Class name     | Description | Properties |
| -------------- | ----------- | ---------- |
| `Whitespace`   | Whitespace characters without any semantic meaning appearing between JSON tokens. | |
| `Comma`        | A `,` that separates two array/object items. | |
| `Colon`        | A `:` that separates an object key from its value. | |
| `ObjectStart`  | A `{` starting an object. | |
| `ObjectEnd`    | A `}` ending an object. | |
| `ArrayStart`   | A `[` starting an array. | |
| `ArrayEnd`     | A `]` ending an array. | |
| `StringStart`  | A `"` starting a string (this can be a value, or a key inside an object). | |
| `StringChunk`  | A part of a string. | `value`: The part of the string. | |
| `StringEnd`    | A `"` ending a string. | |
| `NumberValue`  | A number value. | `value`: The number. | |
| `BooleanValue` | A boolean value. | `value`: The boolean value. | |
| `NullValue`    | A `null` value. | |

In addition to the properties outlined above, each `JsonChunk` has a `rawValue` property that represents the string as the chunk appeared in the document. This means that the `rawValues` of all the chunks concatenated are equal to the stringified JSON document.

For example, take the following JSON document:
```json
{
	"string": "Test \u2665",
	"number": -1.23e2
}
```

This document would be represented by the following `JsonChunks`:
```json
{ type: "ObjectStart", rawValue: "{" }
{ type: "Whitespace", rawValue: "\n\t" }
{ type: "StringStart", rawValue: "\"" }
{ type: "StringChunk", value: "string", rawValue: "string" }
{ type: "StringEnd", rawValue: "\"" }
{ type: "Colon": rawValue: ":" }
{ type: "Whitepsace", rawValue: " " }
{ type: "StringStart", rawValue: "\"" }
{ type: "StringChunk", value: "Test ♥", rawValue: "Test \\u2665" }
{ type: "StringEnd", rawValue: "\"" }
{ type: "Comma", rawValue: "," }
{ type: "Whitespace", rawValue: "\n\t" }
{ type: "StringStart", rawValue: "\"" }
{ type: "StringChunk", value: "number", rawValue: "number" }
{ type: "StringEnd", rawValue: "\"" }
{ type: "Colon": rawValue: ":" }
{ type: "Whitespace", rawValue: " " }
{ type: "NumberValue", value: -123, rawValue: "-1.23e2" }
{ type: "Whitespace", rawValue: "\n" }
{ type: "ObjectEnd", rawValue: "}" }
```

The functions exported by json-stream-es are based on these `JsonChunk` objects, and you can also write your own custom functions that consume these objects.