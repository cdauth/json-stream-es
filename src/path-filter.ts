import type { JsonChunkWithPath } from "./path-enricher";
import { AbstractTransformStream } from "./utils";

/**
 * A filter that can be set for a PathFilter stream.
 * If this is an array, the path has to start with the items in the array in order to match. Undefined items in the array match any key in the path.
 * If this is a function, it is called with the path and should return true if the path matches the filter.
 */
export type PathFilterExpression = Array<string | number | undefined> | ((path: ReadonlyArray<string | number>) => boolean);

export function matchesPathFilter(path: ReadonlyArray<string | number>, filter: PathFilterExpression): boolean {
	if (Array.isArray(filter)) {
		return filter.every((v, i) => (v === undefined ? path.length > i : path[i] === v));
	} else {
		return filter(path);
	}
}

/**
 * Only passes through the JsonChunks that match the given path filter.
 */
export class PathFilter<T extends JsonChunkWithPath> extends AbstractTransformStream<T, T> {
	constructor(protected filter: PathFilterExpression, writableStrategy?: QueuingStrategy<T>, readableStrategy?: QueuingStrategy<T>) {
		super(writableStrategy, readableStrategy);
	}

	protected override transform(chunk: T, controller: TransformStreamDefaultController<T>): void | Promise<void> {
		if (matchesPathFilter(chunk.path, this.filter)) {
			controller.enqueue(chunk);
		}
	}
}