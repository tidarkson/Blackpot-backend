import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export class PasswordResetService {
  private RESET_TOKEN_EXPIRY = 1000 * 60 * 60; // 1 hour

  // Generate reset token
  generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Request password reset
  async requestPasswordReset(email: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists (security best practice)
      throw new Error('If email exists, reset link will be sent');
    }

    const resetToken = this.generateResetToken();
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + this.RESET_TOKEN_EXPIRY);

    // Store hashed token in database
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Return plain token to send via email (only shown once)
    return resetToken;
  }

  // Verify reset token validity
  async verifyResetToken(token: string): Promise<string> {
    try {
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const resetRecord = await prisma.passwordReset.findFirst({
        where: {
          token: hashedToken,
          expiresAt: { gt: new Date() },
          usedAt: null,
        },
        include: { user: true },
      });

      if (!resetRecord) {
        throw new Error('Invalid or expired reset token');
      }

      if (!resetRecord.user) {
        throw new Error('User associated with reset token not found');
      }

      return resetRecord.user.id;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid or expired reset token')) {
        throw error;
      }

      throw new Error('Unknown error while verifying reset token');
    }
  }

  // Reset password with token
  async resetPassword(token: string, newPassword: string): Promise<{ userId: string }> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    if (!resetRecord) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const { AuthService } = await import('./AuthService');
    const authService = new AuthService();
    const passwordHash = await authService.hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    });

    return { userId: resetRecord.userId };
  }
}