import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler, ApiError } from '../errors.js';
import { query, transaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asString, customerCode, id, nullableString, requireString } from '../utils.js';

export const authRouter = Router();

function publicCustomer(row) {
  return {
    id: row.id,
    customerCode: row.customer_code,
    name: row.name,
    email: row.email,
    phone: row.phone
  };
}

function signCustomer(row) {
  return jwt.sign(
    {
      sub: row.id,
      email: row.email,
      customerCode: row.customer_code
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

authRouter.post('/register', asyncHandler(async (req, res) => {
  const name = requireString(req.body, 'name');
  const email = requireString(req.body, 'email').toLowerCase();
  const password = requireString(req.body, 'password');
  const phone = nullableString(req.body.phone);
  const property = req.body.property || null;

  if (password.length < 6) {
    throw new ApiError(400, 'Password must contain at least 6 characters');
  }

  const existing = await query('SELECT id FROM customers WHERE email = ? LIMIT 1', [email]);
  if (existing.length) {
    throw new ApiError(409, 'A customer with this email already exists');
  }

  const result = await transaction(async (connection) => {
    const customerId = id();
    const passwordHash = await bcrypt.hash(password, 10);
    const code = customerCode();

    await connection.execute(
      `INSERT INTO customers (id, customer_code, name, email, phone, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customerId, code, name, email, phone, passwordHash]
    );

    if (property && asString(property.name)) {
      await connection.execute(
        `INSERT INTO properties
          (id, customer_id, name, property_type, area, city, address, status, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id(),
          customerId,
          asString(property.name),
          asString(property.propertyType, 'Apartment'),
          nullableString(property.area),
          nullableString(property.city),
          nullableString(property.address),
          'new',
          1
        ]
      );
    }

    const [customers] = await connection.execute(
      'SELECT id, customer_code, name, email, phone FROM customers WHERE id = ?',
      [customerId]
    );
    return customers[0];
  });

  res.status(201).json({
    token: signCustomer(result),
    customer: publicCustomer(result)
  });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const login = asString(req.body.emailOrCustomerId || req.body.email || req.body.customerId).toLowerCase();
  const password = requireString(req.body, 'password');

  if (!login) {
    throw new ApiError(400, 'email or customer id is required');
  }

  const rows = await query(
    `SELECT id, customer_code, name, email, phone, password_hash
     FROM customers
     WHERE LOWER(email) = ? OR LOWER(customer_code) = ?
     LIMIT 1`,
    [login, login]
  );

  if (!rows.length) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const customer = rows[0];
  const passwordMatches = await bcrypt.compare(password, customer.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, 'Invalid credentials');
  }

  res.json({
    token: signCustomer(customer),
    customer: publicCustomer(customer)
  });
}));

authRouter.post('/forgot-password', asyncHandler(async (_req, res) => {
  res.status(202).json({
    status: 'accepted',
    message: 'If the account exists, a password reset process can be started.'
  });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ customer: publicCustomer(req.user) });
}));
