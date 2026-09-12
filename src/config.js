import dotenv from 'dotenv';

dotenv.config();

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: intFromEnv('PORT', 3000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET || 'development_only_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  contact: {
    phone: process.env.CONTACT_PHONE || '055 566 2007',
    whatsapp: process.env.CONTACT_WHATSAPP || '971555662007',
    email: process.env.CONTACT_EMAIL || 'maintenance@drhome.ae',
    website: process.env.CONTACT_WEBSITE || 'https://www.drhome.ae'
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: intFromEnv('DB_PORT', 3306),
    database: process.env.DB_NAME || process.env.MARIADB_DATABASE || 'drhome_maintenance',
    user: process.env.DB_USER || process.env.MARIADB_USER || 'drhome',
    password: process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || 'drhome_password'
  }
};

if (config.nodeEnv === 'production' && config.jwtSecret === 'development_only_change_me') {
  console.warn('JWT_SECRET is using the default development value.');
}
