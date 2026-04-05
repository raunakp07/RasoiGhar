const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurantName: { type: String, default: 'RasoiHub' },
  date: { type: String, required: true },
  time: { type: String, required: true },
  guests: { type: Number, required: true },
  specialRequests: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Cancelled'], default: 'Confirmed' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', BookingSchema);
