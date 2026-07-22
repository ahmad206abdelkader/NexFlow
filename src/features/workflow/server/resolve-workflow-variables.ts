import type { Prisma } from "@/generated/prisma";

export const TEMPLATE_ERROR_CODES = [
  "TEMPLATE_VARIABLE_NOT_FOUND",
  "TEMPLATE_PROPERTY_NOT_FOUND",
  "TEMPLATE_INVALID_EXPRESSION",
  "TEMPLATE_VARIABLE_NOT_AVAILABLE",
  "TEMPLATE_FORBIDDEN_PROPERTY",
  "TEMPLATE_RESOLVED_URL_INVALID",
  "TEMPLATE_BODY_INVALID",
] as const;

export type TemplateErrorCode = (typeof TEMPLATE_ERROR_CODES)[number];

export type TemplateVariableSource = {
  nodeId: string;
  nodeName?: string;
  variableName?: string;
  result: Record<string, Prisma.JsonValue>;
};

export type TemplateVariableDefinition = {
  nodeId: string;
  nodeName?: string;
  variableName?: string;
};

export type TemplateErrorDetails = {
  code: TemplateErrorCode;
  message: string;
  nodeId: string;
  nodeName?: string;
  variableName?: string;
  expression?: string;
  propertyPath?: string;
  executionId?: string;
};

type TemplateResolverOptions = {
  nodeName?: string;
  executionId?: string;
  variableDefinitions?: ReadonlyArray<TemplateVariableDefinition>;
  jsonStringFields?: readonly string[];
  urlFields?: readonly string[];
};

type ResolverContext = {
  nodeId: string;
  nodeName?: string;
  executionId?: string;
  availableVariables: ReadonlyMap<string, Prisma.JsonValue>;
  knownVariables: ReadonlyMap<string, TemplateVariableDefinition>;
};

const TEMPLATE_TOKEN_PATTERN = /\{\{([\s\S]*?)\}\}/g;
const EXPRESSION_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|\d+))*$/;
const FORBIDDEN_PROPERTIES = new Set(["__proto__", "prototype", "constructor"]);

export class TemplateResolutionError extends Error {
  readonly code: TemplateErrorCode;
  readonly details: TemplateErrorDetails;

  constructor(details: TemplateErrorDetails) {
    super(details.message);
    this.name = "TemplateResolutionError";
    this.code = details.code;
    this.details = details;
  }
}

const createTemplateError = (
  context: Pick<ResolverContext, "nodeId" | "nodeName" | "executionId">,
  details: Omit<
    TemplateErrorDetails,
    "code" | "message" | "nodeId" | "nodeName" | "executionId"
  > & {
    code: TemplateErrorCode;
    message: string;
  },
) =>
  new TemplateResolutionError({
    ...details,
    nodeId: context.nodeId,
    ...(context.nodeName ? { nodeName: context.nodeName } : {}),
    ...(context.executionId ? { executionId: context.executionId } : {}),
  });

const parseExpression = (expression: string, context: ResolverContext) => {
  const trimmedExpression = expression.trim();

  if (!EXPRESSION_PATTERN.test(trimmedExpression)) {
    throw createTemplateError(context, {
      code: "TEMPLATE_INVALID_EXPRESSION",
      message: `Template expression "{{${trimmedExpression}}}" is malformed.`,
      expression: trimmedExpression,
    });
  }

  const [variableName, ...propertySegments] = trimmedExpression.split(".");
  const forbiddenProperty = propertySegments.find((segment) =>
    FORBIDDEN_PROPERTIES.has(segment),
  );

  if (forbiddenProperty) {
    throw createTemplateError(context, {
      code: "TEMPLATE_FORBIDDEN_PROPERTY",
      message: `Template expression "{{${trimmedExpression}}}" cannot access forbidden property "${forbiddenProperty}".`,
      variableName,
      expression: trimmedExpression,
      propertyPath: propertySegments.join("."),
    });
  }

  return { expression: trimmedExpression, variableName, propertySegments };
};

