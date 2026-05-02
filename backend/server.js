const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const Razorpay = require('razorpay');
const crypto = require('crypto');
const twilio = require('twilio');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourTestKey',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'YourTestSecret'
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || 'AC_YourTwilioSID',
  process.env.TWILIO_AUTH_TOKEN || 'YourTwilioAuthToken'
);
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const User = require('./models/User');
const Booking = require('./models/Booking');
const Restaurant = require('./models/Restaurant');
const restaurantSeeds = require('./data/restaurants');

const app = express();
const FRONTEND_DIR = path.join(__dirname, '../RasoiHub');
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || (!isProduction ? 'dev-only-jwt-secret' : '');
const MONGO_URI = process.env.MONGO_URI || (!isProduction ? 'mongodb://127.0.0.1:27017/rasoihub' : '');
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'rasoihub';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : null;
}

const allowedOrigins = getAllowedOrigins();
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '1mb' }));

function validateRequiredEnv() {
  const missing = [];

  if (!MONGO_URI) missing.push('MONGO_URI');
  if (!JWT_SECRET) missing.push('JWT_SECRET');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function sanitizeName(name = '') {
  return name.trim().replace(/\s+/g, ' ');
}

function sanitizeEmail(email = '') {
  return email.trim().toLowerCase();
}

function sanitizePhone(phone = '') {
  return phone.replace(/[^\d+]/g, '').trim();
}

function isAdminEmail(email = '') {
  return ADMIN_EMAILS.includes(email);
}

function validateBookingInput({ restaurantId, date, time, guests, contactPhone }) {
  if (!restaurantId || !date || !time || !Number.isInteger(guests) || !contactPhone) {
    return 'Restaurant, date, time, guests, and contact phone are required.';
  }

  if (guests < 1 || guests > 100) {
    return 'Guests must be between 1 and 100.';
  }

  if (contactPhone.length < 10) {
    return 'Please enter a valid contact phone number.';
  }

  return null;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = value => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLng = toRad(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function seedRestaurants() {
  const count = await Restaurant.countDocuments();
  if (count === 0) {
    await Restaurant.insertMany(restaurantSeeds);
    console.log(`Seeded ${restaurantSeeds.length} restaurants`);
  }
}

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Token is not valid' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

// --- AUTHENTICATION ROUTES ---

app.get('/api/health', async (req, res) => {
  const restaurantCount = await Restaurant.countDocuments().catch(() => 0);
  res.json({
    ok: true,
    environment: process.env.NODE_ENV || 'development',
    databaseState: mongoose.connection.readyState,
    databaseName: mongoose.connection.name || MONGO_DB_NAME,
    restaurantCount
  });
});

// Initial setup helper maybe, but let's just do register
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = sanitizeName(req.body.name);
    const email = sanitizeEmail(req.body.email);
    const password = req.body.password || '';
    const phone = sanitizePhone(req.body.phone || '');
    const role = isAdminEmail(email) ? 'admin' : 'user';

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      phone,
      role,
      password: hashedPassword
    });

    await user.save();

    const payload = { id: user._id, name: user.name, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('Register error:', err);

    if (err?.code === 11000) {
      return res.status(400).json({ message: 'User already exists' });
    }

    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = req.body.password || '';

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    if (isAdminEmail(email) && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const payload = { id: user._id, name: user.name, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);

    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/api/restaurants', async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({ rating: -1, name: 1 });
    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ message: 'Could not load restaurants' });
  }
});

