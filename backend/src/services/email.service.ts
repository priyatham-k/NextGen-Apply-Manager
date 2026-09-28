import nodemailer from 'nodemailer';
import { logger } from '../config/logger';

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null; // No SMTP configured — will log to console instead
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

export const sendPasswordResetEmail = async (to: string, resetUrl: string): Promise<void> => {
  const transporter = getTransporter();
  const from = process.env.EMAIL_FROM || 'noreply@jobautomation.com';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>You requested a password reset for your Job Automation account.</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="background-color: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Reset Password
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #999; font-size: 12px;">Job Application Automation System</p>
    </div>
  `;

  if (!transporter) {
    // Dev mode: log reset URL to console
    logger.info('========================================');
    logger.info('PASSWORD RESET LINK (no SMTP configured):');
    logger.info(resetUrl);
    logger.info('========================================');
    return;
  }

  await transporter.sendMail({
    from,
    to,
    subject: 'Password Reset - Job Automation',
    html
  });

  logger.info(`Password reset email sent to ${to}`);
};
