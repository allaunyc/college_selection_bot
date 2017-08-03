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
  axios = require('axios');

var app = express();
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

var schoolURL = "https://api.data.gov/ed/collegescorecard/v1/schools";
var api_url = "&api_key=HxDzsIBV5xGSgXes8MdVqYgEGrdc7hWTFj3RStv2";

var object = {
 colleges: 'boston college, purdue university, indiana university',
 price: '$15,000-$45,000',
 major: 'computer',
 location: 1, //0
 SAT: '1350-1450',
 salary: '$65,000-$80,000',
 item1ID: 164924,
 item2ID: 152248,
 item3ID: 151111,
 majorSplit: 'computer',
 minPrice: 15000,
 maxPrice: 45000,
 satMin: 0.7, //1350
 satMax: 1, //1450
 salaryMin: 65000,
 salaryMax: 80000
 }

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

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
  console.log(JSON.stringify(message));

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

    console.log(quickReply);
    console.log("quickreply.payload", quickReplyPayload);

    if (quickReply.payload === 'DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_MAJOR'){
      sendTextMessage(senderID, "What major are you interested in pursuing?");
      return;
    }
    if (quickReply.payload === 'DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_LOCATION'){
      sendTextMessage(senderID, "Where in the US would you like to study?");
      locationQuickReply(senderID);
      return;
    }
    if (quickReply.payload === 'DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_PRICE'){
      sendTextMessage(senderID, "What is your price range for college tuition per year? (min-max )");
      return;
    }
    if (quickReply.payload === '0' || '1' || '2' || '3' || '4' || '5' || '6' || '7' || '8' || '9'){
      sendTextMessage(senderID, "Got it!");
      majorQuickReply(senderID);
      object.location = quickReply.payload;
      return;
    }
    // receivedPostback(event);

    sendTextMessage(senderID, "quickReply tapped");
    return;
  }

  if (messageText) {
  //   var masterList= [];
  //   masterList.push(messageText);

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (messageText) {
      case 'image':
        sendImageMessage(senderID);
        break;

      case 'boston college, purdue university, indiana university':
        sendTextMessage(senderID, 'Nice! Now, tell me a little bit more about yourself.');
        interestsQuickReply(senderID);
        object.colleges = messageText;
        var schoolList = object.colleges.split(',');
        var item1 = schoolList[0].split(' ').join('%20');
        var item2 = schoolList[1].split(' ').join('%20');
        var item3 = schoolList[2].split(' ').join('%20');
        var completeUrl1 = schoolURL + '?school.name=' +item1 +'&_fields=id' + api_url
        var completeUrl2 = schoolURL + '?school.name=' +item2 +'&_fields=id' + api_url
        var completeUrl3 = schoolURL + '?school.name=' +item3 +'&_fields=id' + api_url

        axios.get(completeUrl1)
        .then(function(response) {
          console.log("assinging");
          object.item1ID = response.data.results[0].id;
        })
        .catch(function(error) {
          console.log("error",error);
        })
        axios.get(completeUrl2)
        .then(function(response) {
          object.item2ID = response.data.results[0].id;
        })
        .catch(function(error) {
          console.log("error",error);
        })
        axios.get(completeUrl3)
        .then(function(response) {
          object.item3ID = response.data.results[0].id;
        })
        .catch(function(error) {
          console.log("error",error);
        })
        break;

      case 'gif':
        sendGifMessage(senderID);
        break;

      case 'audio':
        sendAudioMessage(senderID);
        break;

      case 'video':
        sendVideoMessage(senderID);
        break;

      case 'file':
        sendFileMessage(senderID);
        break;

      case 'axios':
        sampleAxios(senderID, object);
        break;

      case 'button':
        sendRegionButton1(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'receipt':
        sendReceiptMessage(senderID);
        break;

      case 'quick reply':
        interestsQuickReply(senderID);
        break;

      case 'read receipt':
        sendReadReceipt(senderID);
        break;

      case 'typing on':
        sendTypingOn(senderID);
        break;

      case 'typing off':
        sendTypingOff(senderID);
        break;

      case 'account linking':
        sendAccountLinking(senderID);
        break;

      case '$15,000-$45,000':
        sendTextMessage(senderID, "Noted!");
        pricesQuickReply(senderID);
        object.price = messageText;
        var priceSplit = object.price.split('-');
        object.minPrice = priceSplit[0].split(',').join('').split('$').join('');
        object.maxPrice = priceSplit[1].split(',').join('').split('$').join('');
        break;

      case 'computer':
        sendTextMessage(senderID, "Awesome! Just a few more questions. What are your SAT or ACT scores (specify range +/- 100)?");
        object.major = messageText;
        object.majorSplit = object.major.split(' ').join('%20');
        break;

      case '1350-1450':
        sendTextMessage(senderID, 'Last thing. Considering the major you told me, what is the ideal range for your projected salary (min-max)?');
        object.SAT = messageText;
        var satSplit = object.SAT.split('-');
        object.satMin = satSplit[0];
        object.satMax = satSplit[1];
        break;

      case '$65,000-$80,000':
        sendTextMessage(senderID, 'Got it! We will generate a list of schools that match your interests:');
        // sendCollegeList(senderID);
        object.salary = messageText;
        var salarySplit = object.salary.split('-');
        object.salaryMin = salarySplit[0].split(',').join('').split('$').join('');
        object.salaryMax = salarySplit[1].split(',').join('').split('$').join('');
        sampleAxios(senderID, object);
        break;

      default:
        sendTextMessage(senderID, messageText);
    }
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
  console.log("LOOK HEREEE");
  console.log(event.postback);

  // The 'payload' param is a developer-defined field which is set in a postback
  // button for Structured Messages.
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " +
    "at %d", senderID, recipientID, payload, timeOfPostback);

  // When a postback is called, we'll send a message back to the sender to
  // let them know it was successful
  if(payload === "GET_STARTED_PAYLOAD"){
    sendTextMessage(senderID, "Hi welcome to Strive! I am here to guide you with your search for the perfect college. Let's begin! ");
    sendTextMessage(senderID, "Tell me 3 colleges you are interested in already.");
  }else{
    sendTextMessage(senderID, "Postback called");
  }
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
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 *
 */
function receivedAccountLink(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code;

  console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/rift.png"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/instagram_logo.gif"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "audio",
        payload: {
          url: SERVER_URL + "/assets/sample.mp3"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendVideoMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "video",
        payload: {
          url: SERVER_URL + "/assets/allofus480.mov"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a file using the Send API.
 *
 */
function sendFileMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "file",
        payload: {
          url: SERVER_URL + "/assets/test.txt"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {


  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendRegionButton1(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Pick a region:",
          buttons:[{
            type: "postback",
            title: "U.S. Service Schools",
            payload: "0"
          }, {
            type: "postback",
            title: "New England (CT, ME, MA, NH, RI, VT)",
            payload: "1"
          }, {
            type: "postback",
            title: "Mid East (DE, DC, MD, NJ, NY, PA)",
            payload: "2"
          }
        ]
        }
      }
    }
  };

  callSendAPI(messageData);
}


function sampleAxios(recipientId, object) {
  console.log(object);
  var idURL = schoolURL + '?id=' + object.item1ID + ',' + object.item2ID + ',' + object.item3ID;
  var majorUrl = '&2014.academics.program_percentage.' + object.majorSplit + '__range=0..1';
  var locationUrl = '&school.region_id=' + object.location;
  var priceUrl = '&2014.cost.attendance.academic_year__range=' + object.minPrice + '..' + object.maxPrice;
  var SATurl = '&2014.admissions.sat_scores.average.overall__range=' + object.satMin + '..' + object.satMax;
  var salaryUrl = '&2011.earnings.6_yrs_after_entry.working_not_enrolled.mean_earnings__range=' + object.salaryMin + '..' + object.salaryMax;
  var totalUrl = idURL + majorUrl + locationUrl + priceUrl + SATurl + salaryUrl;
  axios.get( totalUrl + '&_fields=id,school.name,school.city,school.state,school.school_url,school.price_calculator_url,school.zip' + api_url)
  .then(function(response) {
    console.log("response", response.data);

      var messageData = {
          recipient: {
            id: recipientId
          },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements: [{
                  title: response.data.results['school.name'],
                  subtitle: response.data.results['school.city'] + ',' + response.data.results['school.state'] + ',' + response.data.results['school.zip'],
                  buttons: [{
                    type: "web_url",
                    url: response.data.results['school.school_url'],
                    title: "School link"
                  }, {
                    type: "web_url",
                    url: response.data.results['school.price_calculator_url'],
                    title: "Price Calculator"
                  }],
                }]
              }
            }
          }
        }
        console.log("messageData",messageData);
        callSendAPI(messageData);
    })
    .catch(function(error) {
      console.log(error);
    });
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendCollegeList(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "rift",
            subtitle: "Next-generation virtual reality",
            item_url: "https://www.oculus.com/en-us/rift/",
            image_url: SERVER_URL + "/assets/rift.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/rift/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "touch",
            subtitle: "Your Hands, Now in VR",
            item_url: "https://www.oculus.com/en-us/touch/",
            image_url: SERVER_URL + "/assets/touch.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/touch/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random()*1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: "Peter Chang",
          order_number: receiptId,
          currency: "USD",
          payment_method: "Visa 1234",
          timestamp: "1428444852",
          elements: [{
            title: "Oculus Rift",
            subtitle: "Includes: headset, sensor, remote",
            quantity: 1,
            price: 599.00,
            currency: "USD",
            image_url: SERVER_URL + "/assets/riftsq.png"
          }, {
            title: "Samsung Gear VR",
            subtitle: "Frost White",
            quantity: 1,
            price: 99.99,
            currency: "USD",
            image_url: SERVER_URL + "/assets/gearvrsq.png"
          }],
          address: {
            street_1: "1 Hacker Way",
            street_2: "",
            city: "Menlo Park",
            postal_code: "94025",
            state: "CA",
            country: "US"
          },
          summary: {
            subtotal: 698.99,
            shipping_cost: 20.00,
            total_tax: 57.67,
            total_cost: 626.66
          },
          adjustments: [{
            name: "New Customer Discount",
            amount: -50
          }, {
            name: "$100 Off Coupon",
            amount: -100
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
 // QUICK REPLY FOR PROMPTING THREE INTERESTS
function interestsQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Pick one of the three choices below:",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Major",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_MAJOR"
        },
        {
          "content_type":"text",
          "title":"Location",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_LOCATION"
        },
        {
          "content_type":"text",
          "title":"Price",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_PRICE"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

// Quick reply if PRICE is picked first
function pricesQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Choose one of the two remaining choices below:",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Major",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_MAJOR"
        },
        {
          "content_type":"text",
          "title":"Location",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_LOCATION"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

// Quick reply if LOCATION is picked
function locationQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Pick a region:",
      quick_replies: [
        {
          "content_type":"text",
          "title": "U.S. Service Schools",
          "payload": "0"
        },
        {
          "content_type":"text",
          "title": "New England (CT, ME, MA, NH, RI, VT)",
          "payload": "1"
        },
        {
          "content_type":"text",
          "title": "Mid East (DE, DC, MD, NJ, NY, PA)",
          "payload": "2"
        },
        {
          "content_type":"text",
          "title": "Great Lakes (IL, IN, MI, OH, WI)",
          "payload": "3"
        },
        {
          "content_type":"text",
          "title": "Plains (IA, KS, MN, MO, NE, ND, SD)",
          "payload": "4"
        },
        {
          "content_type":"text",
          "title": "Southeast (AL, AR, FL, GA, KY, LA, MS, NC, SC, TN, VA, WV)",
          "payload": "5"
        },
        {
          "content_type":"text",
          "title": "Southwest (AZ, NM, OK, TX)",
          "payload": "6"
        },
        {
          "content_type":"text",
          "title": "Rocky Mountains (CO, ID, MT, UT, WY)",
          "payload": "7"
        },
        {
          "content_type":"text",
          "title": "Far West (AK, CA, HI, NV, OR, WA)",
          "payload": "8"
        },
        {
          "content_type":"text",
          "title": "Outlying Areas (AS, FM, GU, MH, MP, PR, PW, VI)",
          "payload": "9"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

// Quick reply if PRICE is picked first
function majorQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Choose the remaining choice below:",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Major",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_MAJOR"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
  console.log("Sending a read receipt to mark message as seen");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "mark_seen"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
  console.log("Turning typing indicator on");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
  console.log("Turning typing indicator off");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_off"
  };

  callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome. Link your account.",
          buttons:[{
            type: "account_link",
            url: SERVER_URL + "/authorize"
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll
 * get the message id in a response
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s",
          messageId, recipientId);
      } else {
      console.log("Successfully called Send API for recipient %s",
        recipientId);
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
