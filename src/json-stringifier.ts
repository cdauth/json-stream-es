import type { JsonChunk } from "./types";
import { AbstractTransformStream } from "./utils";

/**
 * Converts a stream of JsonChunks into a JSON string stream.
 */
export class JsonStringifier extends AbstractTransformStream<JsonChunk | { rawValue: string }, string> {
    protected override transform(chunk: JsonChunk | { rawValue: string }, controller: TransformStreamDefaultController<string>) {
        controller.enqueue(chunk.rawValue);
    }

    protected override flush(controller: TransformStreamDefaultController<string>) {
        controller.terminate();
    }
}