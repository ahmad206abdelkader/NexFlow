#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_APPLICATION_URL_ENV = "BETTER_AUTH_URL";
export const TRUSTED_AUTH_ORIGINS_ENV = "BETTER_AUTH_TRUSTED_ORIGINS";
export const DEVELOPMENT_PORT = 3000;
export const TUNNEL_TARGET = `http://127.0.0.1:${DEVELOPMENT_PORT}`;
export const TUNNEL_STARTUP_TIMEOUT_MS = 30_000;

const npmExecutable = (platform) => (platform === "win32" ? "npm.cmd" : "npm");
const cloudflaredExecutable = (platform) =>
  platform === "win32" ? "cloudflared.exe" : "cloudflared";

const mergeTrustedOrigins = (configuredOrigins, requiredOrigins) =>
  Array.from(
    new Set([
      ...(configuredOrigins ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      ...requiredOrigins,
    ]),
  ).join(",");

const extractQuickTunnelUrl = (output) => {
  const match = output.match(
    /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.com/iu,
  );

  if (!match) {
    return null;
  }

  const url = new URL(match[0]);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".trycloudflare.com")
  ) {
    return null;
  }

  return url.origin;
};

const stopChild = (child, signal, platform, killProcess) => {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  if (platform !== "win32" && Number.isInteger(child.pid)) {
    try {
      killProcess(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code === "ESRCH") {
        return;
      }
    }
  }

  child.kill(signal);
};

const waitForQuickTunnelUrl = ({
  tunnelProcess,
  timeoutMs,
  setTimer,
  clearTimer,
}) =>
  new Promise((resolveUrl, rejectUrl) => {
    let output = "";

    const cleanup = () => {
      clearTimer(timeout);
      tunnelProcess.stdout.off("data", handleOutput);
      tunnelProcess.stderr.off("data", handleOutput);
      tunnelProcess.off("error", handleError);
      tunnelProcess.off("exit", handleExit);
    };

    const fail = (error) => {
      cleanup();
      rejectUrl(error);
    };

    const handleOutput = (chunk) => {
      output = `${output}${chunk}`.slice(-32_768);
      const publicUrl = extractQuickTunnelUrl(output);
      if (publicUrl) {
        cleanup();
        resolveUrl(publicUrl);
      }
    };

    const handleError = (error) => {
      fail(
        new Error(
          `Could not start cloudflared. Install it and ensure it is available on PATH: ${error.message}`,
          { cause: error },
        ),
      );
    };

    const handleExit = (code, signal) => {
      const detail = output.trim();
      fail(
        new Error(
          `Cloudflare Quick Tunnel exited before providing a public URL${
            signal ? ` after ${signal}` : ` with code ${code ?? 1}`
          }.${detail ? `\n${detail}` : ""}`,
        ),
      );
    };

    const timeout = setTimer(() => {
      fail(
        new Error(
          `Cloudflare Quick Tunnel did not provide a public URL within ${Math.ceil(
            timeoutMs / 1000,
          )} seconds.`,
        ),
      );
    }, timeoutMs);

    tunnelProcess.stdout.on("data", handleOutput);
    tunnelProcess.stderr.on("data", handleOutput);
    tunnelProcess.once("error", handleError);
    tunnelProcess.once("exit", handleExit);
  });

