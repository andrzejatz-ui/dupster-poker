import type { NextFunction, Request, Response } from 'express';
import { verifyAdminToken } from '../auth/sessions.js';

export interface AdminRequest extends Request {
  adminId?: string;
}

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const auth = req.header('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const decoded = verifyAdminToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.adminId = decoded.sub;
  next();
}
