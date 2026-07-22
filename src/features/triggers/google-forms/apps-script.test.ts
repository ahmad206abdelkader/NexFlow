import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateGoogleFormsAppsScript,
  LOST_GOOGLE_FORMS_WEBHOOK_SECRET,
} from "./apps-script";

describe("Google Forms Apps Script generator", () => {
  it("generates a form-bound installable trigger script", () => {
    const script = generateGoogleFormsAppsScript({
      webhookUrl: "https://nexflow.example/api/webhooks/google-forms/public-id",
      webhookSecret: "one-time-secret",
    });

    assert.match(script, /function onFormSubmit\(e\)/);
    assert.match(script, /const form = e\.source/);
    assert.match(script, /response\.getItemResponses\(\)/);
    assert.match(script, /"X-Webhook-Secret": WEBHOOK_SECRET/);
    assert.match(script, /muteHttpExceptions: true/);
    assert.match(script, /response\.getId\(\)/);
    assert.doesNotMatch(script, /FormApp\.getResponses/);
  });

  it("does not pretend a lost secret can be recovered", () => {
    const script = generateGoogleFormsAppsScript({
      webhookUrl: "https://nexflow.example/webhook",
    });

    assert.match(script, new RegExp(LOST_GOOGLE_FORMS_WEBHOOK_SECRET));
  });
});
