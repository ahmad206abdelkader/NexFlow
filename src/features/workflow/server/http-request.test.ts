import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeHttpRequest } from "./http-request";

const HTTPBINGO = "https://httpbingo.org";

type HttpBingoResponse = {
  args: Record<string, string[]>;
  data: string;
  headers: Record<string, string[]>;
  json: unknown;
  method: string;
};

const echoData = (data: unknown) => data as HttpBingoResponse;

describe("executeHttpRequest with HTTPBingo", () => {
  it("executes GET with headers, authorization, and query parameters while ignoring its body", async () => {
    const result = await executeHttpRequest("get-node", {
      endpoint: `${HTTPBINGO}/anything?existing=yes`,
      method: "GET",
      headers: { "x-workflow-test": "get" },
      authorization: "Bearer workflow-token",
      queryParameters: {
        added: "value",
        repeated: ["first", "second"],
      },
      body: '{"must":"be ignored"}',
      rawBody: "this body must be ignored",
      timeout: 15_000,
    });
    const echo = echoData(result.data);

    assert.equal(result.status, 200);
    assert.equal(result.statusCode, 200);
    assert.equal(typeof result.statusText, "string");
    assert.match(result.headers["content-type"], /application\/json/);
    assert.equal(echo.method, "GET");
    assert.equal(echo.data, "");
    assert.deepEqual(echo.args.existing, ["yes"]);
    assert.deepEqual(echo.args.added, ["value"]);
    assert.deepEqual(echo.args.repeated, ["first", "second"]);
    assert.deepEqual(echo.headers.Authorization, ["Bearer workflow-token"]);
    assert.deepEqual(echo.headers["X-Workflow-Test"], ["get"]);
  });

  it("executes POST with an automatically serialized JSON body", async () => {
    const result = await executeHttpRequest("post-node", {
      endpoint: `${HTTPBINGO}/anything`,
      method: "POST",
      body: '{"action":"create","enabled":true}',
    });
    const echo = echoData(result.data);

    assert.equal(echo.method, "POST");
    assert.deepEqual(echo.json, { action: "create", enabled: true });
    assert.deepEqual(echo.headers["Content-Type"], ["application/json"]);
  });

  it("executes PUT with an automatically serialized JSON body", async () => {
    const result = await executeHttpRequest("put-node", {
      endpoint: `${HTTPBINGO}/anything`,
      method: "PUT",
      body: '{"replacement":"complete"}',
    });
    const echo = echoData(result.data);

    assert.equal(echo.method, "PUT");
    assert.deepEqual(echo.json, { replacement: "complete" });
    assert.deepEqual(echo.headers["Content-Type"], ["application/json"]);
  });

  it("executes PATCH with a JSON body from the existing body field", async () => {
    const result = await executeHttpRequest("patch-node", {
      endpoint: `${HTTPBINGO}/anything`,
      method: "PATCH",
      body: '{"field":"updated"}',
    });
    const echo = echoData(result.data);

    assert.equal(echo.method, "PATCH");
    assert.deepEqual(echo.json, { field: "updated" });
  });

  it("executes DELETE with a JSON body", async () => {
    const result = await executeHttpRequest("delete-body-node", {
      endpoint: `${HTTPBINGO}/anything`,
      method: "DELETE",
      body: '{"id":"resource-1"}',
    });
    const echo = echoData(result.data);

    assert.equal(echo.method, "DELETE");
    assert.deepEqual(echo.json, { id: "resource-1" });
  });

  it("ignores deprecated body configuration fields", async () => {
    const result = await executeHttpRequest("deprecated-config-node", {
      endpoint: `${HTTPBINGO}/anything`,
      method: "POST",
      body: '{"current":"json"}',
      bodyType: "multipart",
      bodyFields: [{ id: "old", key: "old", value: "field" }],
      contentType: "text/plain",
      rawBody: "old raw body",
    });
    const echo = echoData(result.data);

    assert.deepEqual(echo.json, { current: "json" });
    assert.deepEqual(echo.headers["Content-Type"], ["application/json"]);
  });

  it("executes DELETE without a body", async () => {
    const result = await executeHttpRequest("delete-empty-node", {
      endpoint: `${HTTPBINGO}/anything`,
      method: "DELETE",
    });
    const echo = echoData(result.data);

    assert.equal(echo.method, "DELETE");
    assert.equal(echo.data, "");
  });

  it("returns null body and data for a 204 response", async () => {
    const result = await executeHttpRequest("empty-response-node", {
      endpoint: `${HTTPBINGO}/status/204`,
      method: "GET",
    });

    assert.equal(result.status, 204);
    assert.equal(result.body, null);
    assert.equal(result.data, null);
  });

  it("includes status, status text, and response body in HTTP errors", async () => {
    await assert.rejects(
      executeHttpRequest("error-node", {
        endpoint: `${HTTPBINGO}/status/418`,
        method: "GET",
        retry: 0,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /status 418/i);
        assert.match(error.message, /(teapot|unknown status)/i);
        assert.match(error.message, /Response body: I'm a teapot!/i);
        return true;
      },
    );
  });

  it("reports malformed explicitly configured JSON without crashing", async () => {
    await assert.rejects(
      executeHttpRequest("invalid-json-node", {
        endpoint: `${HTTPBINGO}/anything`,
        method: "POST",
        body: "{not-json}",
      }),
      /HTTP Request node invalid-json-node contains malformed JSON\./,
    );
  });
});
