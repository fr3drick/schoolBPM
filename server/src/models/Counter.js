import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: String, // process definition key, e.g. "LR"
  seq: { type: Number, default: 0 },
});

export default mongoose.model('Counter', counterSchema);