app.get('/api/restaurants/nearby', async (req, res) => {
  try {
    const lat = Number.parseFloat(req.query.lat);
    const lng = Number.parseFloat(req.query.lng);
    const radiusKm = Number.parseFloat(req.query.radiusKm || '20');
    const restaurants = await Restaurant.find().lean();

    const decorated = restaurants
      .map(restaurant => {
        const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
        const distanceKm = hasLocation
          ? haversineDistance(lat, lng, restaurant.coordinates.lat, restaurant.coordinates.lng)
          : null;

        return {
          ...restaurant,
          distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1))
        };
      })
      .filter(restaurant => restaurant.distanceKm === null || restaurant.distanceKm <= radiusKm)
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return b.rating - a.rating;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });

    res.json(decorated.slice(0, 12));
  } catch (err) {
    res.status(500).json({ message: 'Could not load nearby restaurants' });
  }
});

// --- BOOKING ROUTES ---


// --- PAYMENT ENDPOINTS ---
app.post('/api/bookings/order', authMiddleware, async (req, res) => {
  try {
    const { restaurantId, date, time, guests, contactPhone, specialRequests, locationSnapshot } = req.body;
    
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
    
    const depositAmount = 500;

    const booking = new Booking({
      user: req.user.id,
      restaurant: restaurant._id,
      restaurantName: restaurant.name,
      restaurantCity: restaurant.city,
      restaurantAddress: restaurant.address,
      date, time, guests, contactPhone, specialRequests, locationSnapshot,
      status: 'Pending',
      paymentStatus: 'Pending',
      amount: depositAmount
    });
    
    const options = {
      amount: depositAmount * 100,
      currency: "INR",
      receipt: `rcpt_${booking._id}`,
    };
    
    const order = await razorpay.orders.create(options);
    booking.orderId = order.id;
    await booking.save();
    
    res.json({ order, bookingId: booking._id, key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_YourTestKey' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to create payment order' });
  }
});

app.post('/api/bookings/verify', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'YourTestSecret';
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', secret)
                                    .update(body.toString())
                                    .digest('hex');
                                    
    if (expectedSignature === razorpay_signature) {
      const booking = await Booking.findById(bookingId).populate('user');
      if (booking) {
        booking.paymentStatus = 'Completed';
        booking.paymentId = razorpay_payment_id;
        booking.status = 'Confirmed';
        await booking.save();
        
        const msgStr = `Hi ${booking.user.name}, your reservation at ${booking.restaurantName} for ${booking.guests} guests on ${booking.date} at ${booking.time} has been confirmed! We have received your deposit of ₹${booking.amount}.`;
        
        try {
          if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID !== 'AC_YourTwilioSID') {
            let phone = booking.contactPhone;
            if(!phone.startsWith('+91')) phone = '+91' + phone;
            // --- TWILIO WHATSAPP TEMPLATE MAPPING ---
            // WhatsApp requires pre-approved templates for automated notifications.
            // 
            // TO EDIT THE MESSAGE:
            // 1. Go to Twilio Console -> Messaging -> Content Template Builder
            // 2. Create a new WhatsApp template with this exact text:
            //    "Welcome to {{1}}! Your table for {{2}} guests on {{3}} at {{4}} has been successfully booked via RasoiHub. We have received your deposit of ₹{{5}}."
            // 3. Submit it for WhatsApp approval (usually takes 1-2 minutes).
            // 4. Once approved, copy the new 'Content SID' (starts with HX...) and replace it below:
            
            await twilioClient.messages.create({
              from: twilioWhatsAppNumber,
              contentSid: 'HX75b84a899d024a9a541faff3c6021fe5', // Custom RasoiHub Welcome Template
              contentVariables: JSON.stringify({
                "1": booking.restaurantName,  // Matches {{1}}
                "2": String(booking.guests),  // Matches {{2}}
                "3": booking.date,            // Matches {{3}}
                "4": booking.time,            // Matches {{4}}
                "5": String(booking.amount)   // Matches {{5}}
              }),
              to: `whatsapp:${phone}`
            });
            console.log('WhatsApp sent successfully to', phone);
          } else {
            console.log('[MOCK WHATSAPP DISPATCH]', msgStr);
          }
        } catch (twErr) {
          console.error('Twilio Error:', twErr);
        }
        
        res.json({ success: true, message: 'Payment verified and booking confirmed.' });
      } else {
        res.status(404).json({ success: false, message: 'Booking not found' });
      }
    } else {
      res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

app.get('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const query = req.user.role === 'admin' ? {} : { user: req.user.id };
    const bookings = await Booking.find(query)
      .populate('restaurant')
      .populate('user', 'name email phone role')
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const {
      restaurantId,
      date,
      time,
      guests: rawGuests,
      contactPhone: rawPhone,
      locationSnapshot = {},
      specialRequests = ''
    } = req.body;

    const guests = Number.parseInt(rawGuests, 10);
    const contactPhone = sanitizePhone(rawPhone || '');
    const validationError = validateBookingInput({ restaurantId, date, time, guests, contactPhone });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found' });
    }

    const newBooking = new Booking({
      user: req.user.id,
      restaurant: restaurant._id,
      restaurantName: restaurant.name,
      restaurantCity: restaurant.city,
      restaurantAddress: restaurant.address,
      date,
      time,
      guests,
      contactPhone,
      specialRequests: String(specialRequests).trim(),
      status: 'Pending',
      authenticityStatus: restaurant.verificationRequired ? 'Pending Review' : 'Verified',
      locationSnapshot: {
        lat: Number.isFinite(Number(locationSnapshot.lat)) ? Number(locationSnapshot.lat) : null,
        lng: Number.isFinite(Number(locationSnapshot.lng)) ? Number(locationSnapshot.lng) : null
      }
    });

    await newBooking.save();
    const booking = await Booking.findById(newBooking._id)
      .populate('restaurant')
      .populate('user', 'name email phone role');
    res.json(booking);
  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

app.delete('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    
    // Ensure user owns the booking unless admin
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await booking.deleteOne();
    res.json({ message: 'Booking removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error' });
  }
});

