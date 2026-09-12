import { Router } from 'express';
import { config } from '../config.js';
import { asyncHandler, ApiError } from '../errors.js';
import { query, transaction } from '../db.js';
import { asString, id, nullableString, parseJson, requireString, safeJson } from '../utils.js';

export const apiRouter = Router();

function mapProperty(row) {
  return {
    id: row.id,
    name: row.name,
    propertyType: row.property_type,
    area: row.area,
    city: row.city,
    address: row.address,
    status: row.status,
    activeServicesCount: row.active_services_count,
    isPrimary: Boolean(row.is_primary),
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
    description: row.description,
    estimatedDuration: row.estimated_duration,
    defaultCadenceMonths: row.default_cadence_months
  };
}

function mapAppointment(row) {
  return {
    id: row.id,
    propertyId: row.property_id,
    serviceTypeId: row.service_type_id,
    serviceType: row.service_type_name || null,
    title: row.title,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    timeWindow: row.time_window,
    status: row.status,
    estimatedDuration: row.estimated_duration,
    notes: row.notes,
    propertyName: row.property_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMaintenancePlan(row) {
  return {
    id: row.id,
    propertyId: row.property_id,
    serviceTypeId: row.service_type_id,
    serviceType: row.service_type_name || null,
    title: row.title,
    subtitle: row.subtitle,
    dueDate: row.due_date,
    status: row.status,
    cadenceMonths: row.cadence_months,
    propertyName: row.property_name || null,
    estimatedDuration: row.estimated_duration || null
  };
}

function mapHistory(row) {
  return {
    id: row.id,
    propertyId: row.property_id,
    serviceTypeId: row.service_type_id,
    title: row.title,
    performedAt: row.performed_at,
    technician: row.technician,
    status: row.status,
    summary: row.summary
  };
}

function mapDocument(row) {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: row.property_name || null,
    name: row.name,
    fileType: row.file_type,
    documentType: row.document_type,
    documentDateLabel: row.document_date_label,
    fileSizeLabel: row.file_size_label,
    fileUrl: row.file_url,
    createdAt: row.created_at
  };
}

function mapNotification(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    metadata: parseJson(row.metadata_json),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at
  };
}

function supportContact() {
  return {
    name: 'DR HOME Support',
    phone: config.contact.phone,
    whatsapp: config.contact.whatsapp,
    email: config.contact.email,
    website: config.contact.website,
    channels: ['whatsapp', 'phone', 'email'],
    defaultChannel: 'whatsapp'
  };
}

