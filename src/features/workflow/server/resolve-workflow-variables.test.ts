import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveWorkflowVariables,
  TemplateResolutionError,
  type TemplateVariableSource,
} from "./resolve-workflow-variables";

const getUserSource: TemplateVariableSource = {
  nodeId: "get-user-node",
  nodeName: "HTTP_REQUIST",
  variableName: "getUser",
  result: {
    status: 200,
    statusText: "OK",
    headers: {},
    body: null,
    data: {
      id: 15,
      name: "Ahmad",
      email: "ahmad@example.com",
      active: true,
      profile: { role: "admin" },
      roles: ["admin", "editor"],
    },
  },
};

const resolve = (
  data: Parameters<typeof resolveWorkflowVariables>[1],
  sources: TemplateVariableSource[] = [getUserSource],
  options: Parameters<typeof resolveWorkflowVariables>[3] = {},
) =>
  resolveWorkflowVariables("dependent-node", data, sources, {
    nodeName: "HTTP_REQUIST",
    executionId: "execution-1",
    variableDefinitions: sources,
    ...options,
  });

const assertTemplateError = (
  callback: () => unknown,
  code: TemplateResolutionError["code"],
) => {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof TemplateResolutionError);
    assert.equal(error.code, code);
    assert.equal(error.details.nodeId, "dependent-node");
    assert.equal(error.details.executionId, "execution-1");
    return true;
  });
};

describe("resolveWorkflowVariables", () => {
  it("leaves static endpoint text unchanged", () => {
    assert.deepEqual(
      resolve({ endpoint: "https://api.example.com/users/15" }),
      {
        endpoint: "https://api.example.com/users/15",
      },
    );
  });

  it("resolves a dynamic endpoint", () => {
    assert.deepEqual(
      resolve(
        { endpoint: "https://api.example.com/users/{{ getUser.data.id }}" },
        [getUserSource],
        { urlFields: ["endpoint"] },
      ),
      { endpoint: "https://api.example.com/users/15" },
    );
  });

  it("resolves multiple variables inside an endpoint", () => {
    assert.deepEqual(
      resolve(
        {
          endpoint:
            "https://api.example.com/{{getUser.data.id}}/{{tenant.data.slug}}",
        },
        [
          getUserSource,
          {
            nodeId: "tenant-node",
            variableName: "tenant",
            result: { data: { slug: "nexflow" } },
          },
        ],
      ),
      { endpoint: "https://api.example.com/15/nexflow" },
    );
  });

  it("resolves nested object properties safely", () => {
    assert.equal(resolve("{{getUser.data.profile.role}}"), "admin");
  });

  it("preserves number, boolean, object, array, and null full-value types", () => {
    const nullSource: TemplateVariableSource = {
      nodeId: "null-node",
      variableName: "empty",
      result: { data: null },
    };

    assert.deepEqual(
      resolve(
        {
          id: "{{getUser.data.id}}",
          active: "{{getUser.data.active}}",
          profile: "{{getUser.data.profile}}",
          roles: "{{getUser.data.roles}}",
          empty: "{{empty.data}}",
        },
        [getUserSource, nullSource],
      ),
      {
        id: 15,
        active: true,
        profile: { role: "admin" },
        roles: ["admin", "editor"],
        empty: null,
      },
    );
  });

  it("converts resolved values to text during string interpolation", () => {
    assert.equal(
      resolve("User {{getUser.data.id}} is {{getUser.data.active}}"),
      "User 15 is true",
    );
  });

  it("parses and resolves JSON bodies recursively without corrupting native types", () => {
    assert.deepEqual(
      resolve(
        {
          body: JSON.stringify({
            userId: "{{getUser.data.id}}",
            name: "{{getUser.data.name}}",
            active: "{{getUser.data.active}}",
            profile: "{{getUser.data.profile}}",
            message: "Hello {{getUser.data.name}}",
            nested: [{ roles: "{{getUser.data.roles}}" }],
          }),
        },
        [getUserSource],
        { jsonStringFields: ["body"] },
      ),
      {
        body: {
          userId: 15,
          name: "Ahmad",
          active: true,
          profile: { role: "admin" },
          message: "Hello Ahmad",
          nested: [{ roles: ["admin", "editor"] }],
        },
      },
    );
  });

  it("reports a missing variable", () => {
    assertTemplateError(
      () => resolve("{{missing.data}}", [], { variableDefinitions: [] }),
      "TEMPLATE_VARIABLE_NOT_FOUND",
    );
  });

  it("reports a known variable that is not available upstream", () => {
    assertTemplateError(
      () =>
        resolve("{{future.data}}", [], {
          variableDefinitions: [
            { nodeId: "future-node", variableName: "future" },
          ],
        }),
      "TEMPLATE_VARIABLE_NOT_AVAILABLE",
    );
  });

  it("reports a missing nested property", () => {
    assertTemplateError(
      () => resolve("{{getUser.data.missing}}"),
      "TEMPLATE_PROPERTY_NOT_FOUND",
    );
  });

  it("blocks prototype-related property access", () => {
    for (const property of ["__proto__", "prototype", "constructor"]) {
      assertTemplateError(
        () => resolve(`{{getUser.data.${property}}}`),
        "TEMPLATE_FORBIDDEN_PROPERTY",
      );
    }
  });

  it("reports malformed expressions", () => {
    for (const value of ["{{getUser..data}}", "{{getUser.data", "{{ }}"]) {
      assertTemplateError(() => resolve(value), "TEMPLATE_INVALID_EXPRESSION");
    }
  });

  it("reports malformed configured JSON bodies", () => {
    assertTemplateError(
      () =>
        resolve({ body: '{"id":"{{getUser.data.id}}"' }, [getUserSource], {
          jsonStringFields: ["body"],
        }),
      "TEMPLATE_BODY_INVALID",
    );
  });

  it("validates the URL after template resolution", () => {
    assertTemplateError(
      () =>
        resolve({ endpoint: "{{getUser.data.profile}}" }, [getUserSource], {
          urlFields: ["endpoint"],
        }),
      "TEMPLATE_RESOLVED_URL_INVALID",
    );
  });
});
