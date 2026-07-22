import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { TRPCError } from "@trpc/server";
import { HTTPError, type Options, TimeoutError } from "ky";
import type { Prisma } from "@/generated/prisma";
import { workflowHttpClient } from "@/lib/workflow-http-client";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const METHODS_WITHOUT_BODY = new Set<HttpMethod>(["GET"]);
const MAX_TIMEOUT = 2_147_483_647;
const MAX_EXPLICIT_RETRIES = 10;

type HttpMethod = (typeof HTTP_METHODS)[number];
type UnknownRecord = Record<string, unknown>;

type KeyValueEntry = {
  key: string;
  value: string;
};

export type HttpRequestData = {
  endpoint?: unknown;
  method?: unknown;
  headers?: unknown;
  queryParameters?: unknown;
  queryParams?: unknown;
  body?: unknown;
  jsonBody?: unknown;
  authorization?: unknown;
  timeout?: unknown;
  retry?: unknown;
};

export type HttpRequestNodeResult = {
  status: number;
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | null;
  body: string | null;
  data: Prisma.JsonValue | null;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: UnknownRecord, key: string) => Object.hasOwn(value, key);

const serializeKeyValueEntry = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  if (
    value === null ||
    ["number", "boolean"].includes(typeof value) ||
    Array.isArray(value) ||
    isRecord(value)
  ) {
    return JSON.stringify(value);
  }

  return undefined;
};

const parseKeyValueEntries = (
  nodeId: string,
  value: unknown,
  fieldLabel: string,
): KeyValueEntry[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!isRecord(entry)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `HTTP Request node ${nodeId} has invalid ${fieldLabel}.`,
        });
      }

      const key = entry.key;
      const entryValue = serializeKeyValueEntry(entry.value);

      if (typeof key !== "string" || entryValue === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `HTTP Request node ${nodeId} has invalid ${fieldLabel}.`,
        });
      }

      if (!key.trim()) {
        return [];
      }

      return [{ key: key.trim(), value: entryValue }];
    });
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, entryValue]) => {
      const values = Array.isArray(entryValue) ? entryValue : [entryValue];

      return values.map((item) => {
        if (
          item !== null &&
          !["string", "number", "boolean"].includes(typeof item)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `HTTP Request node ${nodeId} has invalid ${fieldLabel}.`,
          });
        }

        return { key, value: item === null ? "null" : String(item) };
      });
    });
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `HTTP Request node ${nodeId} has invalid ${fieldLabel}.`,
  });
};

const isPrivateIpv4 = (address: string) => {
  const [first, second] = address.split(".").map(Number);

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase();

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) === 4 && isPrivateIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
};

const assertPublicHttpUrl = async (endpoint: string) => {
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HTTP Request node has an invalid URL.",
    });
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HTTP Request URLs must use a public HTTP or HTTPS address.",
    });
  }

  let addresses: LookupAddress[];

  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The HTTP Request hostname could not be resolved.",
    });
  }

  const hasUnsafeAddress = addresses.some(({ address, family }) =>
    family === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address),
  );

  if (addresses.length === 0 || hasUnsafeAddress) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "HTTP Request URLs cannot target private network addresses.",
    });
  }

  return url;
};

const parseMethod = (nodeId: string, value: unknown): HttpMethod => {
  const method = typeof value === "string" ? value.toUpperCase() : "GET";

  if (!HTTP_METHODS.includes(method as HttpMethod)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} uses an unsupported method.`,
    });
  }

  return method as HttpMethod;
};

const parseHeaders = (nodeId: string, value: unknown) => {
  const headers = new Headers();

  for (const { key, value: headerValue } of parseKeyValueEntries(
    nodeId,
    value,
    "headers",
  )) {
    try {
      headers.set(key, headerValue);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `HTTP Request node ${nodeId} has an invalid header named "${key}".`,
      });
    }
  }

  return headers;
};

const addQueryParameters = (nodeId: string, url: URL, value: unknown) => {
  for (const { key, value: parameterValue } of parseKeyValueEntries(
    nodeId,
    value,
    "query parameters",
  )) {
    url.searchParams.append(key, parameterValue);
  }
};

const parseTimeout = (nodeId: string, value: unknown) => {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_TIMEOUT
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} has an invalid timeout.`,
    });
  }

  return value;
};

