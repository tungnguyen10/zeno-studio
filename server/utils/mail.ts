import nodemailer from 'nodemailer'

export interface TransactionalMail {
  to: string
  subject: string
  text: string
}

export async function sendTransactionalMail(message: TransactionalMail): Promise<void> {
  const smtpUrl = process.env.NUXT_SMTP_URL
  const from = process.env.NUXT_MAIL_FROM
  if (!smtpUrl || !from) throw new Error('NUXT_SMTP_URL and NUXT_MAIL_FROM are required to send email')
  const transport = nodemailer.createTransport(smtpUrl)
  await transport.sendMail({ from, ...message })
}