app.put('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const {
      restaurantId,
      date,
      time,
      guests: rawGuests,
      specialRequests,
      contactPhone: rawPhone,
      status,
      authenticityStatus,
      adminNotes
    } = req.body;

    if (restaurantId) {
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(404).json({ message: 'Restaurant not found' });
      }
      booking.restaurant = restaurant._id;
      booking.restaurantName = restaurant.name;
      booking.restaurantCity = restaurant.city;
      booking.restaurantAddress = restaurant.address;
      if (booking.authenticityStatus === 'Pending Review') {
        booking.authenticityStatus = restaurant.verificationRequired ? 'Pending Review' : 'Verified';
      }
    }

    const nextGuests = rawGuests === undefined ? booking.guests : Number.parseInt(rawGuests, 10);
    const nextDate = date || booking.date;
    const nextTime = time || booking.time;
    const nextPhone = rawPhone === undefined ? booking.contactPhone : sanitizePhone(rawPhone || '');
    const validationError = validateBookingInput({
      restaurantId: booking.restaurant || restaurantId,
      date: nextDate,
      time: nextTime,
      guests: nextGuests,
      contactPhone: nextPhone
    });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    booking.date = nextDate;
    booking.time = nextTime;
    booking.guests = nextGuests;
    booking.contactPhone = nextPhone;
    booking.specialRequests = specialRequests === undefined ? booking.specialRequests : String(specialRequests).trim();

    if (req.user.role === 'admin' && status) {
      booking.status = status;
      if (authenticityStatus) booking.authenticityStatus = authenticityStatus;
      if (adminNotes !== undefined) booking.adminNotes = String(adminNotes).trim();
    } else if (status === 'Cancelled') {
      booking.status = 'Cancelled';
    }

    await booking.save();
    const populated = await Booking.findById(booking._id)
      .populate('restaurant')
      .populate('user', 'name email phone role');
    res.json(populated);
  } catch (err) {
    console.error('Update booking error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.put('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const name = sanitizeName(req.body.name);
    const phone = sanitizePhone(req.body.phone || '');

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone },
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.put('/api/auth/password', authMiddleware, async (req, res) => {
  try {
    const currentPassword = req.body.currentPassword || '';
    const newPassword = req.body.newPassword || '';

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.get('/api/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [totalUsers, totalBookings, pendingReview, flagged, restaurants] = await Promise.all([
      User.countDocuments(),
      Booking.countDocuments(),
      Booking.countDocuments({ authenticityStatus: 'Pending Review' }),
      Booking.countDocuments({ authenticityStatus: 'Flagged' }),
      Restaurant.countDocuments()
    ]);

    const recentBookings = await Booking.find()
      .populate('restaurant')
      .populate('user', 'name email phone role')
      .sort({ createdAt: -1 })
      .limit(8);

    res.json({ totalUsers, totalBookings, pendingReview, flagged, restaurants, recentBookings });
  } catch (err) {
    res.status(500).json({ message: 'Could not load admin overview' });
  }
});

