import type { JsonChunkWithPath, JsonPath } from "./json-path-detector";
import { AbstractTransformStream, arrayStartsWith } from "./utils";

export type JsonStreamWithPath = ReadableStream<JsonChunkWithPath> & {
	path: JsonPath;
};

/**
 * Splits up the incoming ReadableStream<JsonChunkWithPath> as emitted by JsonPathSelector and emits a nested
 * ReadableStream<JsonChunkWithPath> for each JSON document in the stream. Each emitted nested stream gets
 * a "path" property that contains the path of the document as selected by JsonPathSelector. The individual
 * JSON chunks of the nested stream have the path prefix of their document removed, so that the nested
 * stream can be piped through the other transformers (such as JsonPathSelector or JsonDeserializer) as if
 * it contained an independent JSON document.
 */
export class JsonPathStreamSplitter extends AbstractTransformStream<JsonChunkWithPath, JsonStreamWithPath> {
	protected currentNestedStream: {
		writer: WritableStreamDefaultWriter<JsonChunkWithPath>;
		path: JsonPath;
	} | undefined = undefined;

	constructor(writableStrategy?: QueuingStrategy<JsonChunkWithPath>, readableStrategy?: QueuingStrategy<JsonStreamWithPath>) {
		super(writableStrategy, readableStrategy);
	}

	protected startNestedStream(path: JsonPath, controller: TransformStreamDefaultController<JsonStreamWithPath>) {
		if (this.currentNestedStream) {
			throw new Error("Nested stream is already started.");
		}
		const stream = new TransformStream<JsonChunkWithPath, JsonChunkWithPath>();
		this.currentNestedStream = {
			writer: stream.writable.getWriter(),
			path
		};
		controller.enqueue(Object.assign(stream.readable, { path }));
	}

	protected endNestedStream() {
		if (!this.currentNestedStream) {
			throw new Error("Nested stream is not started.");
		}

		this.currentNestedStream.writer.close();
		this.currentNestedStream = undefined;
	}

	protected override async transform(chunk: JsonChunkWithPath, controller: TransformStreamDefaultController<JsonStreamWithPath>): Promise<void> {
		if (this.currentNestedStream && !arrayStartsWith(chunk.path, this.currentNestedStream.path)) {
			this.endNestedStream();
		}

		if (!this.currentNestedStream) {
			this.startNestedStream(chunk.path, controller);
		}

		this.currentNestedStream!.writer.write({
			...chunk,
			path: chunk.path.slice(this.currentNestedStream!.path.length)
		});
	}

	protected override flush(controller: TransformStreamDefaultController<JsonStreamWithPath>) {
		if (this.currentNestedStream) {
			this.currentNestedStream.writer.close();
		}

		super.flush(controller);
	}

	protected override abort(reason: any, controller: TransformStreamDefaultController<JsonStreamWithPath>) {
		if (this.currentNestedStream) {
			this.currentNestedStream.writer.abort(reason);
		}

		super.abort(reason, controller);
	}
}