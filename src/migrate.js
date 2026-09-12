import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { id } from './utils.js';

async function executeAll(connection, statements) {
  for (const statement of statements) {
    await connection.query(statement);
  }
}

async function one(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows[0] || null;
}

async function ensureCustomer(connection) {
  const existing = await one(connection, 'SELECT id FROM customers WHERE email = ? LIMIT 1', ['login@login.de']);
  if (existing) return existing.id;

  const customerId = id();
  const passwordHash = await bcrypt.hash('123456', 10);

  await connection.execute(
    `INSERT INTO customers (id, customer_code, name, email, phone, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [customerId, 'DRH-DEMO', 'Daniel Ritter', 'login@login.de', '+971 50 000 0000', passwordHash]
  );

  return customerId;
}

async function ensureAdmin(connection) {
  const email = config.admin.email.toLowerCase();
  const existing = await one(connection, 'SELECT id FROM admins WHERE email = ? LIMIT 1', [email]);
  const passwordHash = await bcrypt.hash(config.admin.password, 10);

  if (existing) {
    await connection.execute(
      'UPDATE admins SET name = ?, password_hash = ?, is_active = 1 WHERE id = ?',
      [config.admin.name, passwordHash, existing.id]
    );
    return existing.id;
  }

  const adminId = id();
  await connection.execute(
    `INSERT INTO admins (id, name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [adminId, config.admin.name, email, passwordHash, 'admin', 1]
  );

  return adminId;
}

async function ensureServiceType(connection, slug, name, category, description, duration, cadenceMonths = null) {
  const existing = await one(connection, 'SELECT id FROM service_types WHERE slug = ? LIMIT 1', [slug]);
  if (existing) return existing.id;

  const serviceTypeId = id();
  await connection.execute(
    `INSERT INTO service_types
      (id, slug, name, category, description, estimated_duration, default_cadence_months)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [serviceTypeId, slug, name, category, description, duration, cadenceMonths]
  );
  return serviceTypeId;
}

async function ensureProperty(connection, customerId, name, propertyType, area, city, status, isPrimary) {
  const existing = await one(
    connection,
    'SELECT id FROM properties WHERE customer_id = ? AND name = ? LIMIT 1',
    [customerId, name]
  );
  if (existing) return existing.id;

  const propertyId = id();
  await connection.execute(
    `INSERT INTO properties
      (id, customer_id, name, property_type, area, city, address, status, active_services_count, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [propertyId, customerId, name, propertyType, area, city, `${area}, ${city}`, status, isPrimary ? 3 : 2, isPrimary ? 1 : 0]
  );
  return propertyId;
}

async function seedDemoData(connection) {
  await ensureAdmin(connection);
  const customerId = await ensureCustomer(connection);

  const acId = await ensureServiceType(
    connection,
    'ac-maintenance',
    'AC Maintenance',
    'Cleaning',
    'Cooling, filters, drain and coil inspection',
    '60-90 minutes',
    6
  );
  const plumbingId = await ensureServiceType(
    connection,
    'plumbing',
    'Plumbing',
    'Preventive inspection',
    'Leaks, drainage, fixtures and water supply',
    '45-60 minutes',
    12
  );
  await ensureServiceType(
    connection,
    'electrical',
    'Electrical',
    'Repair',
    'Lights, sockets, circuits and troubleshooting',
    '45-90 minutes',
    null
  );
  await ensureServiceType(
    connection,
    'painting-finishing',
    'Painting & Finishing',
    'Repair',
    'Repairs, touch-ups and repainting',
    'By inspection',
    null
  );
  await ensureServiceType(
    connection,
    'other',
    'Other',
    'General',
    'Tell us what you need',
    'By inspection',
    null
  );

  const opalId = await ensureProperty(connection, customerId, 'Opal Tower - Marina', 'Apartment', 'Dubai Marina', 'Dubai', 'good', true);
  await ensureProperty(connection, customerId, 'Villa Oasis', 'Villa', 'Mira Oasis', 'Dubai', 'due_soon', false);
  await ensureProperty(connection, customerId, 'DR HOME Office', 'Office', 'Business Bay', 'Dubai', 'good', false);

  const appointmentCount = await one(connection, 'SELECT COUNT(*) AS total FROM appointments WHERE customer_id = ?', [customerId]);
  if (appointmentCount.total === 0) {
    await connection.execute(
      `INSERT INTO appointments
        (id, customer_id, property_id, service_type_id, title, scheduled_start, scheduled_end, time_window, status, estimated_duration, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), customerId, opalId, acId, 'AC Maintenance', '2026-09-23 10:00:00', '2026-09-23 12:00:00', '10:00-12:00', 'confirmed', '60-90 minutes', 'Cleaning, filter, drain inspection']
    );
  }

  const planCount = await one(connection, 'SELECT COUNT(*) AS total FROM maintenance_plans WHERE property_id = ?', [opalId]);
  if (planCount.total === 0) {
    await connection.execute(
      `INSERT INTO maintenance_plans
        (id, property_id, service_type_id, title, subtitle, due_date, status, cadence_months)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), opalId, acId, 'AC Maintenance', 'Cleaning - Filter - Drain inspection', '2026-09-23', 'due_soon', 6]
    );
    await connection.execute(
      `INSERT INTO maintenance_plans
        (id, property_id, service_type_id, title, subtitle, due_date, status, cadence_months)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), opalId, plumbingId, 'Water & Plumbing Check', 'Preventive inspection', '2026-12-12', 'scheduled', 12]
    );
  }

  const historyCount = await one(connection, 'SELECT COUNT(*) AS total FROM service_history WHERE property_id = ?', [opalId]);
  if (historyCount.total === 0) {
    await connection.execute(
      `INSERT INTO service_history
        (id, property_id, service_type_id, title, performed_at, technician, status, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), opalId, acId, 'AC Deep Cleaning', '2026-06-18', 'DR HOME Technician', 'completed', 'Filters cleaned, drain flushed and cooling performance checked.']
    );
    await connection.execute(
      `INSERT INTO service_history
        (id, property_id, service_type_id, title, performed_at, technician, status, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), opalId, acId, 'Preventive AC Service', '2025-12-12', 'DR HOME Technician', 'completed', 'Routine maintenance completed. No defects reported.']
    );
  }

  const documentCount = await one(connection, 'SELECT COUNT(*) AS total FROM documents WHERE property_id = ?', [opalId]);
  if (documentCount.total === 0) {
    const docs = [
      ['AC Service Report', 'PDF', 'service_report', '18 Jun 2026', '1.8 MB'],
      ['Invoice - AC Deep Cleaning', 'PDF', 'invoice', '18 Jun 2026', '720 KB'],
      ['Water Tank Cleaning Report', 'PDF', 'service_report', '08 Mar 2026', '1.2 MB'],
      ['Maintenance Photos', 'IMG', 'photos', 'Latest 18 Jun 2026', '12 files']
    ];

    for (const doc of docs) {
      await connection.execute(
        `INSERT INTO documents
          (id, property_id, name, file_type, document_type, document_date_label, file_size_label, file_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), opalId, doc[0], doc[1], doc[2], doc[3], doc[4], null]
      );
    }
  }

  const notificationCount = await one(connection, 'SELECT COUNT(*) AS total FROM notifications WHERE customer_id = ?', [customerId]);
  if (notificationCount.total === 0) {
    const notifications = [
      ['Appointment confirmed', 'AC Maintenance - 23 Sep - 10:00-12:00', false],
      ['AC maintenance due soon', 'Your next preventive AC service is due in 12 days.', false],
      ['New service report available', 'AC Deep Cleaning - 18 Jun 2026', false],
      ['Water tank cleaning completed', '08 Mar 2026', true]
    ];

    for (const item of notifications) {
      await connection.execute(
        `INSERT INTO notifications (id, customer_id, title, body, is_read)
         VALUES (?, ?, ?, ?, ?)`,
        [id(), customerId, item[0], item[1], item[2] ? 1 : 0]
      );
    }
  }
}

