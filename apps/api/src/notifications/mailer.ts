import { createTransport } from "nodemailer";

/** Envoi d'e-mails derrière une interface : inactif sans paramètres SMTP, remplaçable par un faux en test. */

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  attachments: MailAttachment[];
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

type Transport = { sendMail(mail: MailMessage & { from: string }): Promise<unknown> };

export function smtpMailer(
  url: string,
  from: string,
  open: (url: string) => Transport = (u) => createTransport(u),
): Mailer {
  const transport = open(url);
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

/**
 * `SMTP_URL` (adresse du serveur, identifiants compris) et `SMTP_FROM` viennent de l'environnement, jamais du code.
 * S'il en manque un, l'envoi reste inactif.
 */
export function mailerFromEnv(env: Record<string, string | undefined>): Mailer | undefined {
  const { SMTP_URL: url, SMTP_FROM: from } = env;
  return url && from ? smtpMailer(url, from) : undefined;
}
