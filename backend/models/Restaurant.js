const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  cuisine: { type: String, required: true, trim: true },
  averageCost: { type: Number, default: 1200 },
  rating: { type: Number, default: 4.2 },
  seatsAvailable: { type: Number, default: 40 },
  opensAt: { type: String, default: '11:00' },
  closesAt: { type: String, default: '23:00' },
  verificationRequired: { type: Boolean, default: false },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  placeId: { type: String }, // For Google Places Integration
  menuItems: [{
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    category: { type: String, required: true },
    isVeg: { type: Boolean, default: true }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Restaurant', RestaurantSchema);