const resolveExpression = (expression: string, context: ResolverContext) => {
  const parsed = parseExpression(expression, context);
  const source = context.availableVariables.get(parsed.variableName);

  if (source === undefined) {
    const knownDefinition = context.knownVariables.get(parsed.variableName);

    if (knownDefinition) {
      throw createTemplateError(context, {
        code: "TEMPLATE_VARIABLE_NOT_AVAILABLE",
        message: `Variable "${parsed.variableName}" is not available for this node. Make sure the referenced node executes earlier in the workflow.`,
        variableName: parsed.variableName,
        expression: parsed.expression,
        propertyPath: parsed.propertySegments.join(".") || undefined,
      });
    }

    throw createTemplateError(context, {
      code: "TEMPLATE_VARIABLE_NOT_FOUND",
      message: `Variable "${parsed.variableName}" does not exist in this workflow.`,
      variableName: parsed.variableName,
      expression: parsed.expression,
      propertyPath: parsed.propertySegments.join(".") || undefined,
    });
  }

  let current: Prisma.JsonValue = source;

  for (const segment of parsed.propertySegments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) {
        throw createTemplateError(context, {
          code: "TEMPLATE_PROPERTY_NOT_FOUND",
          message: `Property path "${parsed.propertySegments.join(".")}" does not exist on variable "${parsed.variableName}".`,
          variableName: parsed.variableName,
          expression: parsed.expression,
          propertyPath: parsed.propertySegments.join("."),
        });
      }

      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index >= current.length) {
        throw createTemplateError(context, {
          code: "TEMPLATE_PROPERTY_NOT_FOUND",
          message: `Property path "${parsed.propertySegments.join(".")}" does not exist on variable "${parsed.variableName}".`,
          variableName: parsed.variableName,
          expression: parsed.expression,
          propertyPath: parsed.propertySegments.join("."),
        });
      }

      current = current[index] ?? null;
      continue;
    }

    if (
      typeof current !== "object" ||
      current === null ||
      !Object.hasOwn(current, segment) ||
      current[segment] === undefined
    ) {
      throw createTemplateError(context, {
        code: "TEMPLATE_PROPERTY_NOT_FOUND",
        message: `Property path "${parsed.propertySegments.join(".")}" does not exist on variable "${parsed.variableName}".`,
        variableName: parsed.variableName,
        expression: parsed.expression,
        propertyPath: parsed.propertySegments.join("."),
      });
    }

    current = current[segment] ?? null;
  }

  return current;
};

const stringifyInterpolatedValue = (value: Prisma.JsonValue) =>
  typeof value === "string" ? value : JSON.stringify(value);

const resolveTemplateString = (value: string, context: ResolverContext) => {
  if (!value.includes("{{") && !value.includes("}}")) {
    return value;
  }

  const matches = [...value.matchAll(TEMPLATE_TOKEN_PATTERN)];
  const unmatchedTemplateText = value.replace(TEMPLATE_TOKEN_PATTERN, "");

  if (
    matches.length === 0 ||
    unmatchedTemplateText.includes("{{") ||
    unmatchedTemplateText.includes("}}")
  ) {
    throw createTemplateError(context, {
      code: "TEMPLATE_INVALID_EXPRESSION",
      message: "Template expression is malformed.",
      expression: value,
    });
  }

  if (matches.length === 1 && value.trim() === matches[0][0]) {
    return resolveExpression(matches[0][1], context);
  }

  return value.replace(TEMPLATE_TOKEN_PATTERN, (_match, expression: string) =>
    stringifyInterpolatedValue(resolveExpression(expression, context)),
  );
};

const resolveTemplateValue = (
  value: Prisma.JsonValue,
  context: ResolverContext,
): Prisma.JsonValue => {
  if (typeof value === "string") {
    return resolveTemplateString(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateValue(entry, context));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined
          ? []
          : [[key, resolveTemplateValue(entry, context)]],
      ),
    );
  }

  return value;
};

