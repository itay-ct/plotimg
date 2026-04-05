import nodemailer from "nodemailer";

import { config } from "../config.js";

const transport =
  config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        },
      })
    : null;

export async function sendDownloadEmail(input: {
  email: string;
  downloadUrl: string;
  fileName: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  if (!transport) {
    return {
      delivered: false,
      reason: "SMTP transport is not configured.",
    };
  }

  await transport.sendMail({
    from: config.EMAIL_FROM,
    to: input.email,
    subject: "Your Plotimg SVG download is ready",
    text: `Your file ${input.fileName} is ready.\n\nDownload it here: ${input.downloadUrl}\n`,
    html: `<p>Your file <strong>${input.fileName}</strong> is ready.</p><p><a href="${input.downloadUrl}">Download your SVG</a></p>`,
  });

  return { delivered: true };
}
