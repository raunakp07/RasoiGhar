const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' },
  restaurantName: { type: String, default: 'RasoiHub', trim: true },
  restaurantCity: { type: String, default: '', trim: true },
  restaurantAddress: { type: String, default: '', trim: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  guests: { type: Number, required: true },
  contactPhone: { type: String, required: true, trim: true },
  specialRequests: { type: String, default: '' },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Cancelled', 'Rejected'], default: 'Pending' },
  authenticityStatus: { type: String, enum: ['Pending Review', 'Verified', 'Flagged'], default: 'Pending Review' },
  adminNotes: { type: String, default: '' },
  locationSnapshot: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  paymentId: { type: String, default: '' },
  orderId: { type: String, default: '' },
  paymentStatus: { type: String, enum: ['Pending', 'Completed', 'Failed'], default: 'Pending' },
  amount: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', BookingSchema);
