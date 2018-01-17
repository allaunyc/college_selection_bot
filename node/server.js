
var models = require('./models/models.js');

var User = models.User;
var mongoose = require('mongoose');
const mongo = require('connect-mongo');
var MongoStore = mongo(session);
var express = require('express');

var app = express();

mongoose.Promise = global.Promise;

// send text message function
function sendTextMessage(recipientId, messageText, cb) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData, cb);
}

// send API function
function callSendAPI(messageData, cb) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {

      console.log("This is the response", response);
      console.log("This is the BODY:", body);
      console.log("BOT TEXT IS THIS:", messageData.message);
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s",
          messageId, recipientId);
      } else {
        console.log("Successfully called Send API for recipient %s",
          recipientId);
      }
      if (cb) {
        cb();
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });
}

// RECEIEVED MESSAGE function

function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);

  console.log("THIS IS THE MESSAGE WE WANT:", JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  if (messageText) {
  //   var masterList= [];
  //   masterList.push(messageText);

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (messageText) {

      default:
        sendTextMessage(senderID, messageText);
    }
  }
}





app.get('/webhook', function(req, res){
  // find the senderID???
  User.findOne({senderId: senderID}, function(user,error){
    if(user){
      alert("Go delete this user profile")
    }else{
      var newUser = new User({
        major: "",
        location: "",
        completed: false
      });

      newUser.save(function(err, savedUser){
        if(err){
          res.json({failure: true})
        }else{
          res.json({success: true, response: savedUser})
        }
      })

      if(!newUser.completed){
        // Check if user has answered their interested major
        if(!newUser.major){
          sendTextMessage(senderID, "What major are you interested in pursuing?");
          // sendTextMessage would ideally return what the user input in var userInput
          axios.get('https://api.api.ai/api/query', {
            params: {
              v: 20150910,
              lang: 'en',
              timezone: new Date(),
              query: message.text,
              sessionId: senderID,
              contexts: [
                {name: 'add-major'}
              ]
            },
            headers: {
              Authorization: `Bearer ${process.env.API_AI_TOKEN}`
            }
          })
          .then((response) => {
            if(response.result.actionIncomplete){
              sendTextMessage(senderID, result.fulfillment.speech);
              // ASK JAY HOW TO INVOKE FUNCTION AGAIN UNTIL ACTIONIMCOMPLETE IS FALSE
            }else{
              newUser.major = message.text;
              return;
            }
          })
        }

        // Check if user has answered their interested location
        if(!newUser.location){
          sendTextMessage(senderID, "Where in the U.S would you like to study?");
          // WE WANT TO SEND THE MESSAGE, THEN WAIT FOR USER TO POST THEIR REPLY
          // THE REPLY WILL INVOKE RECEVIEDMESSAGE FUNCTION, THAT WOULD GET US THE MESSAGE.TEXT(USER INPUT) TO PASS ON TO API.AI
          axios.get('https://api.api.ai/api/query', {
            params: {
              v: 20150910,
              lang: 'en',
              timezone: new Date(),
              query: message.text,
              sessionId: senderID,
              contexts: [
                {name: 'add-location'}
              ]
            },
            headers: {
              Authorization: `Bearer ${process.env.API_AI_TOKEN}`
            }
          })
          .then((response) => {
            if(response.result.actionIncomplete){
              sendTextMessage(senderID, result.fulfillment.speech);
              // ASK JAY HOW TO INVOKE FUNCTION AGAIN UNTIL ACTIONIMCOMPLETE IS FALSE
            }else{
              newUser.location = message.text;
              return;
            }
          })
        }
        if(newUser.major && newUser.location){
          newUser.completed = true;
          return;
        }
      }

      // make AXIOS CALL TO DB with newUser object

    }
  })
})

app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription

  if (data.object == 'page') {

    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});
