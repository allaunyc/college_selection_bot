var mongoose = require('mongoose');
var connect = process.env.MONGODB_URI;
var Schema = mongoose.Schema;

mongoose.connect(connect);

var userSchema = new Schema({
  data: {
    major: String,
    location: String,
    minPrice: Number,
    maxPrice: Number,
    // colleges: Array,
    scoreType: String,
    minScore: Number,
    maxScore: Number,
    minSalary: Number,
    maxSalary: Number
  },
  currentContext: String,
  completed: Boolean,
  senderId: String
})

var User = mongoose.model('User', userSchema);

module.exports = { User };
