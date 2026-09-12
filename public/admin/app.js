const state = {
  token: localStorage.getItem('drhome_admin_token') || '',
  admin: null,
  customers: [],
  properties: [],
  serviceTypes: [],
  requests: [],
  appointments: [],
  notifications: [],
  supportMessages: []
};

const els = {
  loginView: document.getElementById('loginView'),
  appView: document.getElementById('appView'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  logoutBtn: document.getElementById('logoutBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  adminName: document.getElementById('adminName'),
  viewTitle: document.getElementById('viewTitle'),
  notice: document.getElementById('notice'),
  stats: document.getElementById('stats'),
  recentRequests: document.getElementById('recentRequests'),
  upcomingAppointments: document.getElementById('upcomingAppointments'),
  requestsTable: document.getElementById('requestsTable'),
  customersTable: document.getElementById('customersTable'),
  propertiesTable: document.getElementById('propertiesTable'),
  appointmentsTable: document.getElementById('appointmentsTable'),
  notificationsList: document.getElementById('notificationsList'),
  supportTable: document.getElementById('supportTable'),
  appointmentForm: document.getElementById('appointmentForm'),
  appointmentCustomer: document.getElementById('appointmentCustomer'),
  appointmentProperty: document.getElementById('appointmentProperty'),
  appointmentService: document.getElementById('appointmentService'),
  appointmentTitle: document.getElementById('appointmentTitle'),
  appointmentStart: document.getElementById('appointmentStart'),
  appointmentEnd: document.getElementById('appointmentEnd'),
  notificationForm: document.getElementById('notificationForm'),
  notificationCustomer: document.getElementById('notificationCustomer'),
  notificationTitle: document.getElementById('notificationTitle'),
  notificationBody: document.getElementById('notificationBody')
};

const titles = {
  dashboard: 'Uebersicht',
  requests: 'Service-Anfragen',
  customers: 'Kunden',
  properties: 'Objekte',
  appointments: 'Termine',
  notifications: 'Benachrichtigungen',
  support: 'Support'
};

const requestStatuses = ['new', 'pending_confirmation', 'confirmed', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const appointmentStatuses = ['requested', 'confirmed', 'rescheduled', 'completed', 'cancelled'];
const supportStatuses = ['new', 'open', 'closed'];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function statusBadge(status) {
  const done = ['completed', 'confirmed', 'closed'].includes(status);
  const open = ['new', 'pending_confirmation', 'open', 'requested'].includes(status);
  return `<span class="badge ${done ? 'done' : open ? 'open' : ''}">${escapeHtml(status || '-')}</span>`;
}

function showNotice(message, isError = false) {
  els.notice.textContent = message;
  els.notice.hidden = false;
  els.notice.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => {
    els.notice.hidden = true;
  }, 4200);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, {
    ...options,
    headers
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Request failed');
  }

  return payload;
}

function setLoggedIn(active) {
  els.loginView.hidden = active;
  els.appView.hidden = !active;
}

async function login(email, password) {
  const payload = await api('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  state.token = payload.token;
  state.admin = payload.admin;
  localStorage.setItem('drhome_admin_token', state.token);
  setLoggedIn(true);
  await loadAll();
}

function logout() {
  state.token = '';
  state.admin = null;
  localStorage.removeItem('drhome_admin_token');
  setLoggedIn(false);
}

async function loadAll() {
  const [me, dashboard, customers, properties, serviceTypes, requests, appointments, notifications, support] = await Promise.all([
    api('/api/admin/auth/me'),
    api('/api/admin/dashboard'),
    api('/api/admin/customers'),
    api('/api/admin/properties'),
    api('/api/admin/service-types'),
    api('/api/admin/service-requests'),
    api('/api/admin/appointments'),
    api('/api/admin/notifications'),
    api('/api/admin/support-messages')
  ]);

  state.admin = me.admin;
  state.customers = customers.customers;
  state.properties = properties.properties;
  state.serviceTypes = serviceTypes.serviceTypes;
  state.requests = requests.requests;
  state.appointments = appointments.appointments;
  state.notifications = notifications.notifications;
  state.supportMessages = support.messages;

  els.adminName.textContent = state.admin.name;
  renderDashboard(dashboard.totals);
  renderCustomers();
  renderProperties();
  renderRequests();
  renderAppointments();
  renderNotifications();
  renderSupport();
  populateForms();
}

function renderDashboard(totals) {
  const statItems = [
    ['Kunden', totals.customers],
    ['Objekte', totals.properties],
    ['Offene Anfragen', totals.openRequests],
    ['Naechste Termine', totals.upcomingAppointments],
    ['Support offen', totals.openSupportMessages]
  ];
  els.stats.innerHTML = statItems.map(([label, value]) => `
    <div class="stat"><span>${label}</span><strong>${value || 0}</strong></div>
  `).join('');

  const recent = state.requests.slice(0, 5);
  els.recentRequests.innerHTML = recent.length ? recent.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.title)}</strong>
      <div class="muted">${escapeHtml(item.customerName)} - ${escapeHtml(item.propertyName)}</div>
      <div>${statusBadge(item.status)}</div>
    </div>
  `).join('') : '<div class="empty">Keine Anfragen vorhanden.</div>';

  const upcoming = state.appointments.slice(0, 5);
  els.upcomingAppointments.innerHTML = upcoming.length ? upcoming.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.title)}</strong>
      <div class="muted">${escapeHtml(item.customerName)} - ${escapeHtml(item.propertyName)}</div>
      <div>${formatDate(item.scheduledStart)}</div>
    </div>
  `).join('') : '<div class="empty">Keine Termine vorhanden.</div>';
}

