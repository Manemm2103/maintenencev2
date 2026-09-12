import { Router } from 'express';
import { asyncHandler, ApiError } from '../errors.js';
import { query } from '../db.js';
import { asString, id, nullableString, requireString, safeJson } from '../utils.js';

export const adminRouter = Router();

function mapCustomer(row) {
  return {
    id: row.id,
    customerCode: row.customer_code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    propertyCount: row.property_count || 0,
    requestCount: row.request_count || 0,
    createdAt: row.created_at
  };
}

function mapProperty(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    name: row.name,
    propertyType: row.property_type,
    area: row.area,
    city: row.city,
    address: row.address,
    status: row.status,
    activeServicesCount: row.active_services_count,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    customerEmail: row.customer_email || null,
    propertyId: row.property_id,
    propertyName: row.property_name || null,
    serviceTypeId: row.service_type_id,
    serviceType: row.service_type_name || null,
    requestType: row.request_type,
    title: row.title,
    description: row.description,
    preferredDate: row.preferred_date,
    preferredTimeWindow: row.preferred_time_window,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAppointment(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    propertyId: row.property_id,
    propertyName: row.property_name || null,
    serviceTypeId: row.service_type_id,
    serviceType: row.service_type_name || null,
    title: row.title,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    timeWindow: row.time_window,
    status: row.status,
    estimatedDuration: row.estimated_duration,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapServiceType(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    estimatedDuration: row.estimated_duration
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    title: row.title,
    body: row.body,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at
  };
}

function mapSupportMessage(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name || null,
    propertyId: row.property_id,
    propertyName: row.property_name || null,
    subject: row.subject,
    message: row.message,
    channel: row.channel,
    status: row.status,
    createdAt: row.created_at
  };
}

function dateTimeString(value) {
  const text = nullableString(value);
  return text ? text.replace('T', ' ') : null;
}

async function ensureCustomer(customerId) {
  const rows = await query('SELECT id FROM customers WHERE id = ? LIMIT 1', [customerId]);
  if (!rows.length) throw new ApiError(404, 'Customer not found');
}

async function ensureProperty(propertyId, customerId = null) {
  const params = [propertyId];
  let filter = '';
  if (customerId) {
    filter = 'AND customer_id = ?';
    params.push(customerId);
  }

  const rows = await query(`SELECT id FROM properties WHERE id = ? ${filter} LIMIT 1`, params);
  if (!rows.length) throw new ApiError(404, 'Property not found');
}

adminRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const [customers, properties, requests, appointments, messages] = await Promise.all([
    query('SELECT COUNT(*) AS total FROM customers'),
    query('SELECT COUNT(*) AS total FROM properties'),
    query(`SELECT
        COUNT(*) AS total,
        SUM(status IN ('new', 'pending_confirmation')) AS open_total
      FROM service_requests`),
    query(`SELECT
        COUNT(*) AS total,
        SUM(scheduled_start >= CURRENT_TIMESTAMP AND status IN ('confirmed', 'requested')) AS upcoming_total
      FROM appointments`),
    query(`SELECT COUNT(*) AS total FROM support_messages WHERE status IN ('new', 'open')`)
  ]);

  res.json({
    totals: {
      customers: customers[0].total || 0,
      properties: properties[0].total || 0,
      requests: requests[0].total || 0,
      openRequests: requests[0].open_total || 0,
      appointments: appointments[0].total || 0,
      upcomingAppointments: appointments[0].upcoming_total || 0,
      openSupportMessages: messages[0].total || 0
    }
  });
}));

adminRouter.get('/customers', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT c.*,
      COUNT(DISTINCT p.id) AS property_count,
      COUNT(DISTINCT sr.id) AS request_count
     FROM customers c
     LEFT JOIN properties p ON p.customer_id = c.id
     LEFT JOIN service_requests sr ON sr.customer_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );

  res.json({ customers: rows.map(mapCustomer) });
}));