export async function migrateAndSeed(pool) {
  const connection = await pool.getConnection();

  try {
    await executeAll(connection, [
      `CREATE TABLE IF NOT EXISTS customers (
        id CHAR(36) PRIMARY KEY,
        customer_code VARCHAR(32) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(64),
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS admins (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS properties (
        id CHAR(36) PRIMARY KEY,
        customer_id CHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        property_type VARCHAR(80) NOT NULL,
        area VARCHAR(120),
        city VARCHAR(120),
        address VARCHAR(500),
        status VARCHAR(50) NOT NULL DEFAULT 'good',
        active_services_count INT NOT NULL DEFAULT 0,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_properties_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS service_types (
        id CHAR(36) PRIMARY KEY,
        slug VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(120),
        description VARCHAR(500),
        estimated_duration VARCHAR(80),
        default_cadence_months INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS appointments (
        id CHAR(36) PRIMARY KEY,
        customer_id CHAR(36) NOT NULL,
        property_id CHAR(36) NOT NULL,
        service_type_id CHAR(36),
        title VARCHAR(255) NOT NULL,
        scheduled_start DATETIME,
        scheduled_end DATETIME,
        time_window VARCHAR(80),
        status VARCHAR(50) NOT NULL DEFAULT 'requested',
        estimated_duration VARCHAR(80),
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_appointments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_appointments_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_appointments_service_type FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS maintenance_plans (
        id CHAR(36) PRIMARY KEY,
        property_id CHAR(36) NOT NULL,
        service_type_id CHAR(36),
        title VARCHAR(255) NOT NULL,
        subtitle VARCHAR(255),
        due_date DATE,
        status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
        cadence_months INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_plans_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_plans_service_type FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS service_history (
        id CHAR(36) PRIMARY KEY,
        property_id CHAR(36) NOT NULL,
        service_type_id CHAR(36),
        title VARCHAR(255) NOT NULL,
        performed_at DATE,
        technician VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'completed',
        summary TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_history_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_history_service_type FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS service_requests (
        id CHAR(36) PRIMARY KEY,
        customer_id CHAR(36) NOT NULL,
        property_id CHAR(36) NOT NULL,
        service_type_id CHAR(36),
        request_type VARCHAR(80) NOT NULL DEFAULT 'general',
        title VARCHAR(255) NOT NULL,
        description TEXT,
        preferred_date DATE,
        preferred_time_window VARCHAR(80),
        notes TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_requests_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_requests_service_type FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS documents (
        id CHAR(36) PRIMARY KEY,
        property_id CHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        file_type VARCHAR(40) NOT NULL,
        document_type VARCHAR(80),
        document_date_label VARCHAR(120),
        file_size_label VARCHAR(80),
        file_url VARCHAR(1000),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_documents_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS notifications (
        id CHAR(36) PRIMARY KEY,
        customer_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        metadata_json JSON,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notifications_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS support_messages (
        id CHAR(36) PRIMARY KEY,
        customer_id CHAR(36) NOT NULL,
        property_id CHAR(36),
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        channel VARCHAR(40) NOT NULL DEFAULT 'portal',
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_support_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_support_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id CHAR(36) PRIMARY KEY,
        customer_id CHAR(36) NOT NULL,
        endpoint VARCHAR(1000) NOT NULL,
        subscription_json JSON NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_push_endpoint (endpoint(255)),
        CONSTRAINT fk_push_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ]);

    await seedDemoData(connection);
  } finally {
    connection.release();
  }
}
