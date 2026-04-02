/**
 * Email escalation via Resend (free tier: 100 emails/day).
 * Only fires for real business inquiries — product questions never trigger this.
 */

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Sender domain must be verified in your Resend account.
// During development you can use the default onboarding@resend.dev sender.
const SENDER =
  process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

export interface EscalationData {
  customer_message: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  language: 'en' | 'de'
}

export async function sendEscalationEmail(data: EscalationData): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL
  if (!ownerEmail) {
    console.error('[email] OWNER_EMAIL not configured — skipping escalation email')
    return false
  }

  const { customer_message, customer_name, customer_email, customer_phone, language } =
    data

  try {
    if (language === 'de') {
      await resend.emails.send({
        from: SENDER,
        to: ownerEmail,
        subject: `🚨 Neue Anfrage: ${customer_name ?? 'Unbekannt'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E3A8A;">🚨 NEUE ANFRAGE — 5elements Sports Chatbot</h2>

            <div style="background: #f8f9fa; border-left: 4px solid #2563EB; padding: 16px; margin: 16px 0;">
              <h3>KUNDENNACHRICHT:</h3>
              <p style="font-style: italic;">"${customer_message}"</p>
            </div>

            <h3>KUNDENDATEN:</h3>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customer_name ?? 'Nicht angegeben'}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>E-Mail</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customer_email ?? 'Nicht angegeben'}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Telefon</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customer_phone ?? 'Nicht angegeben'}</td></tr>
            </table>

            <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <strong>⚡ AKTION ERFORDERLICH:</strong><br />
              Bitte kontaktiere diesen Kunden per WhatsApp oder E-Mail.
            </div>

            <p style="color: #6c757d; font-size: 12px;">
              Gesendet vom 5elements Chatbot · ${new Date().toLocaleString('de-DE')}
            </p>
          </div>
        `,
      })
    } else {
      await resend.emails.send({
        from: SENDER,
        to: ownerEmail,
        subject: `🚨 New Lead: ${customer_name ?? 'Unknown'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E3A8A;">🚨 NEW LEAD — 5elements Sports Chatbot</h2>

            <div style="background: #f8f9fa; border-left: 4px solid #2563EB; padding: 16px; margin: 16px 0;">
              <h3>CUSTOMER MESSAGE:</h3>
              <p style="font-style: italic;">"${customer_message}"</p>
            </div>

            <h3>CUSTOMER INFO:</h3>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customer_name ?? 'Not provided'}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customer_email ?? 'Not provided'}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${customer_phone ?? 'Not provided'}</td></tr>
            </table>

            <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 16px; margin: 16px 0; border-radius: 4px;">
              <strong>⚡ ACTION REQUIRED:</strong><br />
              Please follow up with this customer via WhatsApp or email.
            </div>

            <p style="color: #6c757d; font-size: 12px;">
              Sent by 5elements Chatbot · ${new Date().toLocaleString('en-GB')}
            </p>
          </div>
        `,
      })
    }

    console.log(`[email] Escalation email sent to ${ownerEmail}`)
    return true
  } catch (err) {
    console.error('[email] Failed to send escalation email:', err)
    return false
  }
}