export const startPublicDevelopment = async ({
  spawnTunnelProcess = spawn,
  spawnDevelopmentProcess = spawn,
  environment = process.env,
  platform = process.platform,
  processEvents = process,
  logger = console,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  killProcess = process.kill,
  tunnelStartupTimeoutMs = TUNNEL_STARTUP_TIMEOUT_MS,
  startAllServices = false,
} = {}) => {
  let tunnelProcess;

  try {
    tunnelProcess = spawnTunnelProcess(
      cloudflaredExecutable(platform),
      ["tunnel", "--url", TUNNEL_TARGET],
      {
        env: environment,
        detached: platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    throw new Error(`Could not start cloudflared: ${error.message}`, {
      cause: error,
    });
  }

  let publicUrl;
  try {
    publicUrl = await waitForQuickTunnelUrl({
      tunnelProcess,
      timeoutMs: tunnelStartupTimeoutMs,
      setTimer,
      clearTimer,
    });
  } catch (error) {
    stopChild(tunnelProcess, "SIGTERM", platform, killProcess);
    throw error;
  }

  if (tunnelProcess.exitCode !== null) {
    throw new Error("Cloudflare Quick Tunnel exited during startup.");
  }

  logger.log("");
  logger.log("Cloudflare Quick Tunnel URL:");
  logger.log(`  ${publicUrl}`);
  logger.log("");
  logger.log(
    `Google Forms webhooks will use ${publicUrl}/api/webhooks/google-forms/{webhookId}`,
  );
  logger.log(
    `Cloudflare Quick Tunnel is forwarding ${publicUrl} to ${TUNNEL_TARGET}.`,
  );
  logger.log("");

  const developmentCommands = [
    { args: ["run", "dev"], label: "Next.js" },
    ...(startAllServices
      ? [{ args: ["run", "inngest:dev"], label: "Inngest" }]
      : []),
  ];
  const developmentProcesses = [];

  try {
    for (const command of developmentCommands) {
      const child = spawnDevelopmentProcess(
        npmExecutable(platform),
        command.args,
        {
          detached: platform !== "win32",
          env: {
            ...environment,
            [PUBLIC_APPLICATION_URL_ENV]: publicUrl,
            [TRUSTED_AUTH_ORIGINS_ENV]: mergeTrustedOrigins(
              environment[TRUSTED_AUTH_ORIGINS_ENV],
              [
                publicUrl,
                `http://localhost:${DEVELOPMENT_PORT}`,
                TUNNEL_TARGET,
              ],
            ),
          },
          shell: false,
          stdio: "inherit",
        },
      );
      developmentProcesses.push({ child, label: command.label });
    }
  } catch (error) {
    stopChild(tunnelProcess, "SIGTERM", platform, killProcess);
    for (const { child } of developmentProcesses) {
      stopChild(child, "SIGTERM", platform, killProcess);
    }
    throw new Error("Could not start the development services.", {
      cause: error,
    });
  }

  let shuttingDown = false;
  let finish;
  const finished = new Promise((resolveFinished) => {
    finish = resolveFinished;
  });

  const removeListeners = () => {
    processEvents.off("SIGINT", handleSigint);
    processEvents.off("SIGTERM", handleSigterm);
  };

  const shutdown = (signal = "SIGTERM", exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    removeListeners();
    stopChild(tunnelProcess, signal, platform, killProcess);
    for (const { child } of developmentProcesses) {
      stopChild(child, signal, platform, killProcess);
    }
    finish(exitCode);
  };

  const handleSigint = () => shutdown("SIGINT", 0);
  const handleSigterm = () => shutdown("SIGTERM", 0);

  processEvents.once("SIGINT", handleSigint);
  processEvents.once("SIGTERM", handleSigterm);

  for (const { child, label } of developmentProcesses) {
    child.once("error", (error) => {
      logger.error(`${label} failed to start: ${error.message}`);
      shutdown("SIGTERM", 1);
    });

    child.once("exit", (code, signal) => {
      if (shuttingDown) {
        return;
      }

      if (code !== 0) {
        logger.error(
          `${label} exited unexpectedly${
            signal ? ` after ${signal}` : ` with code ${code ?? 1}`
          }.`,
        );
      }

      shutdown("SIGTERM", code ?? 1);
    });
  }

  tunnelProcess.once("error", (error) => {
    logger.error(`Cloudflare Quick Tunnel error: ${error.message}`);
    shutdown("SIGTERM", 1);
  });

  tunnelProcess.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    logger.error(
      `Cloudflare Quick Tunnel exited unexpectedly${
        signal ? ` after ${signal}` : ` with code ${code ?? 1}`
      }.`,
    );
    shutdown("SIGTERM", code ?? 1);
  });

  return {
    developmentProcesses: developmentProcesses.map(({ child }) => child),
    finished,
    publicUrl,
    shutdown,
    tunnelProcess,
  };
};

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const development = await startPublicDevelopment({
      startAllServices: process.argv.includes("--all"),
    });
    process.exitCode = await development.finished;
  } catch (error) {
    console.error(
      error instanceof Error
        ? `Public development startup failed: ${error.message}`
        : "Public development startup failed.",
    );
    process.exitCode = 1;
  }
}
