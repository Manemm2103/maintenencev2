import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler, ApiError } from '../errors.js';
import { query } from '../db.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';
import { asString, requireString } from '../utils.js';

export const adminAuthRouter = Router();

function publicAdmin(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role
  };
}

function signAdmin(row) {
  return jwt.sign(
    {
      sub: row.id,
      email: row.email,
      role: 'admin'
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

adminAuthRouter.post('/login', asyncHandler(async (req, res) => {
  const email = asString(req.body.email).toLowerCase();
  const password = requireString(req.body, 'password');

  if (!email) {
    throw new ApiError(400, 'email is required');
  }

  const rows = await query(
    `SELECT id, name, email, password_hash, role
     FROM admins
     WHERE LOWER(email) = ? AND is_active = 1
     LIMIT 1`,
    [email]
  );

  if (!rows.length) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const admin = rows[0];
  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid credentials');
  }

  res.json({
    token: signAdmin(admin),
    admin: publicAdmin(admin)
  });
}));

adminAuthRouter.get('/me', requireAdminAuth, asyncHandler(async (req, res) => {
  res.json({ admin: publicAdmin(req.admin) });
}));
