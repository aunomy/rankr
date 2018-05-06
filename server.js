"use strict";

require('dotenv').config();

const PORT        = process.env.PORT || 8080;
const ENV         = process.env.ENV || "development";
const express     = require("express");
const bodyParser  = require("body-parser");
const mailgun     = require('mailgun.js');
const sass        = require("node-sass-middleware");
const app         = express();
const mg          = mailgun.client({username: 'api', key: process.env.MAILGUN_API_KEY || 'key-yourkeyhere'});

const knexConfig  = require("./knexfile");
const knex        = require("knex")(knexConfig[ENV]);
const morgan      = require('morgan');
const knexLogger  = require('knex-logger');

const pollRoutes = require("./routes/polls")

app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(morgan('dev'));
app.use(knexLogger(knex));
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/api/polls", pollRoutes(knex));
app.use("/styles", sass({
  src: __dirname + "/styles",
  dest: __dirname + "/public/styles",
  debug: true,
  outputStyle: 'expanded'
}));

// Helper
function zeroIndexBorda(votes){
  const options = {};
  const num_of_votes = votes.length;
  const results = {};
  votes.forEach(vote =>{
    options[vote.option_id] = 1;
  })
  const numOfQuestions = Object.keys(options).length;
  votes.forEach(vote => {
    results[vote.option_name] ?
    results[vote.option_name] += Math.abs(Number(numOfQuestions - vote.rank-1))/num_of_votes
    :results[vote.option_name] = Math.abs(Number(numOfQuestions - vote.rank-1))/num_of_votes
  });
  return Object.keys(results).reduce((prev, cur) => {
   prev[cur] = ((results[cur]))*100;
   return prev;
 }, {});
}

// Home page
app.get("/", (req, res) => {
  res.render("index");
});

// Poll page
app.get("/polls/:poll_id/", (req, res) => {
  knex
  .select('poll.question_string','poll.id as poll_id','option.option_name','option.id as option_id')
  .from("poll")
  .join('option', 'poll.id', 'option.poll_id')
  .where('poll.id', req.params.poll_id)
  .then((results) => {
    //ok but what? why does this work, why cant we do this with @?
    res.render("poll", {results: results})
  });
});

// Admin page, need to change link name to incl secretkey
app.get("/polls/:poll_id/:secret_key", (req, res) => {
  const templateVars = {};
  knex
   .select('poll.key','poll.question_string','vote.id','poll_id','key','vote.rank','vote.voter_name','option.option_name','vote.option_id')
   .from("poll")
   .join('option', 'poll.id', 'option.poll_id')
   .join('vote','vote.option_id','option.id')
   .where('poll.id', req.params.poll_id)
   .then((results) => {
    console.log(req.params.secret_key,results[0].key)
      if(req.params.secret_key == results[0].key){
        templateVars['results'] = zeroIndexBorda(results);
        templateVars['quesiton']    = results[0].question_string;
        res.render("admin", templateVars);
      }
      else{
        res.send('error: 404 - <h1>nothing to see here.</h1')
      }
  });
});

// Creating a new poll
app.post('/polls',(req,res) => {
  const templateVars = {};

    function generateSecretKey() {
  return Math.floor((1 + Math.random()) * 0x1000000).toString(16).substring(1);
  };

  let secretKey = generateSecretKey();

  function creatorPromise() {
    return new Promise((resolve,reject) => {
        knex('creator')
        .insert({email:'alice@gmail.com'})
        .returning('id')
        .then((creator_id) => resolve(creator_id))
        .catch(e => reject(e));
      });
  };

  function pollPromise (creator_id){
    return new Promise((resolve, reject) => {
      let question = req.body.question_string;
      templateVars.question_string = question
      knex('poll')
           .insert({ creator_id: Number(creator_id[0]), question_string: question, open:true, key: secretKey})
           .returning('id')
           .then((poll_id) => {
            templateVars.poll_id = poll_id;
            templateVars.secretkey = secretKey;
            resolve(poll_id)
          })
           .catch(e => reject(e));
      });
  };

  function optionPromise (poll_id){
    return new Promise((resolve, reject) => {
      req.body.options.forEach((option, i) => {
        knex('option')
        .insert({option_name: option[0], poll_id: Number(poll_id[0]) }).catch(err => console.log(err))
        .then(resolve())
        .catch(e => reject(e));
      });
    })
  };

creatorPromise()
  .then((creator_id) => pollPromise(creator_id))
  .then((poll_id) => optionPromise(poll_id))
  .then( () => {
    let emailPollURL   = `http://localhost:8080/polls/${templateVars.poll_id}`
    let emailPollHTML  = emailPollURL.link(emailPollURL);
    let emailAdminURL  = `http://localhost:8080/polls/${templateVars.poll_id}/${templateVars.secretkey}`
    let emailAdminHTML = emailAdminURL.link(emailAdminURL);
    res.send(templateVars);
    // mg.messages.create("sandbox37aca15d55444736955d58b502031cba.mailgun.org", {
    //   from: "Rankr <postmaster@sandbox37aca15d55444736955d58b502031cba.mailgun.org>",
    //   to: [/*"aden.collinge@gmail.com",*/ "andreaafinlay@gmail.com"],
    //   subject: "Rankr: Your New Poll!",
    //   html: `<HTML><head></head><body><div>Your poll, ${templateVars.question_string},
    //           has been successfully created!</div>
    //          <div>You can view your new poll at: ${emailPollHTML}</div>
    //          <div>Your secret key is: ${templateVars.secretkey}.</div>
    //          <div>Enter your poll URL plus your secret key into the address bar
    //          to view the results of your poll: ${emailAdminHTML}</div></body></HTML>`
    // })
    // .then(msg => console.log(msg))
    // .catch(err => console.log(err));
  })
  .catch(e => {console.log(e)})
});

// Posting votes from poll page
app.post('/polls/:poll_id',(req,res) => {
  const pollId = (req.params.poll_id);

  function votePromise() {
    return new Promise((resolve, reject) => {
    Object.keys(req.body.options).forEach( option => {
    knex('vote')
      .insert({voter_name: 'Michael', option_id: req.body.options[option].option, rank: req.body.options[option].index})
      .returning('id')
      .then(()=> {
        console.log('should be in the db')
        resolve()
      })
      .catch(e => reject(e));
      });
    });
  }

  function findPollPromise() {
    return new Promise((resolve, reject) => {
      knex('poll').where({
        id: pollId
      }).select('question_string')
        .then(function(question_string) {
        const pollQuestion = question_string[0].question_string;
        mg.messages.create("sandbox37aca15d55444736955d58b502031cba.mailgun.org", {
          from: "Rankr <postmaster@sandbox37aca15d55444736955d58b502031cba.mailgun.org>",
          to: [/*"aden.collinge@gmail.com",*/ "andreaafinlay@gmail.com"],
          subject: "Rankr: Someone Has Voted In Your Poll!",
          html: `<HTML><head></head><body><div>Someone has voted
                      in your poll, ${pollQuestion}!</div>
                 <div>You can view your poll at: </div>
                 <div>Your secret key is: .</div>
                 <div>Enter your poll URL plus your secret key into the address bar
                 to view the current results of your poll: </div></body></HTML>`
        })
      })
    })
  }

votePromise()
  .then(() => {
    console.log("i could totally send an email if i wanted to, i swear.")
    // findPollPromise(pollId)
  })
  .catch(err => console.log(err));
});

app.listen(PORT, () => {
  console.log("Example app listening on port " + PORT);
});
