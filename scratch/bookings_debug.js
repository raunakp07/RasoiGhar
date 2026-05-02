
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000/api' : '/api';
const today = new Date().toISOString().split('T')[0];
let currentUser = null;
let allBookings = [];
let restaurants = [];
let currentFilter = 'all';
let locationSnapshot = { lat: null, lng: null };

function showToast(message, type = 'info', duration = 3500) {
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

async function apiCall(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('token');
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) options.headers.Authorization = `Bearer ${token}`;
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`${API_URL}${endpoint}`, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'API Error');
  }
  return res.json();
}

async function requireAuth(callback) {
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = 'login.html';
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Not authorized');
    callback(await res.json());
  } catch (_) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
  }
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = 'login.html';
}

import { initNavbar as origInitNavbar, initTheme as origInitTheme } from './js/firebase.js';

function initTheme() {
  origInitTheme();
}

function initNavbar() {
  origInitNavbar();
  setTimeout(initPlacesAutocomplete, 1000);
}

function setActiveNav() {
  const current = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (link.getAttribute('href') === current) link.classList.add('active');
  });
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':');
  const hr = parseInt(h, 10);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function isUpcoming(dateStr) {
  return new Date(dateStr + 'T00:00:00') >= new Date(new Date().toDateString());
}

function badgeTone(authStatus) {
  if (authStatus === 'Verified') return 'status-upcoming';
  if (authStatus === 'Flagged') return 'status-past';
  return '';
}

