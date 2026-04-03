import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { PaymentController } from '../controllers/PaymentController';
import { PaymentService } from '../services/PaymentService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const paymentService = new PaymentService(prisma);
const paymentController = new PaymentController(paymentService);

const bind = (method: Function) => method.bind(paymentController);

router.post('/', authenticate, bind(paymentController.chargePayment));
router.post('/refund', authenticate, requirePermission('refunds', 'create'), bind(paymentController.refundPayment));
router.post('/split', authenticate, bind(paymentController.splitPayment));
router.post('/capture', authenticate, bind(paymentController.capturePreAuth));
router.get('/history', authenticate, bind(paymentController.getTransactionHistory));
router.get('/bill/:orderId', authenticate, bind(paymentController.getBill));

export default router;