function renderCustomers() {
  els.customersTable.innerHTML = state.customers.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.customerCode)}</small></td>
      <td>${escapeHtml(item.email)}</td>
      <td>${escapeHtml(item.phone || '-')}</td>
      <td>${item.propertyCount}</td>
      <td>${item.requestCount}</td>
    </tr>
  `).join('');
}

function renderProperties() {
  els.propertiesTable.innerHTML = state.properties.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong>${item.isPrimary ? '<br><small>Primary</small>' : ''}</td>
      <td>${escapeHtml(item.customerName)}</td>
      <td>${escapeHtml(item.propertyType)}</td>
      <td>${escapeHtml([item.area, item.city].filter(Boolean).join(', ') || '-')}</td>
      <td>${statusBadge(item.status)}</td>
    </tr>
  `).join('');
}

function selectHtml(values, selected) {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function renderRequests() {
  els.requestsTable.innerHTML = state.requests.map((item) => `
    <tr data-id="${escapeHtml(item.id)}">
      <td><strong>${escapeHtml(item.customerName)}</strong><br><small>${escapeHtml(item.customerEmail || '')}</small></td>
      <td>${escapeHtml(item.propertyName)}</td>
      <td>${escapeHtml(item.serviceType || item.requestType)}</td>
      <td>${escapeHtml(item.description || item.notes || '-')}<br><small>${formatDate(item.createdAt)}</small></td>
      <td><select data-field="requestStatus">${selectHtml(requestStatuses, item.status)}</select></td>
      <td><button class="row-action" data-action="saveRequest">Speichern</button></td>
    </tr>
  `).join('');
}

function renderAppointments() {
  els.appointmentsTable.innerHTML = state.appointments.map((item) => `
    <tr data-id="${escapeHtml(item.id)}">
      <td><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.serviceType || '-')}</small></td>
      <td>${escapeHtml(item.customerName)}</td>
      <td>${escapeHtml(item.propertyName)}</td>
      <td>${formatDate(item.scheduledStart)}<br><small>${formatDate(item.scheduledEnd)}</small></td>
      <td><select data-field="appointmentStatus">${selectHtml(appointmentStatuses, item.status)}</select></td>
      <td><button class="row-action" data-action="saveAppointment">Speichern</button></td>
    </tr>
  `).join('');
}

function renderNotifications() {
  els.notificationsList.innerHTML = state.notifications.length ? state.notifications.map((item) => `
    <div class="list-item">
      <strong>${escapeHtml(item.title)}</strong>
      <div>${escapeHtml(item.body)}</div>
      <div class="muted">${escapeHtml(item.customerName)} - ${formatDate(item.createdAt)}</div>
    </div>
  `).join('') : '<div class="empty">Keine Benachrichtigungen vorhanden.</div>';
}

function renderSupport() {
  els.supportTable.innerHTML = state.supportMessages.map((item) => `
    <tr data-id="${escapeHtml(item.id)}">
      <td>${escapeHtml(item.customerName)}</td>
      <td>${escapeHtml(item.propertyName || '-')}</td>
      <td><strong>${escapeHtml(item.subject)}</strong><br><small>${escapeHtml(item.channel)}</small></td>
      <td>${escapeHtml(item.message)}</td>
      <td><select data-field="supportStatus">${selectHtml(supportStatuses, item.status)}</select></td>
      <td><button class="row-action" data-action="saveSupport">Speichern</button></td>
    </tr>
  `).join('');
}

function populateForms() {
  const customerOptions = state.customers.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  els.appointmentCustomer.innerHTML = customerOptions;
  els.notificationCustomer.innerHTML = customerOptions;

  els.appointmentService.innerHTML = '<option value="">Kein Service-Typ</option>' + state.serviceTypes.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  updateAppointmentProperties();
}

function updateAppointmentProperties() {
  const customerId = els.appointmentCustomer.value;
  const properties = state.properties.filter((item) => item.customerId === customerId);
  els.appointmentProperty.innerHTML = properties.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabId);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === tabId);
  });
  els.viewTitle.textContent = titles[tabId] || 'Admin';
}

