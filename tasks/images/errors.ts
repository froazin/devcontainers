/** The error the image tasks throw for a failure the user can fix. */

/** A failure the user can fix, with a message ready to show. Any other error is a bug. */
export class ImageError extends Error {
  override name = "ImageError";
}

/** Returns an ImageError for a failed Docker Engine API call, with a hint to check Docker is running. */
export function dockerApiError(error: unknown): ImageError {
  const message = error instanceof Error ? error.message : String(error);
  return new ImageError(
    `The Docker API call failed: ${message}. Check that Docker is running, such as with \`docker info\`.`,
    { cause: error },
  );
}

/** Returns whether the error is a Docker API response with the HTTP status code. */
export function isDockerStatus(error: unknown, statusCode: number): boolean {
  return (error as { statusCode?: unknown } | null)?.statusCode === statusCode;
}

/** Returns the result of a Docker API call, throwing an ImageError with a hint if the call fails. */
export async function dockerCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw dockerApiError(error);
  }
}