adminRouter.get('/customers/:id', asyncHandler(async (req, res) => {
  const customers = await query('SELECT * FROM customers WHERE id = ? LIMIT 1', [req.params.id]);
  if (!customers.length) throw new ApiError(404, 'Customer not found');

  const [properties, requests, appointments] = await Promise.all([
    query('SELECT * FROM properties WHERE customer_id = ? ORDER BY is_primary DESC, name ASC', [req.params.id]),
    query(
      `SELECT sr.*, c.name AS customer_name, c.email AS customer_email, p.name AS property_name, st.name AS service_type_name
       FROM service_requests sr
       JOIN customers c ON c.id = sr.customer_id
       JOIN properties p ON p.id = sr.property_id
       LEFT JOIN service_types st ON st.id = sr.service_type_id
       WHERE sr.customer_id = ?
       ORDER BY sr.created_at DESC`,
      [req.params.id]
    ),
    query(
      `SELECT a.*, c.name AS customer_name, p.name AS property_name, st.name AS service_type_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       JOIN properties p ON p.id = a.property_id
       LEFT JOIN service_types st ON st.id = a.service_type_id
       WHERE a.customer_id = ?
       ORDER BY COALESCE(a.scheduled_start, a.created_at) DESC`,
      [req.params.id]
    )
  ]);

  res.json({
    customer: mapCustomer({ ...customers[0], property_count: properties.length, request_count: requests.length }),
    properties: properties.map(mapProperty),
    requests: requests.map(mapRequest),
    appointments: appointments.map(mapAppointment)
  });
}));

adminRouter.get('/properties', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT p.*, c.name AS customer_name
     FROM properties p
     JOIN customers c ON c.id = p.customer_id
     ORDER BY c.name ASC, p.is_primary DESC, p.name ASC`
  );
  res.json({ properties: rows.map(mapProperty) });
}));

adminRouter.get('/service-types', asyncHandler(async (_req, res) => {
  const rows = await query('SELECT * FROM service_types ORDER BY name ASC');
  res.json({ serviceTypes: rows.map(mapServiceType) });
}));

adminRouter.get('/service-requests', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT sr.*, c.name AS customer_name, c.email AS customer_email, p.name AS property_name, st.name AS service_type_name
     FROM service_requests sr
     JOIN customers c ON c.id = sr.customer_id
     JOIN properties p ON p.id = sr.property_id
     LEFT JOIN service_types st ON st.id = sr.service_type_id
     ORDER BY sr.created_at DESC`
  );
  res.json({ requests: rows.map(mapRequest) });
}));

adminRouter.patch('/service-requests/:id', asyncHandler(async (req, res) => {
  const existing = await query('SELECT id FROM service_requests WHERE id = ? LIMIT 1', [req.params.id]);
  if (!existing.length) throw new ApiError(404, 'Service request not found');

  const status = nullableString(req.body.status);
  const notes = req.body.notes === undefined ? undefined : nullableString(req.body.notes);

  if (!status && notes === undefined) {
    throw new ApiError(400, 'status or notes is required');
  }

  if (status) {
    await query('UPDATE service_requests SET status = ? WHERE id = ?', [status, req.params.id]);
  }
  if (notes !== undefined) {
    await query('UPDATE service_requests SET notes = ? WHERE id = ?', [notes, req.params.id]);
  }

  const rows = await query(
    `SELECT sr.*, c.name AS customer_name, c.email AS customer_email, p.name AS property_name, st.name AS service_type_name
     FROM service_requests sr
     JOIN customers c ON c.id = sr.customer_id
     JOIN properties p ON p.id = sr.property_id
     LEFT JOIN service_types st ON st.id = sr.service_type_id
     WHERE sr.id = ?`,
    [req.params.id]
  );
  res.json({ request: mapRequest(rows[0]) });
}));