app.get('/api/admin/bookings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('restaurant')
      .populate('user', 'name email phone role')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: 'Could not load admin bookings' });
  }
});

app.put('/api/admin/bookings/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const { authenticityStatus, status, adminNotes = '' } = req.body;
    if (authenticityStatus) booking.authenticityStatus = authenticityStatus;
    if (status) booking.status = status;
    booking.adminNotes = String(adminNotes).trim();

    await booking.save();
    const populated = await Booking.findById(booking._id)
      .populate('restaurant')
      .populate('user', 'name email phone role');

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: 'Could not update booking review' });
  }
});

app.post('/api/admin/restaurants', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      city,
      address,
      cuisine,
      averageCost,
      rating,
      seatsAvailable,
      opensAt,
      closesAt,
      verificationRequired,
      coordinates
    } = req.body;

    if (!name || !city || !address || !cuisine || !coordinates) {
      return res.status(400).json({ message: 'Restaurant details are incomplete' });
    }

    const restaurant = await Restaurant.create({
      name: String(name).trim(),
      city: String(city).trim(),
      address: String(address).trim(),
      cuisine: String(cuisine).trim(),
      averageCost: Number(averageCost) || 1200,
      rating: Number(rating) || 4.2,
      seatsAvailable: Number(seatsAvailable) || 40,
      opensAt: opensAt || '11:00',
      closesAt: closesAt || '23:00',
      verificationRequired: Boolean(verificationRequired),
      coordinates: {
        lat: Number(coordinates.lat),
        lng: Number(coordinates.lng)
      }
    });

    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ message: 'Could not create restaurant' });
  }
});

// Serve static files after API routes so non-GET API requests are never
// intercepted by static middleware in production.
app.use(express.static(FRONTEND_DIR, { fallthrough: false }));

app.get('/js/:file', (req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIR, 'js', req.params.file), err => {
    if (err) next(err);
  });
});

app.get('/css/:file', (req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIR, 'css', req.params.file), err => {
    if (err) next(err);
  });
});
// Serve known HTML entry points explicitly so direct navigation works.
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.get('/:page', (req, res, next) => {
  const page = req.params.page;

  if (!page.endsWith('.html')) {
    return next();
  }

  return res.sendFile(path.join(FRONTEND_DIR, page), err => {
    if (err) next(err);
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API route not found' });
  }

  return res.status(404).send('Not Found');
});

app.use((err, req, res, next) => {
  if ((err?.status === 404 || err?.statusCode === 404) && !req.path.startsWith('/api')) {
    return res.status(404).send('Asset not found');
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({ message: 'Internal server error' });
});

async function startServer() {
  validateRequiredEnv();
  await mongoose.connect(MONGO_URI, {
    dbName: MONGO_DB_NAME,
    serverSelectionTimeoutMS: 10000
  });
  await seedRestaurants();
  console.log('MongoDB connected successfully');
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

startServer().catch(err => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
