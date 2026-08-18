import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';

const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/schoolbpm';

try {
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${uri}`);
  app.listen(port, host, () => console.log(`API listening on http://${host}:${port}`));
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}