adminRouter.get('/appointments', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT a.*, c.name AS customer_name, p.name AS property_name, st.name AS service_type_name
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN properties p ON p.id = a.property_id
     LEFT JOIN service_types st ON st.id = a.service_type_id
     ORDER BY COALESCE(a.scheduled_start, a.created_at) DESC`
  );
  res.json({ appointments: rows.map(mapAppointment) });
}));

adminRouter.post('/appointments', asyncHandler(async (req, res) => {
  const customerId = requireString(req.body, 'customerId');
  const propertyId = requireString(req.body, 'propertyId');
  const title = requireString(req.body, 'title');
  const scheduledStart = dateTimeString(requireString(req.body, 'scheduledStart'));
  const serviceTypeId = nullableString(req.body.serviceTypeId);

  await ensureCustomer(customerId);
  await ensureProperty(propertyId, customerId);

  const appointmentId = id();
  await query(
    `INSERT INTO appointments
      (id, customer_id, property_id, service_type_id, title, scheduled_start, scheduled_end, time_window, status, estimated_duration, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      appointmentId,
      customerId,
      propertyId,
      serviceTypeId,
      title,
      scheduledStart,
      dateTimeString(req.body.scheduledEnd),
      nullableString(req.body.timeWindow),
      asString(req.body.status, 'confirmed'),
      nullableString(req.body.estimatedDuration),
      nullableString(req.body.notes)
    ]
  );

  const rows = await query(
    `SELECT a.*, c.name AS customer_name, p.name AS property_name, st.name AS service_type_name
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN properties p ON p.id = a.property_id
     LEFT JOIN service_types st ON st.id = a.service_type_id
     WHERE a.id = ?`,
    [appointmentId]
  );

  res.status(201).json({ appointment: mapAppointment(rows[0]) });
}));

adminRouter.patch('/appointments/:id', asyncHandler(async (req, res) => {
  const existing = await query('SELECT id FROM appointments WHERE id = ? LIMIT 1', [req.params.id]);
  if (!existing.length) throw new ApiError(404, 'Appointment not found');

  const status = nullableString(req.body.status);
  const notes = req.body.notes === undefined ? undefined : nullableString(req.body.notes);

  if (!status && notes === undefined) {
    throw new ApiError(400, 'status or notes is required');
  }

  if (status) {
    await query('UPDATE appointments SET status = ? WHERE id = ?', [status, req.params.id]);
  }
  if (notes !== undefined) {
    await query('UPDATE appointments SET notes = ? WHERE id = ?', [notes, req.params.id]);
  }

  const rows = await query(
    `SELECT a.*, c.name AS customer_name, p.name AS property_name, st.name AS service_type_name
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN properties p ON p.id = a.property_id
     LEFT JOIN service_types st ON st.id = a.service_type_id
     WHERE a.id = ?`,
    [req.params.id]
  );

  res.json({ appointment: mapAppointment(rows[0]) });
}));

adminRouter.get('/notifications', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT n.*, c.name AS customer_name
     FROM notifications n
     JOIN customers c ON c.id = n.customer_id
     ORDER BY n.created_at DESC
     LIMIT 100`
  );
  res.json({ notifications: rows.map(mapNotification) });
}));

adminRouter.post('/notifications', asyncHandler(async (req, res) => {
  const customerId = requireString(req.body, 'customerId');
  const title = requireString(req.body, 'title');
  const body = requireString(req.body, 'body');

  await ensureCustomer(customerId);

  const notificationId = id();
  await query(
    `INSERT INTO notifications (id, customer_id, title, body, metadata_json, is_read)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [notificationId, customerId, title, body, safeJson({ source: 'admin' })]
  );

  const rows = await query(
    `SELECT n.*, c.name AS customer_name
     FROM notifications n
     JOIN customers c ON c.id = n.customer_id
     WHERE n.id = ?`,
    [notificationId]
  );

  res.status(201).json({ notification: mapNotification(rows[0]) });
}));

adminRouter.get('/support-messages', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT sm.*, c.name AS customer_name, p.name AS property_name
     FROM support_messages sm
     JOIN customers c ON c.id = sm.customer_id
     LEFT JOIN properties p ON p.id = sm.property_id
     ORDER BY sm.created_at DESC`
  );
  res.json({ messages: rows.map(mapSupportMessage) });
}));

adminRouter.patch('/support-messages/:id', asyncHandler(async (req, res) => {
  const status = requireString(req.body, 'status');
  const existing = await query('SELECT id FROM support_messages WHERE id = ? LIMIT 1', [req.params.id]);
  if (!existing.length) throw new ApiError(404, 'Support message not found');

  await query('UPDATE support_messages SET status = ? WHERE id = ?', [status, req.params.id]);
  const rows = await query(
    `SELECT sm.*, c.name AS customer_name, p.name AS property_name
     FROM support_messages sm
     JOIN customers c ON c.id = sm.customer_id
     LEFT JOIN properties p ON p.id = sm.property_id
     WHERE sm.id = ?`,
    [req.params.id]
  );
  res.json({ message: mapSupportMessage(rows[0]) });
}));