async function saveRequest(row) {
  const id = row.dataset.id;
  const status = row.querySelector('[data-field="requestStatus"]').value;
  await api(`/api/admin/service-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showNotice('Anfrage aktualisiert.');
  await loadAll();
}

async function saveAppointment(row) {
  const id = row.dataset.id;
  const status = row.querySelector('[data-field="appointmentStatus"]').value;
  await api(`/api/admin/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showNotice('Termin aktualisiert.');
  await loadAll();
}

async function saveSupport(row) {
  const id = row.dataset.id;
  const status = row.querySelector('[data-field="supportStatus"]').value;
  await api(`/api/admin/support-messages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  showNotice('Support-Nachricht aktualisiert.');
  await loadAll();
}

function wireEvents() {
  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.loginError.hidden = true;
    try {
      await login(els.email.value, els.password.value);
    } catch (error) {
      els.loginError.textContent = error.message;
      els.loginError.hidden = false;
    }
  });

  els.logoutBtn.addEventListener('click', logout);
  els.refreshBtn.addEventListener('click', async () => {
    try {
      await loadAll();
      showNotice('Daten aktualisiert.');
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  els.appointmentCustomer.addEventListener('change', updateAppointmentProperties);

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.body.addEventListener('click', async (event) => {
    const action = event.target.dataset.action;
    if (!action) return;

    const row = event.target.closest('tr');
    try {
      if (action === 'saveRequest') await saveRequest(row);
      if (action === 'saveAppointment') await saveAppointment(row);
      if (action === 'saveSupport') await saveSupport(row);
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  els.appointmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          customerId: els.appointmentCustomer.value,
          propertyId: els.appointmentProperty.value,
          serviceTypeId: els.appointmentService.value || null,
          title: els.appointmentTitle.value,
          scheduledStart: els.appointmentStart.value,
          scheduledEnd: els.appointmentEnd.value || null,
          status: 'confirmed'
        })
      });
      showNotice('Termin angelegt.');
      els.appointmentForm.reset();
      await loadAll();
    } catch (error) {
      showNotice(error.message, true);
    }
  });

  els.notificationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          customerId: els.notificationCustomer.value,
          title: els.notificationTitle.value,
          body: els.notificationBody.value
        })
      });
      showNotice('Benachrichtigung erstellt.');
      await loadAll();
    } catch (error) {
      showNotice(error.message, true);
    }
  });
}

async function boot() {
  wireEvents();

  if (!state.token) {
    setLoggedIn(false);
    return;
  }

  try {
    setLoggedIn(true);
    await loadAll();
  } catch {
    logout();
  }
}

boot();
