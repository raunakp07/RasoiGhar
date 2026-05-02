const mongoose = require('mongoose');
const Restaurant = require('./backend/models/Restaurant');
const restaurantSeeds = require('./backend/data/restaurants');
require('dotenv').config();

async function updateDB() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rasoihub', { dbName: process.env.MONGO_DB_NAME || 'rasoihub' });
  await Restaurant.deleteMany({});
  await Restaurant.insertMany(restaurantSeeds);
  console.log('Database updated with new seeds.');
  process.exit(0);
}

updateDB();
