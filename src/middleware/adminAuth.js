import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query } from '../db.js';

export async function requireAdminAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];

    if (!token) {
      throw new ApiError(401, 'Missing bearer token');
    }

    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== 'admin') {
      throw new ApiError(403, 'Admin access required');
    }

    const rows = await query(
      'SELECT id, name, email, role FROM admins WHERE id = ? AND is_active = 1 LIMIT 1',
      [payload.sub]
    );

    if (!rows.length) {
      throw new ApiError(401, 'Admin not found');
    }

    req.admin = rows[0];
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(new ApiError(401, 'Invalid or expired token'));
  }
}
