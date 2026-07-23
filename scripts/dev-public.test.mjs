import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import {
  PUBLIC_APPLICATION_URL_ENV,
  startPublicDevelopment,
  TRUSTED_AUTH_ORIGINS_ENV,
  TUNNEL_TARGET,
} from "./dev-public.mjs";

const makeChild = ({ streams = false } = {}) => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.killed = false;
  child.kill = (signal) => {
    child.killed = true;
    child.signal = signal;
    return true;
  };

  if (streams) {
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
  }

  return child;
};

const createHarness = ({
  tunnelOutput = "INF Your quick Tunnel has been created! url=https://public-test.trycloudflare.com",
} = {}) => {
  const processEvents = new EventEmitter();
  const tunnel = makeChild({ streams: true });
  const child = makeChild();
  const inngestChild = makeChild();
  const tunnelSpawnCalls = [];
  const developmentSpawnCalls = [];
  const logs = [];
  const startupOrder = [];

  return {
    child,
    developmentSpawnCalls,
    inngestChild,
    logs,
    processEvents,
    startupOrder,
    tunnel,
    tunnelSpawnCalls,
    dependencies: {
      spawnTunnelProcess: (command, args, options) => {
        startupOrder.push("tunnel-started");
        tunnelSpawnCalls.push({ args, command, options });
        queueMicrotask(() => {
          startupOrder.push("tunnel-ready");
          tunnel.stderr.emit("data", Buffer.from(tunnelOutput));
        });
        return tunnel;
      },
      spawnDevelopmentProcess: (command, args, options) => {
        startupOrder.push(`process-started:${args.join(" ")}`);
        developmentSpawnCalls.push({ args, command, options });
        return args.includes("inngest:dev") ? inngestChild : child;
      },
      environment: { EXISTING_VALUE: "preserved" },
      platform: "linux",
      processEvents,
      logger: {
        error: (message) => logs.push({ level: "error", message }),
        log: (message) => logs.push({ level: "log", message }),
      },
    },
  };
};

