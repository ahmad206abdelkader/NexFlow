export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type KeyValueEntry = {
  id: string;
  key: string;
  value: string;
};

export type HttpRequestNodeData = {
  variableName?: string;
  endpoint?: string;
  method?: HttpMethod;
  queryParameters?: KeyValueEntry[];
  headers?: KeyValueEntry[];
  body?: string;
  timeout?: number;
  [key: string]: unknown;
};