function mapServiceRequest(row) {
  return {
    id: row.id,
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

async function ownedProperty(customerId, propertyId) {
  const rows = await query(
    'SELECT * FROM properties WHERE id = ? AND customer_id = ? LIMIT 1',
    [propertyId, customerId]
  );
  if (!rows.length) {
    throw new ApiError(404, 'Property not found');
  }
  return rows[0];
}

async function primaryProperty(customerId) {
  const rows = await query(
    `SELECT * FROM properties
     WHERE customer_id = ?
     ORDER BY is_primary DESC, created_at ASC
     LIMIT 1`,
    [customerId]
  );
  return rows[0] || null;
}

async function resolvePropertyId(customerId, requestedId) {
  if (requestedId) {
    await ownedProperty(customerId, requestedId);
    return requestedId;
  }

  const property = await primaryProperty(customerId);
  if (!property) {
    throw new ApiError(400, 'A property is required before this action can be created');
  }
  return property.id;
}

async function getProfile(req, res) {
  const properties = await query(
    'SELECT * FROM properties WHERE customer_id = ? ORDER BY is_primary DESC, name ASC',
    [req.user.id]
  );

  res.json({
    customer: {
      id: req.user.id,
      customerCode: req.user.customer_code,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone
    },
    properties: properties.map(mapProperty)
  });
}

async function updateProfile(req, res) {
  const name = nullableString(req.body.name) || req.user.name;
  const phone = req.body.phone === undefined ? req.user.phone : nullableString(req.body.phone);

  await query('UPDATE customers SET name = ?, phone = ? WHERE id = ?', [name, phone, req.user.id]);
  const rows = await query(
    'SELECT id, customer_code, name, email, phone FROM customers WHERE id = ? LIMIT 1',
    [req.user.id]
  );

  res.json({
    customer: {
      id: rows[0].id,
      customerCode: rows[0].customer_code,
      name: rows[0].name,
      email: rows[0].email,
      phone: rows[0].phone
    }
  });
}

async function createAppointmentRequest(req, res) {
  const propertyId = await resolvePropertyId(req.user.id, nullableString(req.body.propertyId));
  const serviceTypeId = nullableString(req.body.serviceTypeId);
  const preferredDate = requireString(req.body, 'preferredDate');
  const preferredTimeWindow = requireString(req.body, 'preferredTimeWindow');
  const notes = nullableString(req.body.notes);

  if (serviceTypeId) {
    const service = await query('SELECT id FROM service_types WHERE id = ? LIMIT 1', [serviceTypeId]);
    if (!service.length) throw new ApiError(404, 'Service type not found');
  }

  const requestId = id();
  await query(
    `INSERT INTO service_requests
      (id, customer_id, property_id, service_type_id, request_type, title, description, preferred_date, preferred_time_window, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      requestId,
      req.user.id,
      propertyId,
      serviceTypeId,
      'maintenance_booking',
      asString(req.body.title, 'Maintenance booking'),
      nullableString(req.body.description),
      preferredDate,
      preferredTimeWindow,
      notes,
      'pending_confirmation'
    ]
  );

  const rows = await query(
    `SELECT sr.*, p.name AS property_name, st.name AS service_type_name
     FROM service_requests sr
     JOIN properties p ON p.id = sr.property_id
     LEFT JOIN service_types st ON st.id = sr.service_type_id
     WHERE sr.id = ?`,
    [requestId]
  );
  res.status(201).json({ request: mapServiceRequest(rows[0]) });
}

apiRouter.get('/me', asyncHandler(getProfile));
apiRouter.get('/profile', asyncHandler(getProfile));
apiRouter.patch('/me', asyncHandler(updateProfile));
apiRouter.patch('/profile', asyncHandler(updateProfile));

apiRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const property = await primaryProperty(req.user.id);

  if (!property) {
    res.json({
      customer: req.user,
      property: null,
      upcomingAppointment: null,
      maintenance: [],
      recentHistory: [],
      unreadNotifications: 0
    });
    return;
  }

  const [appointments, maintenance, history, unread] = await Promise.all([
    query(
      `SELECT a.*, p.name AS property_name, st.name AS service_type_name
       FROM appointments a
       JOIN properties p ON p.id = a.property_id
       LEFT JOIN service_types st ON st.id = a.service_type_id
       WHERE a.customer_id = ? AND a.property_id = ? AND a.scheduled_start >= CURRENT_TIMESTAMP
       ORDER BY a.scheduled_start ASC
       LIMIT 1`,
      [req.user.id, property.id]
    ),
    query(
      `SELECT mp.*, p.name AS property_name, st.name AS service_type_name, st.estimated_duration
       FROM maintenance_plans mp
       JOIN properties p ON p.id = mp.property_id
       LEFT JOIN service_types st ON st.id = mp.service_type_id
       WHERE p.customer_id = ? AND mp.property_id = ?
       ORDER BY mp.due_date ASC`,
      [req.user.id, property.id]
    ),
    query(
      `SELECT sh.*
       FROM service_history sh
       JOIN properties p ON p.id = sh.property_id
       WHERE p.customer_id = ? AND sh.property_id = ?
       ORDER BY sh.performed_at DESC
       LIMIT 5`,
      [req.user.id, property.id]
    ),
    query('SELECT COUNT(*) AS total FROM notifications WHERE customer_id = ? AND is_read = 0', [req.user.id])
  ]);

  res.json({
    customer: {
      id: req.user.id,
      customerCode: req.user.customer_code,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone
    },
    property: mapProperty(property),
    upcomingAppointment: appointments[0] ? mapAppointment(appointments[0]) : null,
    maintenance: maintenance.map(mapMaintenancePlan),
    recentHistory: history.map(mapHistory),
    unreadNotifications: unread[0].total
  });
}));

apiRouter.get('/properties', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT * FROM properties WHERE customer_id = ? ORDER BY is_primary DESC, name ASC',
    [req.user.id]
  );
  res.json({ properties: rows.map(mapProperty) });
}));

apiRouter.post('/properties', asyncHandler(async (req, res) => {
  const name = requireString(req.body, 'name');
  const propertyType = asString(req.body.propertyType, 'Apartment');
  const area = nullableString(req.body.area);
  const city = nullableString(req.body.city);
  const address = nullableString(req.body.address);

  const propertyId = id();
  const existing = await query('SELECT COUNT(*) AS total FROM properties WHERE customer_id = ?', [req.user.id]);
  const isPrimary = existing[0].total === 0 ? 1 : 0;

  await query(
    `INSERT INTO properties
      (id, customer_id, name, property_type, area, city, address, status, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [propertyId, req.user.id, name, propertyType, area, city, address, 'new', isPrimary]
  );

  const rows = await query('SELECT * FROM properties WHERE id = ? LIMIT 1', [propertyId]);
  res.status(201).json({ property: mapProperty(rows[0]) });
}));

apiRouter.patch('/properties/:id', asyncHandler(async (req, res) => {
  const property = await ownedProperty(req.user.id, req.params.id);

  await query(
    `UPDATE properties
     SET name = ?, property_type = ?, area = ?, city = ?, address = ?, status = ?
     WHERE id = ?`,
    [
      nullableString(req.body.name) || property.name,
      nullableString(req.body.propertyType) || property.property_type,
      req.body.area === undefined ? property.area : nullableString(req.body.area),
      req.body.city === undefined ? property.city : nullableString(req.body.city),
      req.body.address === undefined ? property.address : nullableString(req.body.address),
      nullableString(req.body.status) || property.status,
      property.id
    ]
  );

  const rows = await query('SELECT * FROM properties WHERE id = ? LIMIT 1', [property.id]);
  res.json({ property: mapProperty(rows[0]) });
}));

apiRouter.post('/properties/:id/primary', asyncHandler(async (req, res) => {
  await ownedProperty(req.user.id, req.params.id);

  await transaction(async (connection) => {
    await connection.execute('UPDATE properties SET is_primary = 0 WHERE customer_id = ?', [req.user.id]);
    await connection.execute('UPDATE properties SET is_primary = 1 WHERE id = ? AND customer_id = ?', [req.params.id, req.user.id]);
  });

  const rows = await query('SELECT * FROM properties WHERE id = ? LIMIT 1', [req.params.id]);
  res.json({ property: mapProperty(rows[0]) });
}));

apiRouter.get('/service-types', asyncHandler(async (_req, res) => {
  const rows = await query('SELECT * FROM service_types ORDER BY name ASC');
  res.json({ serviceTypes: rows.map(mapServiceType) });
}));

apiRouter.get('/maintenance', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT mp.*, p.name AS property_name, st.name AS service_type_name, st.estimated_duration
     FROM maintenance_plans mp
     JOIN properties p ON p.id = mp.property_id
     LEFT JOIN service_types st ON st.id = mp.service_type_id
     WHERE p.customer_id = ?
     ORDER BY mp.due_date ASC`,
    [req.user.id]
  );
  res.json({ maintenance: rows.map(mapMaintenancePlan) });
}));

apiRouter.get('/maintenance/:id', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT mp.*, p.name AS property_name, st.name AS service_type_name, st.estimated_duration
     FROM maintenance_plans mp
     JOIN properties p ON p.id = mp.property_id
     LEFT JOIN service_types st ON st.id = mp.service_type_id
     WHERE mp.id = ? AND p.customer_id = ?
     LIMIT 1`,
    [req.params.id, req.user.id]
  );

  if (!rows.length) {
    throw new ApiError(404, 'Maintenance plan not found');
  }

  const plan = rows[0];
  const [history, documents, appointments] = await Promise.all([
    query(
      `SELECT * FROM service_history
       WHERE property_id = ? AND (service_type_id = ? OR ? IS NULL)
       ORDER BY performed_at DESC`,
      [plan.property_id, plan.service_type_id, plan.service_type_id]
    ),
    query(
      `SELECT d.*, p.name AS property_name
       FROM documents d
       JOIN properties p ON p.id = d.property_id
       WHERE d.property_id = ?`,
      [plan.property_id]
    ),
    query(
      `SELECT a.*, p.name AS property_name, st.name AS service_type_name
       FROM appointments a
       JOIN properties p ON p.id = a.property_id
       LEFT JOIN service_types st ON st.id = a.service_type_id
       WHERE a.customer_id = ? AND a.property_id = ? AND (a.service_type_id = ? OR ? IS NULL)
       ORDER BY a.scheduled_start ASC`,
      [req.user.id, plan.property_id, plan.service_type_id, plan.service_type_id]
    )
  ]);

  res.json({
    maintenance: mapMaintenancePlan(plan),
    history: history.map(mapHistory),
    documents: documents.map(mapDocument),
    appointments: appointments.map(mapAppointment)
  });
}));