window.showMenu = function(restaurantId) {
  const restaurant = restaurants.find(r => r._id === restaurantId);
  if (!restaurant) return;
  document.getElementById('menuModalTitle').innerHTML = `<i class="fa-solid fa-book-open"></i> ${restaurant.name} Menu`;
  const modal = document.getElementById('menuModal');
  const content = document.getElementById('menuModalContent');
  
  if (restaurant.menuItems && restaurant.menuItems.length > 0) {
    const categories = [...new Set(restaurant.menuItems.map(m => m.category))];
    content.innerHTML = categories.map(cat => {
      const items = restaurant.menuItems.filter(m => m.category === cat);
      return `
        <h3 style="margin-top: 24px; margin-bottom: 12px; color: var(--amber); border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">${cat}</h3>
        <div style="display:flex; flex-direction:column; gap: 16px;">
          ${items.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; background: var(--bg-elevated); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div>
                <div style="font-weight:600; font-size:1.05rem; display:flex; align-items:center; gap:8px;">
                  <i class="fa-solid fa-square-caret-${m.isVeg ? 'up' : 'down'}" style="color:${m.isVeg ? '#22c55e' : '#ef4444'};"></i> ${m.name}
                </div>
                <div style="color:var(--text-secondary); font-size:0.85rem; margin-top:4px;">${m.description || ''}</div>
              </div>
              <div style="font-weight:700; color:var(--text-primary);">₹${m.price}</div>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  } else {
    content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-book-journal-whills"></i><h3>Menu not available</h3><p>This restaurant hasn't uploaded their menu yet.</p></div>`;
  }
  modal.classList.remove('hidden');
};

function initPlacesAutocomplete() {
  const input = document.getElementById('placesSearch');
  if (!input || typeof google === 'undefined' || !google.maps || !google.maps.places) return;
  const autocomplete = new google.maps.places.Autocomplete(input, { types: ['geocode'] });
  autocomplete.addListener('place_changed', async () => {
    const place = autocomplete.getPlace();
    if (!place.geometry) return showToast('Location not found.', 'error');
    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();
    locationSnapshot = { lat, lng };
    document.getElementById('locationStatus').textContent = `Showing restaurants near: ${place.formatted_address}`;
    await loadRestaurants(lat, lng);
  });
}

function renderRestaurantChoices() {
  const wrap = document.getElementById('restaurantList');
  const select = document.getElementById('restaurantSelect');
  if (!wrap || !select) return;

  if (restaurants.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><i class="fa-solid fa-store-slash"></i><h3>No restaurants found</h3><p>Try refreshing your location or browse again.</p></div>`;
    select.innerHTML = '<option value="">No restaurants available</option>';
    return;
  }

  if (!select.value) select.value = restaurants[0]._id;

  wrap.innerHTML = restaurants.map(restaurant => {
    const isSelected = restaurant._id === select.value;
    const imgId = 100 + ((restaurant.name||'').length % 50);
    return `
    <div class="card" style="padding:0; cursor:pointer; border-color: ${isSelected ? 'var(--amber)' : 'var(--border-subtle)'};" onclick="selectRestaurant('${restaurant._id}')">
      <div class="card-img-top" style="background-image: url('https://picsum.photos/id/${imgId}/400/300'); margin:0; width:100%;"></div>
      <div style="padding: 24px; flex-grow: 1; display: flex; flex-direction: column;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
          <h3 style="margin:0; font-size:1.3rem;">${restaurant.name}</h3>
          ${restaurant.distanceKm != null ? `<span style="background:var(--amber-dim); color:var(--amber); padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;">${restaurant.distanceKm} km</span>` : `<span style="background:var(--amber-dim); color:var(--amber); padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:600;"><i class="fa-solid fa-fire"></i> Top</span>`}
        </div>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:16px;">
          <i class="fa-solid fa-utensils" style="color:var(--text-muted); margin-right:4px;"></i> ${restaurant.cuisine} &bull; ${restaurant.city}
        </p>
        <div style="display:flex; gap:16px; font-size:0.85rem; color:var(--text-primary); margin-bottom:24px; font-weight:500;">
          <span><i class="fa-solid fa-star" style="color:var(--amber);"></i> ${restaurant.rating}</span>
          <span><i class="fa-solid fa-indian-rupee-sign" style="color:var(--text-muted);"></i> ${restaurant.averageCost} avg.</span>
        </div>
        <div style="margin-top:auto;">
          <button type="button" class="btn-secondary w-full" onclick="event.stopPropagation(); showMenu('${restaurant._id}')" style="justify-content:center;">
            <i class="fa-solid fa-book-open"></i> View Menu
          </button>
        </div>
      </div>
    </div>
    `;
  }).join('');

  select.innerHTML = restaurants.map(restaurant => `<option value="${restaurant._id}">${restaurant.name}   ${restaurant.city}${restaurant.distanceKm != null ? `   ${restaurant.distanceKm} km` : ''}</option>`).join('');
}

window.selectRestaurant = function(id) {
  document.getElementById('restaurantSelect').value = id;
  renderRestaurantChoices();
};

async function loadRestaurants(lat = null, lng = null) {
  const query = lat != null && lng != null ? `/restaurants/nearby?lat=${lat}&lng=${lng}&radiusKm=25` : '/restaurants';
  restaurants = await apiCall(query);
  renderRestaurantChoices();
}

window.useMyLocation = function() {
  const btn = document.getElementById('locateBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;"></span> Detecting';
  navigator.geolocation.getCurrentPosition(async position => {
    locationSnapshot = { lat: position.coords.latitude, lng: position.coords.longitude };
    document.getElementById('locationStatus').textContent = `Location detected. Showing restaurants near (${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)}).`;
    await loadRestaurants(position.coords.latitude, position.coords.longitude);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Refresh Location';
  }, async () => {
    document.getElementById('locationStatus').textContent = 'Location permission denied. Showing curated restaurants instead.';
    await loadRestaurants();
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Location';
  });
};

async function loadBookings() {
  allBookings = await apiCall('/bookings');
  renderBookings(currentFilter);
}

function renderBookings(filter) {
  const list = allBookings.filter(b => {
    if (filter === 'upcoming') return isUpcoming(b.date);
    if (filter === 'past') return !isUpcoming(b.date);
    if (filter === 'pending') return b.authenticityStatus === 'Pending Review' || b.status === 'Pending';
    return true;
  });

  const el = document.getElementById('bookingsList');
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><h3>No matching bookings</h3><p>Try another filter or create a reservation above.</p></div>`;
    return;
  }

  el.innerHTML = list.map(b => `
    <div class="booking-card">
      <div class="booking-info">
        <div class="booking-restaurant">${b.restaurantName}</div>
        <div class="booking-meta">
          <div class="booking-meta-item"><i class="fa-solid fa-location-dot"></i> ${b.restaurantCity || 'Unknown city'}</div>
          <div class="booking-meta-item"><i class="fa-solid fa-calendar"></i> ${formatDate(b.date)}</div>
          <div class="booking-meta-item"><i class="fa-solid fa-clock"></i> ${formatTime(b.time)}</div>
          <div class="booking-meta-item"><i class="fa-solid fa-users"></i> ${b.guests} guests</div>
          <div class="booking-meta-item"><i class="fa-solid fa-phone"></i> ${b.contactPhone || '-'}</div>
          <div class="booking-meta-item"><i class="fa-solid fa-badge-check"></i> Review: ${b.authenticityStatus}</div>
          <div class="booking-meta-item"><i class="fa-solid fa-info-circle"></i> Booking: ${b.status}</div>
          ${b.adminNotes ? `<div class="booking-meta-item"><i class="fa-solid fa-shield"></i> Admin note: ${b.adminNotes}</div>` : ''}
        </div>
      </div>
      <div class="booking-actions">
        <span class="booking-status ${badgeTone(b.authenticityStatus)}">${b.authenticityStatus}</span>
        <button class="btn-danger" onclick="cancelBooking('${b._id || b.id}')"><i class="fa-solid fa-ban"></i></button>
      </div>
    </div>
  `).join('');
}

window.doFilter = function(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
  btn.classList.add('active');
  renderBookings(filter);
};

window.cancelBooking = async function(id) {
  try {
    await apiCall(`/bookings/${id}`, 'PUT', { status: 'Cancelled' });
    showToast('Booking cancelled.', 'info');
    await loadBookings();
  } catch (err) {
    showToast(err.message || 'Could not cancel booking.', 'error');
  }
};

window.doCreate = async function() {
  const restaurantId = document.getElementById('restaurantSelect').value;
  const date = document.getElementById('bDate').value;
  const time = document.getElementById('bTime').value;
  const guests = parseInt(document.getElementById('bGuests').value, 10);
  const contactPhone = document.getElementById('bPhone').value.trim();
  const specialRequests = document.getElementById('bNotes').value.trim();
  const btn = document.getElementById('createBtn');
  
  if (!restaurantId || !date || !time || !guests || !contactPhone) return showToast('Please select a restaurant and complete all booking details.', 'error');
  if (date < today) return showToast('Choose today or a future date.', 'error');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;"></span> Processing Deposit...';
  
  try {
    const orderData = await apiCall('/bookings/order', 'POST', { restaurantId, date, time, guests, contactPhone, specialRequests, locationSnapshot });
    
    const options = {
      key: orderData.key_id,
      amount: orderData.order.amount,
      currency: "INR",
      name: "RasoiHub",
      description: "Reservation Deposit",
      image: "https://cdn-icons-png.flaticon.com/512/1046/1046784.png",
      order_id: orderData.order.id,
      handler: async function (response) {
        try {
          btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;display:inline-block;"></span> Verifying...';
          const verifyData = await apiCall('/bookings/verify', 'POST', {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
            bookingId: orderData.bookingId
          });
          
          if(verifyData.success) {
            showToast('Payment successful! Booking confirmed.', 'success');
            ['bDate', 'bTime', 'bGuests', 'bNotes'].forEach(id => { document.getElementById(id).value = ''; });
            await loadBookings();
          }
        } catch(verifyErr) {
          showToast(verifyErr.message || 'Payment verification failed.', 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-plus"></i> Request Reservation';
        }
      },
      prefill: {
        name: currentUser ? currentUser.name : "Guest",
        contact: contactPhone
      },
      theme: { color: "#ff6b00" },
      modal: {
        ondismiss: function() {
          showToast('Payment cancelled.', 'info');
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-plus"></i> Request Reservation';
        }
      }
    };
    
    const rzp1 = new Razorpay(options);
    rzp1.on('payment.failed', function (response){
        showToast('Payment Failed. Please try again.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-plus"></i> Request Reservation';
    });
    rzp1.open();
  } catch (err) {
    showToast(err.message || 'Could not initiate payment.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-plus"></i> Request Reservation';
  }
};

document.getElementById('bDate').min = today;
initTheme();
initNavbar();
setActiveNav();
window.doLogout = logout;
requireAuth(async user => {
  currentUser = user;
  if (user.role === 'admin') document.getElementById('adminNavLink').style.display = 'inline-flex';
  document.getElementById('bPhone').value = user.phone || '';
  await Promise.all([loadRestaurants(), loadBookings()]);
  const loader = document.getElementById('loader');
  if(loader) {
      loader.classList.add('hidden');
      setTimeout(() => loader.remove(), 300);
  }
});
