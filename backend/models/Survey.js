const mongoose = require('mongoose');

const surveySchema = new mongoose.Schema({
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers: { type: Object, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Survey', surveySchema);
