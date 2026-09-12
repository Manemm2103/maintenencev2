import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { query } from '../db.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];

    if (!token) {
      throw new ApiError(401, 'Missing bearer token');
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const rows = await query(
      'SELECT id, customer_code, name, email, phone FROM customers WHERE id = ? LIMIT 1',
      [payload.sub]
    );

    if (!rows.length) {
      throw new ApiError(401, 'Customer not found');
    }

    req.user = rows[0];
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(new ApiError(401, 'Invalid or expired token'));
  }
}