apiRouter.get('/appointments', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT a.*, p.name AS property_name, st.name AS service_type_name
     FROM appointments a
     JOIN properties p ON p.id = a.property_id
     LEFT JOIN service_types st ON st.id = a.service_type_id
     WHERE a.customer_id = ?
     ORDER BY COALESCE(a.scheduled_start, a.created_at) DESC`,
    [req.user.id]
  );
  res.json({ appointments: rows.map(mapAppointment) });
}));

apiRouter.post('/appointments', asyncHandler(createAppointmentRequest));
apiRouter.post('/appointments/request', asyncHandler(createAppointmentRequest));

apiRouter.get('/service-requests', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT sr.*, p.name AS property_name, st.name AS service_type_name
     FROM service_requests sr
     JOIN properties p ON p.id = sr.property_id
     LEFT JOIN service_types st ON st.id = sr.service_type_id
     WHERE sr.customer_id = ?
     ORDER BY sr.created_at DESC`,
    [req.user.id]
  );
  res.json({ requests: rows.map(mapServiceRequest) });
}));

apiRouter.post('/service-requests', asyncHandler(async (req, res) => {
  const propertyId = await resolvePropertyId(req.user.id, nullableString(req.body.propertyId));
  const serviceTypeId = nullableString(req.body.serviceTypeId);
  const description = requireString(req.body, 'description', 'short description');
  const requestType = asString(req.body.requestType, 'general');
  const title = asString(req.body.title, requestType === 'problem' ? 'Service problem' : 'Service request');

  if (serviceTypeId) {
    const service = await query('SELECT id FROM service_types WHERE id = ? LIMIT 1', [serviceTypeId]);
    if (!service.length) throw new ApiError(404, 'Service type not found');
  }

  const requestId = id();
  await query(
    `INSERT INTO service_requests
      (id, customer_id, property_id, service_type_id, request_type, title, description, preferred_date, preferred_time_window, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      requestId,
      req.user.id,
      propertyId,
      serviceTypeId,
      requestType,
      title,
      description,
      nullableString(req.body.preferredDate),
      nullableString(req.body.preferredTimeWindow),
      nullableString(req.body.notes),
      'new'
    ]
  );

  const rows = await query(
    `SELECT sr.*, p.name AS property_name, st.name AS service_type_name
     FROM service_requests sr
     JOIN properties p ON p.id = sr.property_id
     LEFT JOIN service_types st ON st.id = sr.service_type_id
     WHERE sr.id = ?`,
    [requestId]
  );
  res.status(201).json({ request: mapServiceRequest(rows[0]) });
}));

apiRouter.patch('/service-requests/:id/status', asyncHandler(async (req, res) => {
  const status = requireString(req.body, 'status');
  const existing = await query(
    'SELECT id FROM service_requests WHERE id = ? AND customer_id = ? LIMIT 1',
    [req.params.id, req.user.id]
  );

  if (!existing.length) {
    throw new ApiError(404, 'Service request not found');
  }

  await query('UPDATE service_requests SET status = ? WHERE id = ?', [status, req.params.id]);
  const rows = await query(
    `SELECT sr.*, p.name AS property_name, st.name AS service_type_name
     FROM service_requests sr
     JOIN properties p ON p.id = sr.property_id
     LEFT JOIN service_types st ON st.id = sr.service_type_id
     WHERE sr.id = ?`,
    [req.params.id]
  );
  res.json({ request: mapServiceRequest(rows[0]) });
}));

apiRouter.get('/documents', asyncHandler(async (req, res) => {
  const propertyId = nullableString(req.query.propertyId);
  const params = [req.user.id];
  let filter = '';

  if (propertyId) {
    await ownedProperty(req.user.id, propertyId);
    filter = 'AND d.property_id = ?';
    params.push(propertyId);
  }

  const rows = await query(
    `SELECT d.*, p.name AS property_name
     FROM documents d
     JOIN properties p ON p.id = d.property_id
     WHERE p.customer_id = ? ${filter}
     ORDER BY d.created_at DESC`,
    params
  );
  res.json({ documents: rows.map(mapDocument) });
}));

apiRouter.get('/notifications', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT * FROM notifications WHERE customer_id = ? ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ notifications: rows.map(mapNotification) });
}));

apiRouter.post('/notifications/test', asyncHandler(async (req, res) => {
  const notificationId = id();
  const title = asString(req.body.title, 'DR HOME - Test notification');
  const body = asString(req.body.body, 'This notification was created by the backend test endpoint.');

  await query(
    `INSERT INTO notifications (id, customer_id, title, body, metadata_json, is_read)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [
      notificationId,
      req.user.id,
      title,
      body,
      safeJson({ type: 'test', source: 'portal' })
    ]
  );

  const rows = await query(
    'SELECT * FROM notifications WHERE id = ? AND customer_id = ? LIMIT 1',
    [notificationId, req.user.id]
  );

  res.status(201).json({ notification: mapNotification(rows[0]) });
}));

