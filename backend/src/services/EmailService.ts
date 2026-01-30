export class EmailService {
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    recipientName: string
  ): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // TODO: Integrate with email service (SendGrid, AWS SES, Nodemailer, etc.)
    console.log(`Sending password reset email to ${email}`);
    console.log(`Reset URL: ${resetUrl}`);

    // Example with Nodemailer (install: npm install nodemailer)
    /*
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'BlackPot - Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${recipientName},</p>
        <p>Click the link below to reset your password (valid for 1 hour):</p>
        <a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p>Or paste this code in your browser:</p>
        <code>${resetUrl}</code>
      `,
    };

    await transporter.sendMail(mailOptions);
    */
  }

  async sendPasswordChangedEmail(email: string, recipientName: string): Promise<void> {
    // TODO: Send confirmation email
    console.log(`Sending password changed confirmation to ${email}`);
  }
}