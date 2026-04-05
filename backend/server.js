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
app.use(cors());
app.use(express.json());

// Serve static files from the RasoiHub frontend directory
app.use(express.static(path.join(__dirname, '../RasoiHub')));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'rasoihub_secret_key';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/rasoihub';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

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

// Initial setup helper maybe, but let's just do register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
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
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
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
    console.error(err.message);
    res.status(500).send('Server error');
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
    const { date, time, guests, specialRequests } = req.body;

    const newBooking = new Booking({
      user: req.user.id,
      date,
      time,
      guests,
      specialRequests
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
      const { status } = req.body;
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ msg: 'Booking not found' });
      
      // Admin can change status freely; users might only be able to cancel
      if (req.user.role === 'admin') {
          booking.status = status || booking.status;
      } else {
          if (status === 'Cancelled') {
              booking.status = 'Cancelled';
          }
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
// Catch-all route to serve index.html for any unhandled GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../RasoiHub/index.html'));
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