apiRouter.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  await query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND customer_id = ?',
    [req.params.id, req.user.id]
  );
  const rows = await query(
    'SELECT * FROM notifications WHERE id = ? AND customer_id = ? LIMIT 1',
    [req.params.id, req.user.id]
  );
  if (!rows.length) throw new ApiError(404, 'Notification not found');
  res.json({ notification: mapNotification(rows[0]) });
}));

apiRouter.patch('/notifications/read-all', asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1 WHERE customer_id = ?', [req.user.id]);
  res.json({ status: 'ok' });
}));

apiRouter.post('/notifications/push-subscriptions', asyncHandler(async (req, res) => {
  const endpoint = requireString(req.body, 'endpoint');
  const payload = safeJson(req.body);

  await query(
    `INSERT INTO push_subscriptions (id, customer_id, endpoint, subscription_json)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE subscription_json = VALUES(subscription_json), updated_at = CURRENT_TIMESTAMP`,
    [id(), req.user.id, endpoint, payload]
  );

  res.status(201).json({ status: 'saved' });
}));

apiRouter.post('/support/messages', asyncHandler(async (req, res) => {
  const supportId = id();
  const propertyId = nullableString(req.body.propertyId);

  if (propertyId) {
    await ownedProperty(req.user.id, propertyId);
  }

  await query(
    `INSERT INTO support_messages (id, customer_id, property_id, subject, message, channel)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      supportId,
      req.user.id,
      propertyId,
      requireString(req.body, 'subject'),
      requireString(req.body, 'message'),
      asString(req.body.channel, 'portal')
    ]
  );

  res.status(201).json({ id: supportId, status: 'new' });
}));

apiRouter.get('/support', asyncHandler(async (_req, res) => {
  res.json({
    support: supportContact()
  });
}));

apiRouter.get('/contact', asyncHandler(async (_req, res) => {
  res.json({ contact: supportContact() });
}));
