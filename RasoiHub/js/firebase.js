// Custom backend API Base
export const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5000/api' 
  : '/api';

export function showToast(message, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info} toast-icon"></i><span class="toast-text">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// Check with backend if user token is valid
export async function requireAuth(callback) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Not authorized');
    const user = await res.json();
    if (callback) callback(user);
  } catch (err) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }
}

export async function redirectIfLoggedIn() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) window.location.href = 'dashboard.html';
    } catch {
      localStorage.removeItem('token');
    }
  }
}

export async function logout() {
  localStorage.removeItem('token');
  window.location.href = 'login.html';
}

export async function apiCall(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('token');
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) options.headers['Authorization'] = `Bearer ${token}`;
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${endpoint}`, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'API Error');
  }
  return res.json();
}

export function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 20));
}

export function setActiveNav() {
  const current = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (link.getAttribute('href') === current) link.classList.add('active');
  });
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

export function formatTime(timeStr) {
  if (!timeStr) return '-';
  const [h, m] = timeStr.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

export function isUpcoming(dateStr) {
  return new Date(dateStr + 'T00:00:00') >= new Date(new Date().toDateString());
}

export function initTheme() {
  const saved = localStorage.getItem('rasoihub-theme') || 'dark';
  _apply(saved);
  window.toggleTheme = function() {
    _apply(document.body.classList.contains('light-mode') ? 'dark' : 'light');
  };
}

function _apply(mode) {
  const thumb = document.getElementById('themeThumb');
  if (mode === 'light') {
    document.body.classList.add('light-mode');
    if (thumb) thumb.textContent = '☀️';
  } else {
    document.body.classList.remove('light-mode');
    if (thumb) thumb.textContent = '🌙';
  }
  localStorage.setItem('rasoihub-theme', mode);
}