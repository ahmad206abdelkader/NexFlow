import "@/test/setup-dom";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  applyNodeChanges,
  type Node,
  type NodeProps,
  ReactFlow,
} from "@xyflow/react";
import { useState } from "react";
import { HttpRequestSettings } from "./settings";
import type { HttpRequestNodeData } from "./types";

Object.defineProperty(globalThis, "DocumentFragment", {
  configurable: true,
  writable: true,
  value: window.DocumentFragment,
});

afterEach(cleanup);

type TestNode = Node<HttpRequestNodeData, "httpRequestTest">;

const endpoint =
  "https://postman-echo.com/get?name={{googleForm.data.response.answers.name}}";

const TestHttpRequestNode = ({ id, data }: NodeProps<TestNode>) => {
  const [open, setOpen] = useState(false);
  const description = data.endpoint
    ? `${data.method || "GET"}: ${data.endpoint}`
    : "Not configured";

  return (
    <>
      <p>{description}</p>
      <button type="button" onClick={() => setOpen(true)}>
        Configure
      </button>
      <HttpRequestSettings
        nodeId={id}
        data={data}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
};

const renderFlow = (initialData: HttpRequestNodeData = {}) => {
  let latestNodes: TestNode[] = [];

  const Flow = () => {
    const [nodes, setNodes] = useState<TestNode[]>([
      {
        id: "http-request-1",
        type: "httpRequestTest",
        position: { x: 0, y: 0 },
        data: initialData,
      },
    ]);
    latestNodes = nodes;

    return (
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow<TestNode>
          nodes={nodes}
          edges={[]}
          nodeTypes={{ httpRequestTest: TestHttpRequestNode }}
          onNodesChange={(changes) =>
            setNodes((current) => applyNodeChanges(changes, current))
          }
        />
      </div>
    );
  };

  render(<Flow />);

  return {
    getLatestNodes: () => latestNodes,
  };
};

describe("HTTP Request settings", () => {
  it("validates visibly, saves templated GET settings, updates the subtitle, and reopens with saved values", async () => {
    const { getLatestNodes } = renderFlow();

    assert.ok(screen.getByText("Not configured"));
    fireEvent.click(screen.getByText("Configure"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    assert.ok(screen.getByRole("alert"));
    assert.match(screen.getByRole("alert").textContent ?? "", /required/i);
    assert.ok(screen.getByRole("heading", { name: "HTTP Request" }));

    fireEvent.change(screen.getByLabelText("Variable Name"), {
      target: { value: "apiResult" },
    });
    fireEvent.change(screen.getByLabelText("Endpoint URL"), {
      target: { value: endpoint },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => assert.ok(screen.getByText(`GET: ${endpoint}`)));
    assert.equal(screen.queryByRole("heading", { name: "HTTP Request" }), null);
    assert.deepEqual(getLatestNodes()[0]?.data, {
      variableName: "apiResult",
      method: "GET",
      endpoint,
      headers: [],
      body: "",
    });

    fireEvent.click(screen.getByText("Configure"));

    await waitFor(() => {
      assert.equal(
        (screen.getByLabelText("Variable Name") as HTMLInputElement).value,
        "apiResult",
      );
      assert.equal(
        (screen.getByLabelText("Endpoint URL") as HTMLInputElement).value,
        endpoint,
      );
    });

    const persistedData = JSON.parse(
      JSON.stringify(getLatestNodes()[0]?.data),
    ) as HttpRequestNodeData;
    cleanup();
    renderFlow(persistedData);

    assert.ok(screen.getByText(`GET: ${endpoint}`));
    fireEvent.click(screen.getByText("Configure"));
    assert.equal(
      (screen.getByLabelText("Variable Name") as HTMLInputElement).value,
      "apiResult",
    );
    assert.equal(
      (screen.getByLabelText("Endpoint URL") as HTMLInputElement).value,
      endpoint,
    );
  });
});
