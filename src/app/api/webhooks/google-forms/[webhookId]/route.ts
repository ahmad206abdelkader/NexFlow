import { NextResponse } from "next/server";
import {
  GoogleFormsWebhookError,
  processGoogleFormsWebhook,
  readLimitedRequestBody,
} from "@/features/triggers/google-forms/server/webhook-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ webhookId: string }> },
) {
  try {
    const { webhookId } = await params;
    const rawBody = await readLimitedRequestBody(request);
    const result = await processGoogleFormsWebhook({
      webhookId,
      secret: request.headers.get("x-webhook-secret"),
      rawBody,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof GoogleFormsWebhookError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: error.code, message: error.message },
        },
        { status: error.status },
      );
    }

    console.error("Google Forms webhook processing failed.");
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "GOOGLE_FORMS_EVENT_SEND_FAILED",
          message: "The webhook could not be processed.",
        },
      },
      { status: 500 },
    );
  }
}
