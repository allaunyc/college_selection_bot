/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request'),
  axios = require('axios'),
  models = require('./models/models'),
  _ = require('underscore')

var app = express();
var User = models.User;
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
 * Be sure to setup your config values before running this code. You can
 * set them using environment variables or modifying the config file in /config.
 *
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ?
  process.env.MESSENGER_APP_SECRET :
  config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
  (process.env.MESSENGER_VALIDATION_TOKEN) :
  config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and
// assets located at this address.
const SERVER_URL = (process.env.SERVER_URL) ?
  (process.env.SERVER_URL) :
  config.get('serverURL');

var schoolURL = "https://api.data.gov/ed/collegescorecard/v1/schools?";
var api_url = "&api_key=HxDzsIBV5xGSgXes8MdVqYgEGrdc7hWTFj3RStv2";


if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

var dbMajors = [
  {agriculture: ['agriculture']},
  {resources: ['environmental science', 'meteorology']},
  {architecture: ['architecture']},
  {ethnic_cultural_gender: ['ethnic studies']},
  {communication: ['human development', 'communication']},
  {communications_technology: ['communications technology', 'telecommunications']},
  {computer: ['computer science', 'information science']},
  {personal_culinary: ['culinary arts', 'food science']},
  {education: ['education']},
  {engineering: ['engineering']},
  {engineering_technology: ['engineering technology']},
  {language: ['language']},
  {family_consumer_science: ['family consumer science', 'rehabilitation services', 'social work', 'speech pathology and audiology']},
  {legal: ['law', 'crime, law, and justice']},
  {english: ['english']},
  {humanities: ['humanities']},
  {library: ['library']},
  {biological: ['biology', 'animal science', 'biochemistry', 'biotechnology', 'marine biology', 'physiology']},
  {mathematics: ['finance', 'accounting', 'actuarial science', 'mathematics']},
  {public_administration_social_service: ['public administration']},
  {military: ['military science']},
  {multidiscipline: ['multidisciplinary science', 'multidisciplinary studies']},
  {parks_recreation_fitness: ['fitness']},
  {philosophy_religious: ['philosophy']},
  {theology_religious_vocation: ['theology']},
  {physical_science: ['physical science']},
  {science_technology: ['science technology']},
  {psychology: ['psychology']},
  {security_law_enforcement: ['law enforcement']},
  {social_science: ['social science','political science', 'economics', 'anthropology', 'archaeology', 'geoscience', 'geography', 'hospitality', 'sociology']},
  {construction: ['construction']},
  {mechanic_repair_technology: ['mechanics']},
  {precision_production: ['precision production']},
  {transportation: ['transportation']},
  {visual_performing: ['studio art']},
  {health: ['nursing', 'pre-medicine', 'health', 'nutrition']},
  {business_marketing: ['business', 'marketing']},
  {history: ['history']}

]


/*
 * Use your own validation token. Check that the token used in the Webhook
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page.
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
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
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
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

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL.
 *
 */
