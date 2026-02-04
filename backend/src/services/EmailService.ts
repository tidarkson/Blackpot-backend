import nodemailer from 'nodemailer';
import { config } from '../config/environment';
import logger from '../config/logger';

// Email templates
const emailTemplates = {
  passwordReset: (resetLink: string, userName: string): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #3498db; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0; 
        }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>We received a request to reset your BlackPot password.</p>
          <p>To reset your password, click the button below. This link will expire in 1 hour.</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <p>Or copy this link: <br><code>${resetLink}</code></p>
          <p>For security, never share this link with anyone.</p>
          <p>Best regards,<br>The BlackPot Team</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 BlackPot Restaurant Management. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  welcome: (userName: string, loginUrl: string): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #27ae60; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to BlackPot!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>Your BlackPot account has been created successfully. You're now ready to manage your restaurant operations.</p>
          <a href="${loginUrl}" class="button">Log In to BlackPot</a>
          <p>Best regards,<br>The BlackPot Team</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

export class EmailService {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor() {
    // Configure based on environment
    if (process.env.EMAIL_PROVIDER === 'SENDGRID') {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY || '',
        },
      });
    } else if (process.env.EMAIL_PROVIDER === 'ETHEREAL') {
      // Ethereal test email service
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: process.env.ETHEREAL_USER,
          pass: process.env.ETHEREAL_PASSWORD,
        },
      });
    } else if (process.env.EMAIL_PROVIDER === 'TEST') {
      // Test mode - emails logged to console instead of sent
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'unix',
      });
    } else {
      // Default: Gmail
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD,
        },
      });
    }

    this.fromEmail = process.env.EMAIL_FROM || 'noreply@blackpot.com';

    // Verify connection
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('✅ Email service connected successfully');
    } catch (error: any) {
      logger.error('❌ Email service connection failed:', error.message);
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    recipientName: string,
    resetTokenExpiry: Date
  ): Promise<void> {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: 'BlackPot - Password Reset Request',
        html: emailTemplates.passwordReset(resetUrl, recipientName),
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Password reset email sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send password reset email to ${email}:`, error.message);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  async sendWelcomeEmail(email: string, recipientName: string): Promise<void> {
    try {
      const loginUrl = `${process.env.FRONTEND_URL}/login`;

      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: 'Welcome to BlackPot!',
        html: emailTemplates.welcome(recipientName, loginUrl),
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Welcome email sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send welcome email to ${email}:`, error.message);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  async sendPasswordChangedEmail(email: string, recipientName: string): Promise<void> {
    try {
      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: 'BlackPot - Password Changed',
        html: `
          <p>Hi ${recipientName},</p>
          <p>Your password has been successfully changed.</p>
          <p>If you didn't make this change, please contact support immediately.</p>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Password changed confirmation sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send password changed email to ${email}:`, error.message);
      throw new Error(`Failed to send password changed email: ${error.message}`);
    }
  }
}