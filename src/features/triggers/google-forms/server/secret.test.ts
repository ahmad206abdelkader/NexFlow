import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateGoogleFormsWebhookSecret,
  hashGoogleFormsWebhookSecret,
  stableJsonStringify,
  verifyGoogleFormsWebhookSecret,
} from "./secret";

describe("Google Forms webhook secrets", () => {
  it("hashes and verifies a generated secret without storing plaintext", async () => {
    const secret = generateGoogleFormsWebhookSecret();
    const hash = await hashGoogleFormsWebhookSecret(secret);

    assert.equal(hash.includes(secret), false);
    assert.equal(await verifyGoogleFormsWebhookSecret(secret, hash), true);
    assert.equal(await verifyGoogleFormsWebhookSecret("wrong", hash), false);
  });

  it("stable-stringifies equivalent payload objects", () => {
    assert.equal(
      stableJsonStringify({ b: 2, a: { d: 4, c: 3 } }),
      stableJsonStringify({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
});
