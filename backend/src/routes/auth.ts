import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/login', AuthController.login);
router.put('/password', authenticate, AuthController.changePassword);
router.post('/register', AuthController.register);
router.get('/me', authenticate, AuthController.getCurrentUser);
router.post('/logout', authenticate, AuthController.logout);

export default router;