app.get('/authorize', function(req, res) {
  var accountLinkingToken = req.query.account_linking_token;
  var redirectURI = req.query.redirect_uri;

  // Authorization Code should be generated per user by the developer. This will
  // be passed to the Account Linking callback.
  var authCode = "1234567890";

  // Redirect users to this URI on successful login
  var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

  res.render('authorize', {
    accountLinkingToken: accountLinkingToken,
    redirectURI: redirectURI,
    redirectURISuccess: redirectURISuccess
  });
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');
    console.log(expectedHash);

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to
 * Messenger" plugin, it is the 'data-ref' field. Read more at
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger'
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam,
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've
 * created. If we receive a message with an attachment (image, video, audio),
 * then we'll simply confirm that we've received the attachment.
 *
 */
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
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;

  if (isEcho) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s",
      messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);
    return;
  }

  var foundUser;
  if (messageText) {
    User.findOne({senderId: senderID})
    .then(function(temp){
      foundUser = temp;
      var userContext = foundUser.currentContext;
      return sendQuery(messageText, senderID, userContext);
    })
    .then(({ data }) => {
      console.log('APIAI', data);
      if (data.result.action === 'input.unknown' || data.result.actionIncomplete) {
        sendTextMessage(senderID, data.result.fulfillment.speech);
        throw new Error();
      } else {
        console.log(foundUser.currentContext);
        console.log(data.result.parameters, "params");
        if (foundUser.currentContext === 'add-major') {
          foundUser.data.major  = data.result.parameters['major'];
          //

          _.mapObject(dbMajors, function(val, key) {
            if(val.length>1){
              for(var i=0; i<val.length; i++){
                if(val[i] === foundUser.data.major){
                  foundUser.data.major = key;
                }
              }
            }else{
              foundUser.data.major = val[0];
            }
          })



          // dbMajors.forEach(function(major) {
          //     major.forEach(function(arr, key){
          //       for(var i=0; i<arr.length; i++){
          //         if(arr[i] === foundUser.data.major){
          //           foundUser.data.major = key;
          //         }
          //       }
          //
          //     })
          // })

          console.log("inside major",foundUser.data.major);
        } else if (foundUser.currentContext === 'add-location') {
            // if(data.result.parameters['geo-city']){
            //   foundUser.data.location = data.result.parameters['geo-city'];
            // }
            if(data.result.parameters['region1']){
              foundUser.data.location = data.result.parameters['region1'];
            }
        } else if (foundUser.currentContext === 'add-price') {
            if(typeof data.result.parameters['price-min'] === 'object'){
              console.log('obj min');
              foundUser.data.minPrice = data.result.parameters['price-min'].amount;
            } else {
            foundUser.data.minPrice = data.result.parameters['price-min'].replace(',', '');
            }

            if(typeof data.result.parameters['price-max'] === 'object'){
              console.log('obj max');
              foundUser.data.maxPrice = data.result.parameters['price-max'].amount;
            }else{
              foundUser.data.maxPrice = data.result.parameters['price-max'].replace(',', '');
            }
           // CORRECT PARAM
        } else if (foundUser.currentContext === 'add-college') {
          foundUser.data.colleges = data.result.parameters['college'];

          console.log(foundUser.data.colleges);
          console.log("look here for college string", foundUser.data.colleges[0], foundUser.data.colleges[1], foundUser.data.colleges[2]);
        } else if (foundUser.currentContext === 'add-SAT-or-ACT') {
          if (data.result.parameters['act-min'] && data.result.parameters['act-max']){
            foundUser.data.minScore = data.result.parameters['act-min'];
            foundUser.data.maxScore = data.result.parameters['act-max'];
            foundUser.data.scoreType = "act";

          }else if (data.result.parameters['sat-min'] && data.result.parameters['sat-max']){
            foundUser.data.minScore = data.result.parameters['sat-min'];
            foundUser.data.maxScore = data.result.parameters['sat-max'];
            foundUser.data.scoreType = "sat";
          }
        } else if (foundUser.currentContext === 'add-salary') {
          if(typeof data.result.parameters['salary-min'] === 'object'){
            console.log('obj min');
            foundUser.data.minSalary = data.result.parameters['salary-min'].amount; //CORRECT PARAM
          } else {
            foundUser.data.minSalary = data.result.parameters['salary-min'].replace(',', ''); //CORRECT PARAM
          }

          if(typeof data.result.parameters['salary-max'] === 'object'){
            console.log('obj max');
            foundUser.data.maxSalary = data.result.parameters['salary-max'].amount;
          }else{
            foundUser.data.maxSalary = data.result.parameters['salary-max'].replace(',', '');
          }
        }
        var next = getNextState(foundUser);
        if (next === null) {
          foundUser.completed = true;
          sendTextMessage(senderID, "Awesome! In addition to the schools you mentioned earlier, let me pull up a list that matches your criteria!", function(){
            sendTextMessage(senderID, "Keep in mind that the results may vary depending on your specifications.");
            dbQuery(senderID, foundUser);
          });
          return;
        }
        foundUser.currentContext = next;
        console.log(foundUser.currentContext);
        foundUser.save();
        return data;
      }
    })
    .then((data1) => {
      console.log(data1);
      if(data1 === undefined){
        return;
      }
      if(data1.result.parameters['major']){
        sendTextMessage(senderID, (data1.result.fulfillment.speech));
        return;
      }
      sendTextMessage(senderID, data1.result.fulfillment.speech);
    })
    .catch(function(err) {
      // do nothing
      console.log(err);
    })
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s",
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 *
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;
  // console.log("LOOK HEREEE");
  // console.log(event.postback);

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  if(payload === "GET_STARTED_PAYLOAD"){
    sendTextMessage(senderID, "Hi welcome to Strive! I am here to guide you with your search for the perfect college. Let's begin! ", function() {

      User.findOne({ senderId: senderID })
      .then(function(user){
        if (user){
          user.data = {};
          user.completed = false;
        } else {
          user = new User({
            data: {},
            completed: false,
            senderId: senderID
          });
        }
        return user.save();
      })
      .then(function(savedUser) {
        var next = getNextState(savedUser);
        savedUser.currentContext = next;
        return savedUser.save();
      })
      .then(function(savedUser) {
        sendTextMessage(senderID, getPrompt(savedUser.currentContext));
      });
    });
  } else{
    sendTextMessage(senderID, "Postback called");
  }
}

