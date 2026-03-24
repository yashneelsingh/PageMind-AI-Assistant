import { Router } from 'express';
import { processPage, chat, summarize, checkCache, extractPdf } from '../controllers/api';

const router = Router();

router.post('/process-page', processPage);
router.post('/extract-pdf', extractPdf);
router.post('/chat', chat);
router.post('/summarize', summarize);
router.get('/check-cache', checkCache);

export default router;
