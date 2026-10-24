export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return fallback;
  }

  const response = error.response;
  if (typeof response !== "object" || response === null || !("data" in response)) {
    return fallback;
  }

  const data = response.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("detail" in data) ||
    typeof data.detail !== "string"
  ) {
    return fallback;
  }

  return data.detail;
};