// Sends message with API.AI w/ user message content and context it was sent in
function sendQuery(message, senderID, context) {
  console.log('SENDQUERY', context);
  return axios.post('https://api.api.ai/api/query?v=20150910', {
    lang: 'en',
    timezone: new Date(),
    query: message,
    sessionId: senderID,
    contexts: [
      { name: context }
    ],
    resetContexts: true
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.API_AI_TOKEN}`
    }
  });
}

// // TODO: randomize prompt
function getPrompt(state) {
  if (state === 'add-major') {
    return 'What major are you interested in pursuing?';
  } else if (state === 'add-location') {
    return 'Where in the U.S would you like to study (city or state)?';
  } else if (state === 'add-price') {
    return 'What is your price range for college tuition per year? (min-max )';
  } else if (state === 'add-college') {
    return 'What are three colleges that you might be interested in already?'; //FIX COLLEGES
  } else if (state === 'add-SAT-or-ACT') {
    return 'Now, can you tell me your highest score range on either the SAT (+/- 250) or ACT (+/- 5)?'; //FIX SCORES
  } else if (state === 'add-salary') {
    return 'Considering the major you told me, what would be your ideal projected salary range?'; //FIX TUITION
  } else {
    return 'You are done';
  }
}

// Assigns new state of context, until it has gone through all the required states
function getNextState(user) {
  if (user.completed) {
    return null;
  }
  console.log(user);
  var state = [user.data.major, user.data.location, user.data.minPrice, user.data.minScore, user.data.colleges, user.data.minSalary];
  for (var i = 0; i < state.length; i++) {
    // IF A KEY HAS NOT BEEN ASSIGNED A VALUE YET
    if (!state[i] || (Array.isArray(state[i]) && state[i].length === 0)) {
      if (i === 0) {
        return 'add-major';
      } else if (i === 1) {
        return 'add-location';
      } else if (i === 2) {
        return 'add-price';
      } else if (i === 3) {
        return 'add-SAT-or-ACT';
      } else if (i === 4) {
        return 'add-college';
      } else if (i === 5) {
        return 'add-salary';
      }
    }
  }
  return null;
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 *
 */
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}


/*
 * Send a text message using the Send API.
 *
 */
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

function dbQuery(recipientId, user) {
  // console.log(object);

  var majorUrl = '&2014.academics.program_percentage.' + user.data.major + '__range=0..1';
  var locationUrl = '&school.region_id=' + user.data.location;
  var priceUrl = '&2014.cost.attendance.academic_year__range=' + user.data.minPrice + '..' + user.data.maxPrice;
  var scoreUrl;
  if(user.data.scoreType === "sat"){
    scoreUrl = '&2014.admissions.sat_scores.average.overall__range=' + user.data.minScore + '..' + user.data.maxScore;
  }
  if(user.data.scoreType === "act"){
    scoreUrl = '&2014.admissions.act_scores.midpoint.cumulative__range=' + user.data.minScore + '..' + user.data.maxScore;
  }
  var salaryUrl = '&2011.earnings.6_yrs_after_entry.working_not_enrolled.mean_earnings__range=' + user.data.minSalary + '..' + user.data.maxSalary;
  var totalUrl = schoolURL + majorUrl + locationUrl + priceUrl + scoreUrl + salaryUrl;
  console.log("Look here for the totalURL", totalUrl);


  // /////////////
    // MAKE THREE AXIOS REQUESTS IN ARRAY, THEN DO PROMISE.ALL THAT GIVES US THE THREE OBJECTS as THE RESPONSE
    console.log("The college list represented as an array", user.data.colleges);
    var schoolList = user.data.colleges;
    var item1 = schoolList[0].split(' ').join('%20');
    var item2 = schoolList[1].split(' ').join('%20');
    var item3 = schoolList[2].split(' ').join('%20');
    var completeUrl1 = schoolURL + 'school.name=' +item1 +'&_fields=id,school.name,school.city,school.state,school.school_url,school.price_calculator_url,school.zip' + api_url;
    var completeUrl2 = schoolURL + 'school.name=' +item2 +'&_fields=id,school.name,school.city,school.state,school.school_url,school.price_calculator_url,school.zip' + api_url;
    var completeUrl3 = schoolURL + 'school.name=' +item3 +'&_fields=id,school.name,school.city,school.state,school.school_url,school.price_calculator_url,school.zip' + api_url;
    var promiseArr = [axios.get(completeUrl1), axios.get(completeUrl2), axios.get(completeUrl3)];

    Promise.all(promiseArr)
    .then((response1) => {

    var schoolElements = response1.map(res => res.data.results);
    console.log('schoolElements array of objects', schoolElements[0]);
    var elements = [];
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < schoolElements[i].length; j++) {

      var school = schoolElements[i][j];

      if(school['school.name'].split(' ').join('%20') === item1 || school['school.name'].split(' ').join('%20') === item2 || school['school.name'].split(' ').join('%20') === item3){

        elements.push({
          title: school['school.name'],
          subtitle: school['school.city'] + ',' + school['school.state'] + ',' + school['school.zip'],
          buttons: [{
            type: "web_url",
            url: school['school.school_url'],
            title: "School link"
          }, {
            type: "web_url",
            url: school['school.price_calculator_url'],
            title: "Price Calculator"
          }],
        })
    }
    }
  }
    axios.get( totalUrl + '&_fields=id,school.name,school.city,school.state,school.school_url,school.price_calculator_url,school.zip' + api_url)
    .then(function(response) {
      console.log("response from DB api", response.data);
      console.log("these should be the three schools the user specified, added to the front of the master college list", elements);
      for (var i = 0; i < Math.min(7, response.data.results.length); i++) {
        var dbSchool = response.data.results[i];
        elements.push({
          title: dbSchool['school.name'],
          subtitle: dbSchool['school.city'] + ',' + dbSchool['school.state'] + ',' + dbSchool['school.zip'],
          buttons: [{
            type: "web_url",
            url: dbSchool['school.school_url'],
            title: "School link"
          }, {
            type: "web_url",
            url: dbSchool['school.price_calculator_url'],
            title: "Price Calculator"
          }],
        })
      }
        var messageData = {
            recipient: {
              id: recipientId
            },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: elements
                }
              }
            }
          }

          // console.log("messageData",JSON.stringify(messageData, null, 4));
          callSendAPI(messageData);
      })
  })
  .catch(function(error) {
    console.log("error",error);
  })

}
  // /////////////



/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData, cb) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {

      // console.log("This is the response", response);
      // console.log("This is the BODY:", body);
      // console.log("BOT TEXT IS THIS:", messageData.message);
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

// Start server
// Webhooks must be available via SSL with a certificate signed by a valid
// certificate authority.
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