describe("public development launcher", () => {
  it("starts cloudflared and passes its Quick Tunnel URL in BETTER_AUTH_URL", async () => {
    const harness = createHarness();
    const development = await startPublicDevelopment(harness.dependencies);

    assert.equal(harness.tunnelSpawnCalls.length, 1);
    assert.equal(harness.tunnelSpawnCalls[0].command, "cloudflared");
    assert.deepEqual(harness.tunnelSpawnCalls[0].args, [
      "tunnel",
      "--url",
      TUNNEL_TARGET,
    ]);
    assert.deepEqual(harness.tunnelSpawnCalls[0].options.stdio, [
      "ignore",
      "pipe",
      "pipe",
    ]);
    assert.equal(harness.developmentSpawnCalls.length, 1);
    assert.equal(harness.developmentSpawnCalls[0].command, "npm");
    assert.deepEqual(harness.developmentSpawnCalls[0].args, ["run", "dev"]);
    assert.equal(harness.developmentSpawnCalls[0].options.shell, false);
    assert.equal(
      harness.developmentSpawnCalls[0].options.env[PUBLIC_APPLICATION_URL_ENV],
      "https://public-test.trycloudflare.com",
    );
    assert.equal(
      harness.developmentSpawnCalls[0].options.env.EXISTING_VALUE,
      "preserved",
    );
    assert.equal(
      harness.developmentSpawnCalls[0].options.env[TRUSTED_AUTH_ORIGINS_ENV],
      "https://public-test.trycloudflare.com,http://localhost:3000,http://127.0.0.1:3000",
    );
    assert.ok(
      harness.logs.some(({ message }) =>
        message.includes("https://public-test.trycloudflare.com"),
      ),
    );

    development.shutdown();
    await development.finished;
  });

  it("stops the tunnel and all development services when Ctrl+C is pressed", async () => {
    const harness = createHarness();
    const development = await startPublicDevelopment({
      ...harness.dependencies,
      startAllServices: true,
    });

    harness.processEvents.emit("SIGINT");

    assert.equal(await development.finished, 0);
    assert.equal(harness.tunnel.killed, true);
    assert.equal(harness.tunnel.signal, "SIGINT");
    assert.equal(harness.child.killed, true);
    assert.equal(harness.child.signal, "SIGINT");
    assert.equal(harness.inngestChild.killed, true);
    assert.equal(harness.inngestChild.signal, "SIGINT");
  });

  it("starts Next.js and Inngest only after the Quick Tunnel URL is available", async () => {
    const harness = createHarness();
    const development = await startPublicDevelopment({
      ...harness.dependencies,
      startAllServices: true,
    });

    assert.deepEqual(harness.startupOrder, [
      "tunnel-started",
      "tunnel-ready",
      "process-started:run dev",
      "process-started:run inngest:dev",
    ]);
    assert.equal(harness.developmentSpawnCalls.length, 2);
    assert.equal(harness.developmentSpawnCalls[0].command, "npm");
    assert.deepEqual(harness.developmentSpawnCalls[0].args, ["run", "dev"]);
    assert.deepEqual(harness.developmentSpawnCalls[1].args, [
      "run",
      "inngest:dev",
    ]);
    assert.equal(
      harness.developmentSpawnCalls[0].options.env[PUBLIC_APPLICATION_URL_ENV],
      "https://public-test.trycloudflare.com",
    );

    development.shutdown();
    await development.finished;
  });

  it("parses a Quick Tunnel URL split across output chunks", async () => {
    const harness = createHarness({ tunnelOutput: "" });
    harness.dependencies.spawnTunnelProcess = (command, args, options) => {
      harness.tunnelSpawnCalls.push({ args, command, options });
      queueMicrotask(() => {
        harness.tunnel.stderr.emit("data", "https://split-name.trycloud");
        harness.tunnel.stderr.emit("data", "flare.com");
      });
      return harness.tunnel;
    };

    const development = await startPublicDevelopment({
      ...harness.dependencies,
      startAllServices: true,
    });
    assert.equal(development.publicUrl, "https://split-name.trycloudflare.com");

    development.shutdown();
    await development.finished;
  });

  it("preserves configured auth origins while adding tunnel and local origins", async () => {
    const harness = createHarness();
    harness.dependencies.environment[TRUSTED_AUTH_ORIGINS_ENV] =
      "https://existing.example,http://localhost:3000";
    const development = await startPublicDevelopment(harness.dependencies);

    assert.equal(
      harness.developmentSpawnCalls[0].options.env[TRUSTED_AUTH_ORIGINS_ENV],
      "https://existing.example,http://localhost:3000,https://public-test.trycloudflare.com,http://127.0.0.1:3000",
    );

    development.shutdown();
    await development.finished;
  });

  it("rejects startup when cloudflared exits without a Quick Tunnel URL", async () => {
    const harness = createHarness({ tunnelOutput: "" });
    harness.dependencies.spawnTunnelProcess = () => {
      queueMicrotask(() => {
        harness.tunnel.stderr.emit("data", "unable to reach Cloudflare edge");
        harness.tunnel.emit("exit", 1, null);
      });
      return harness.tunnel;
    };

    await assert.rejects(
      startPublicDevelopment(harness.dependencies),
      /exited before providing a public URL.*unable to reach Cloudflare edge/s,
    );
    assert.equal(harness.tunnel.killed, true);
    assert.equal(harness.developmentSpawnCalls.length, 0);
  });

  it("reports an actionable error when cloudflared is unavailable", async () => {
    const harness = createHarness({ tunnelOutput: "" });
    harness.dependencies.spawnTunnelProcess = () => {
      queueMicrotask(() => {
        harness.tunnel.emit("error", new Error("spawn cloudflared ENOENT"));
      });
      return harness.tunnel;
    };

    await assert.rejects(
      startPublicDevelopment(harness.dependencies),
      /Install it and ensure it is available on PATH/,
    );
    assert.equal(harness.developmentSpawnCalls.length, 0);
  });

  it("uses Windows executable names without enabling a shell", async () => {
    const harness = createHarness();
    harness.dependencies.platform = "win32";
    const development = await startPublicDevelopment(harness.dependencies);

    assert.equal(harness.tunnelSpawnCalls[0].command, "cloudflared.exe");
    assert.equal(harness.developmentSpawnCalls[0].command, "npm.cmd");
    assert.equal(harness.developmentSpawnCalls[0].options.shell, false);

    development.shutdown();
    await development.finished;
  });

  it("stops development services when the tunnel exits unexpectedly", async () => {
    const harness = createHarness();
    const development = await startPublicDevelopment({
      ...harness.dependencies,
      startAllServices: true,
    });

    harness.tunnel.emit("exit", 1, null);

    assert.equal(await development.finished, 1);
    assert.equal(harness.child.killed, true);
    assert.equal(harness.inngestChild.killed, true);
    assert.ok(
      harness.logs.some(
        ({ level, message }) =>
          level === "error" &&
          message ===
            "Cloudflare Quick Tunnel exited unexpectedly with code 1.",
      ),
    );
  });
});
