import {
  AbstractNotificationProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { Resend } from "resend"

type ResendOptions = {
  api_key: string
  from: string
}

type InjectedDependencies = {
  logger: Logger
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"
  private resendClient: Resend
  private options: ResendOptions
  private logger: Logger

  constructor({ logger }: InjectedDependencies, options: ResendOptions) {
    super()
    this.resendClient = new Resend(options.api_key)
    this.options = options
    this.logger = logger
  }

  static validateOptions(options: Record<any, any>) {
    if (!options.api_key) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `api_key` is required in the Resend provider options."
      )
    }
    if (!options.from) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Option `from` is required in the Resend provider options."
      )
    }
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const notifData = notification.data || {}
    const subject = this.getSubject(notification.template, notifData)
    const html = this.getHtml(notification.template, notifData)

    const { data, error } = await this.resendClient.emails.send({
      from: this.options.from,
      to: [notification.to],
      subject,
      html,
    })

    if (error || !data) {
      this.logger.error(
        `[resend] Failed to send "${notification.template}" to ${notification.to}: ${error?.message || "unknown error"}`
      )
      return {}
    }

    this.logger.info(
      `[resend] Sent "${notification.template}" to ${notification.to}`
    )
    return { id: data.id }
  }

  private getSubject(template: string, data: Record<string, unknown>): string {
    switch (template) {
      case "user-invited":
        return "You've been invited to VOD Auctions Admin"
      default:
        return "VOD Auctions Notification"
    }
  }

  private getHtml(template: string, data: Record<string, unknown>): string {
    switch (template) {
      case "user-invited":
        return this.inviteTemplate(data)
      default:
        return `<p>You have a new notification from VOD Auctions.</p>`
    }
  }

  private inviteTemplate(data: Record<string, unknown>): string {
    const inviteUrl = (data.invite_url as string) || "#"
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VOD Auctions</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background-color:#1c1915;padding:24px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:22px;height:22px;background-color:#d4a54a;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:bold;color:#1c1915;line-height:22px;">V</td>
                  <td style="padding-left:8px;color:#d4a54a;font-weight:600;font-size:14px;">VOD Auctions</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#18181b;">You're Invited</h1>
              <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
                You've been invited to join the VOD Auctions admin team. Click the button below to accept the invitation and set up your account.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteUrl}" style="display:inline-block;width:100%;max-width:400px;padding:12px 24px;background-color:#d4a54a;color:#1c1915;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-radius:8px;box-sizing:border-box;">Accept Invitation</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <a href="${inviteUrl}" style="color:#d4a54a;word-break:break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e4e4e7;padding:16px 24px;text-align:center;font-size:11px;color:#a1a1aa;">
              <p style="margin:0;">VOD Auctions &mdash; Curated Music Auctions</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  }
}

export default ResendNotificationProviderService
