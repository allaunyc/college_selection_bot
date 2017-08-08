var mongoose = require('mongoose');
var connect = process.env.MONGODB_URI;
var Schema = mongoose.Schema;

mongoose.connect(connect);

var userSchema = new Schema({
  data: {
    major: String,
    location: String,
    price: Number,
    colleges: Array,
    scores: Array,
    salary: Number
  },
  currentContext: String,
  completed: Boolean,
  senderId: String
})

var User = mongoose.model('User', userSchema);

module.exports = { User };
