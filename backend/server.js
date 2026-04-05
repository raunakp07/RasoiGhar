const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const User = require('./models/User');
const Booking = require('./models/Booking');

const app = express();
const FRONTEND_DIR = path.join(__dirname, '../RasoiHub');
const isProduction = process.env.NODE_ENV === 'production';

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

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || (!isProduction ? 'dev-only-jwt-secret' : '');
const MONGO_URI = process.env.MONGO_URI || (!isProduction ? 'mongodb://127.0.0.1:27017/rasoihub' : '');
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'rasoihub';

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

function validateBookingInput({ date, time, guests }) {
  if (!date || !time || !Number.isInteger(guests)) {
    return 'Date, time, and guests are required.';
  }

  if (guests < 1 || guests > 100) {
    return 'Guests must be between 1 and 100.';
  }

  return null;
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

// --- AUTHENTICATION ROUTES ---

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    environment: process.env.NODE_ENV || 'development',
    databaseState: mongoose.connection.readyState,
    databaseName: mongoose.connection.name || MONGO_DB_NAME
  });
});

// Initial setup helper maybe, but let's just do register
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = sanitizeName(req.body.name);
    const email = sanitizeEmail(req.body.email);
    const password = req.body.password || '';

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

    if (err?.name === 'MongoServerError' || err?.name === 'MongooseError') {
      return res.status(500).json({ message: 'Database error while creating account' });
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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const payload = { id: user._id, name: user.name, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: payload });
  } catch (err) {
    console.error('Login error:', err);

    if (err?.name === 'MongoServerError' || err?.name === 'MongooseError') {
      return res.status(500).json({ message: 'Database error while signing in' });
    }

    res.status(500).json({ message: 'Server error during login' });
  }
});

// --- BOOKING ROUTES ---

app.get('/api/bookings', authMiddleware, async (req, res) => {
  try {
    let bookings;
    if (req.user.role === 'admin') {
      bookings = await Booking.find().populate('user', 'name email').sort({ createdAt: -1 });
    } else {
      bookings = await Booking.find({ user: req.user.id }).sort({ createdAt: -1 });
    }
    res.json(bookings);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.post('/api/bookings', authMiddleware, async (req, res) => {
  try {
    const {
      restaurantName = 'RasoiHub',
      date,
      time,
      guests: rawGuests,
      specialRequests = ''
    } = req.body;
    const guests = Number.parseInt(rawGuests, 10);
    const validationError = validateBookingInput({ date, time, guests });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const newBooking = new Booking({
      user: req.user.id,
      restaurantName: String(restaurantName).trim() || 'RasoiHub',
      date,
      time,
      guests,
      specialRequests: String(specialRequests).trim()
    });

    const booking = await newBooking.save();
    res.json(booking);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.delete('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ msg: 'Booking not found' });
    
    // Ensure user owns the booking unless admin
    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await booking.deleteOne();
    res.json({ msg: 'Booking removed' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

app.put('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ msg: 'Booking not found' });

    if (booking.user.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    const {
      restaurantName,
      date,
      time,
      guests: rawGuests,
      specialRequests,
      status
    } = req.body;

    const nextGuests = rawGuests === undefined ? booking.guests : Number.parseInt(rawGuests, 10);
    const nextDate = date || booking.date;
    const nextTime = time || booking.time;
    const validationError = validateBookingInput({ date: nextDate, time: nextTime, guests: nextGuests });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    booking.restaurantName = restaurantName === undefined ? booking.restaurantName : (String(restaurantName).trim() || 'RasoiHub');
    booking.date = nextDate;
    booking.time = nextTime;
    booking.guests = nextGuests;
    booking.specialRequests = specialRequests === undefined ? booking.specialRequests : String(specialRequests).trim();

    if (req.user.role === 'admin' && status) {
      booking.status = status;
    } else if (status === 'Cancelled') {
      booking.status = 'Cancelled';
    }

    await booking.save();
    res.json(booking);
  } catch (err) {
    res.status(500).send('Server Error');
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

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name },
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
    return next();
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
  console.log('MongoDB connected successfully');
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

startServer().catch(err => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