const buildKnownVariables = (
  definitions: ReadonlyArray<TemplateVariableDefinition>,
) => {
  const knownVariables = new Map<string, TemplateVariableDefinition>();

  for (const definition of definitions) {
    const variableName = definition.variableName?.trim();
    if (!variableName) {
      continue;
    }

    if (
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(variableName) &&
      !knownVariables.has(variableName)
    ) {
      knownVariables.set(variableName, definition);
    }
  }

  return knownVariables;
};

const buildAvailableVariables = (
  sources: ReadonlyArray<TemplateVariableSource>,
  context: Pick<ResolverContext, "nodeId" | "nodeName" | "executionId">,
) => {
  const availableVariables = new Map<string, Prisma.JsonValue>();

  for (const source of sources) {
    const variableName = source.variableName?.trim();
    if (!variableName) {
      continue;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variableName)) {
      throw createTemplateError(context, {
        code: "TEMPLATE_INVALID_EXPRESSION",
        message: `Workflow node ${source.nodeId} has invalid variable name "${variableName}".`,
        variableName,
      });
    }

    if (availableVariables.has(variableName)) {
      throw createTemplateError(context, {
        code: "TEMPLATE_INVALID_EXPRESSION",
        message: `Workflow variable "${variableName}" is available from more than one upstream node.`,
        variableName,
      });
    }

    availableVariables.set(variableName, source.result);
  }

  return availableVariables;
};

const parseJsonStringFields = (
  data: Prisma.JsonValue,
  fields: ReadonlySet<string>,
  context: Pick<ResolverContext, "nodeId" | "nodeName" | "executionId">,
) => {
  if (
    fields.size === 0 ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return data;
  }

  const parsedData = { ...data };

  for (const field of fields) {
    const value = parsedData[field];
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    try {
      parsedData[field] = JSON.parse(value) as Prisma.JsonValue;
    } catch {
      throw createTemplateError(context, {
        code: "TEMPLATE_BODY_INVALID",
        message: `HTTP Request node ${context.nodeId} contains malformed JSON.`,
      });
    }
  }

  return parsedData;
};

const validateUrlFields = (
  data: Prisma.JsonValue,
  fields: ReadonlySet<string>,
  context: Pick<ResolverContext, "nodeId" | "nodeName" | "executionId">,
) => {
  if (
    fields.size === 0 ||
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    return;
  }

  for (const field of fields) {
    const value = data[field];
    if (value === undefined || value === "") {
      continue;
    }

    if (typeof value !== "string") {
      throw createTemplateError(context, {
        code: "TEMPLATE_RESOLVED_URL_INVALID",
        message: `Resolved URL for node ${context.nodeId} is invalid.`,
      });
    }

    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Unsupported URL protocol.");
      }
    } catch {
      throw createTemplateError(context, {
        code: "TEMPLATE_RESOLVED_URL_INVALID",
        message: `Resolved URL for node ${context.nodeId} is invalid.`,
      });
    }
  }
};

export const resolveWorkflowVariables = (
  nodeId: string,
  data: Prisma.JsonValue,
  sources: ReadonlyArray<TemplateVariableSource>,
  options: TemplateResolverOptions = {},
): Prisma.JsonValue => {
  const errorContext = {
    nodeId,
    ...(options.nodeName ? { nodeName: options.nodeName } : {}),
    ...(options.executionId ? { executionId: options.executionId } : {}),
  };
  const definitions = options.variableDefinitions ?? sources;
  const context: ResolverContext = {
    ...errorContext,
    knownVariables: buildKnownVariables(definitions),
    availableVariables: buildAvailableVariables(sources, errorContext),
  };
  const parsedData = parseJsonStringFields(
    data,
    new Set(options.jsonStringFields ?? []),
    context,
  );
  const resolvedData = resolveTemplateValue(parsedData, context);

  validateUrlFields(resolvedData, new Set(options.urlFields ?? []), context);

  return resolvedData;
};
