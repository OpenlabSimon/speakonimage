export interface ParsedApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  errorText: string | null;
}

export async function parseJsonResponse<T = unknown>(response: Response): Promise<ParsedApiResponse<T>> {
  const rawText = await response.text();

  if (!rawText) {
    return {
      ok: response.ok,
      status: response.status,
      data: null,
      errorText: null,
    };
  }

  try {
    return {
      ok: response.ok,
      status: response.status,
      data: JSON.parse(rawText) as T,
      errorText: null,
    };
  } catch {
    return {
      ok: response.ok,
      status: response.status,
      data: null,
      errorText: rawText,
    };
  }
}

export function getApiErrorMessage(
  parsed: ParsedApiResponse<{ success?: boolean; error?: string }>,
  fallback: string
): string {
  return (
    parsed.data?.error ||
    parsed.errorText ||
    `${fallback} (${parsed.status || 'unknown'})`
  );
}
