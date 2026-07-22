const scriptString = (value: string) => JSON.stringify(value);

export const LOST_GOOGLE_FORMS_WEBHOOK_SECRET =
  "REGENERATE_AND_PASTE_A_NEW_WEBHOOK_SECRET";

export const generateGoogleFormsAppsScript = ({
  webhookUrl,
  webhookSecret,
}: {
  webhookUrl: string;
  webhookSecret?: string | null;
}) => `const WEBHOOK_URL = ${scriptString(webhookUrl)};
const WEBHOOK_SECRET = ${scriptString(
  webhookSecret ?? LOST_GOOGLE_FORMS_WEBHOOK_SECRET,
)};

function onFormSubmit(e) {
  try {
    if (!e || !e.response || !e.source) {
      throw new Error(
        "Missing Google Forms submit event. Do not run onFormSubmit manually."
      );
    }

    const response = e.response;
    const form = e.source;
    const responseId = response.getId();
    const submittedAt = response.getTimestamp();

    if (!responseId || !submittedAt) {
      throw new Error(
        "The submitted form response has no stable ID or timestamp."
      );
    }

    const answers = Object.create(null);
    const answerList = [];

    response.getItemResponses().forEach(function (itemResponse) {
      const question = itemResponse.getItem().getTitle();
      const value = normalizeValue(itemResponse.getResponse());

      answers[question] = value;
      answerList.push({
        question: question,
        value: value,
      });
    });

    const payload = {
      eventId: responseId,
      submittedAt: submittedAt.toISOString(),
      form: {
        id: form.getId(),
        title: form.getTitle(),
      },
      response: {
        id: responseId,
        answers: answers,
        answerList: answerList,
      },
    };

    const result = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Webhook-Secret": WEBHOOK_SECRET,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const status = result.getResponseCode();

    if (status < 200 || status >= 300) {
      throw new Error(
        "Webhook failed with status " +
          status +
          ": " +
          result.getContentText().slice(0, 500)
      );
    }
  } catch (error) {
    console.error(
      "Google Forms webhook delivery failed: " +
        String(error).slice(0, 500)
    );
    throw error;
  }
}

function normalizeValue(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}
`;
