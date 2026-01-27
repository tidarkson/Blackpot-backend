import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/login', AuthController.login);
router.put('/password', authenticate, AuthController.changePassword);

export default router;