import { appendFileSync } from 'node:fs';

// Sends through SMTP when SMTP_HOST is set and DRY_RUN isn't "true".
// Otherwise each email is logged and written to the workflow run summary.
export async function createMailer() {
  const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  const dryRun = process.env.DRY_RUN === 'true' || !SMTP_HOST;
  let transport = null;
  if (!dryRun) {
    const { default: nodemailer } = await import('nodemailer');
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }

  return {
    dryRun,
    async send({ to, subject, html, text }) {
      if (dryRun) {
        console.log(`[dry run] To: ${to} | ${subject}`);
        summary(`### ${escapeHtml(subject)}\nTo: ${escapeHtml(to)}\n\n<details><summary>Email</summary>\n\n${html}\n\n</details>\n`);
        return;
      }
      await transport.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, html, text });
      console.log(`Sent to ${to}: ${subject}`);
    },
  };
}

export function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const STATUS = {
  'on-track': ['On track', '#1f845a'],
  'at-risk': ['At risk', '#b65c02'],
  'off-track': ['Off track', '#c9372c'],
  paused: ['Paused', '#626f86'],
  done: ['Done', '#0c66e4'],
  archived: ['Archived', '#626f86'],
  pending: ['No update yet', '#626f86'],
};

export function statusBadge(status) {
  const [label, color] = STATUS[status] ?? STATUS.pending;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:12px;font-weight:600">${label}</span>`;
}

// Plain text with line breaks; the update's Markdown isn't rendered in email.
export function textBlock(text) {
  return `<div style="white-space:pre-wrap;color:#172b4d;line-height:1.5">${escapeHtml(text)}</div>`;
}

export function layout(title, body, siteUrl) {
  return `<!doctype html><html><body style="margin:0;background:#f7f8f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
<div style="font-size:14px;font-weight:700;color:#0c66e4;margin-bottom:8px">dG Albums</div>
<h1 style="font-size:20px;color:#172b4d;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
<p style="font-size:12px;color:#626f86;margin-top:32px">Sent by <a href="${siteUrl}" style="color:#0c66e4">dG Albums</a>. Follow or unfollow a project by adding or removing your 👀 reaction on its GitHub issue.</p>
</div></body></html>`;
}

export function button(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#0c66e4;color:#fff;text-decoration:none;padding:8px 14px;border-radius:4px;font-weight:600;font-size:14px">${escapeHtml(label)}</a>`;
}