const parseRetry = (
  nodeId: string,
  method: HttpMethod,
  value: unknown,
): Options["retry"] => {
  if (value === undefined) {
    return method === "GET" ? undefined : { limit: 0 };
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_EXPLICIT_RETRIES
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} has an invalid retry count.`,
    });
  }

  return {
    limit: value,
    methods: [method.toLowerCase()],
  };
};

const parseJsonBody = (nodeId: string, value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as Prisma.JsonValue;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} contains malformed JSON.`,
    });
  }
};

const createBodyOptions = (
  nodeId: string,
  request: HttpRequestData,
  method: HttpMethod,
): Pick<Options, "json"> => {
  if (METHODS_WITHOUT_BODY.has(method)) {
    return {};
  }

  const requestRecord = request as UnknownRecord;
  const body = hasOwn(requestRecord, "body") ? request.body : request.jsonBody;

  if (body === undefined || body === null || body === "") {
    return {};
  }

  return { json: parseJsonBody(nodeId, body) };
};

const serializeErrorBody = (data: unknown) => {
  if (data === undefined || data === null || data === "") {
    return "";
  }

  const body = typeof data === "string" ? data : JSON.stringify(data);
  return body.length > 2_000 ? `${body.slice(0, 2_000)}…` : body;
};

const isJsonContentType = (contentType: string | null) =>
  contentType?.toLowerCase().includes("json") ?? false;

const parseResponseData = (
  nodeId: string,
  response: Response,
  body: string,
) => {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as Prisma.JsonValue;
  } catch {
    if (isJsonContentType(response.headers.get("content-type"))) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `HTTP Request node ${nodeId} received malformed JSON with status ${response.status} ${response.statusText}.`,
      });
    }

    return null;
  }
};

export const executeHttpRequest = async (
  nodeId: string,
  data: Prisma.JsonValue,
  idempotencyKey?: string,
): Promise<HttpRequestNodeResult> => {
  const request = (data ?? {}) as HttpRequestData;
  const endpoint =
    typeof request.endpoint === "string" ? request.endpoint.trim() : "";

  if (!endpoint) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} needs a URL before execution.`,
    });
  }

  const method = parseMethod(nodeId, request.method);
  const url = await assertPublicHttpUrl(endpoint);
  addQueryParameters(
    nodeId,
    url,
    request.queryParameters ?? request.queryParams,
  );

  const headers = parseHeaders(nodeId, request.headers);

  if (request.authorization !== undefined) {
    if (
      typeof request.authorization !== "string" ||
      request.authorization.trim().length === 0
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `HTTP Request node ${nodeId} has invalid authorization.`,
      });
    }

    try {
      headers.set("authorization", request.authorization);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `HTTP Request node ${nodeId} has invalid authorization.`,
      });
    }
  }

  if (idempotencyKey) {
    headers.set("idempotency-key", idempotencyKey);
  }

  const bodyOptions = createBodyOptions(nodeId, request, method);
  const timeout = parseTimeout(nodeId, request.timeout);
  const retry = parseRetry(nodeId, method, request.retry);

  let response: Response;

  try {
    response = await workflowHttpClient(url, {
      method,
      headers,
      ...bodyOptions,
      ...(timeout === undefined ? {} : { timeout }),
      ...(retry === undefined ? {} : { retry }),
    });
  } catch (error) {
    if (error instanceof HTTPError) {
      let responseBody = "";

      try {
        responseBody = serializeErrorBody(await error.response.clone().text());
      } catch {
        // The status details remain useful if the response body is unreadable.
      }

      const statusText = error.response.statusText || "Unknown Status";
      const bodySuffix = responseBody ? ` Response body: ${responseBody}` : "";

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `HTTP Request node ${nodeId} failed with status ${error.response.status} ${statusText}.${bodySuffix}`,
        cause: error,
      });
    }

    if (error instanceof TimeoutError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `HTTP Request node ${nodeId} timed out after ${timeout ?? 30_000}ms.`,
        cause: error,
      });
    }

    if (error instanceof TRPCError) {
      throw error;
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `HTTP Request node ${nodeId} could not complete.`,
      cause: error,
    });
  }

  const responseBody = await response.text();
  const parsedData = parseResponseData(nodeId, response, responseBody);
  const contentType = response.headers.get("content-type");

  return {
    status: response.status,
    statusCode: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    contentType,
    body: parsedData === null ? responseBody || null : null,
    data: parsedData,
  };
};
