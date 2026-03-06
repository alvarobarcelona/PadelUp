import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePathEs = path.join(
  __dirname,
  "notifications_email_template_es.html",
);
const templatePathEn = path.join(
  __dirname,
  "notifications_email_template_en.html",
);
const templatePathDe = path.join(
  __dirname,
  "notifications_email_template_de.html",
);

async function testEmail() {
  try {
    const htmlContentEs = fs.readFileSync(templatePathEs, "utf-8");
    const htmlContentEn = fs.readFileSync(templatePathEn, "utf-8");
    const htmlContentDe = fs.readFileSync(templatePathDe, "utf-8");
    console.log(
      "Template loaded successfully. Sending test email via local emulator...",
    );

    const response = await fetch(
      "http://127.0.0.1:54321/functions/v1/send-notification-reminder",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailTemplates: {
            es: htmlContentEs,
            en: htmlContentEn,
            de: htmlContentDe,
          },
        }),
      },
    );

    const data = await response.json();
    console.log("Response:", data);
  } catch (e) {
    console.error("Script error:", e);
  }
}

testEmail();
