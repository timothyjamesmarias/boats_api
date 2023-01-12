const express = require('express');
const bodyParser = require('body-parser');
const {Datastore} = require('@google-cloud/datastore');
const request = require('request');
const { auth } = require('express-openid-connect');
const axios = require("axios").default;
require('dotenv').config();

const app = express();
const router = express.Router();

app.use('/', require('./index'));
router.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));

//Auth0

const config = {
    authRequired: false,
    auth0Logout: true,
    baseURL: process.env.URL,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.ISSUER_URL,
    secret: process.env.CLIENT_SECRET
};

app.use(auth(config));

//login
var options = {
    method: 'PATCH',
    url: 'https://mariast-boats-api.us.auth0.com/api/v2/tenants/settings',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer API2_ACCESS_TOKEN',
      'cache-control': 'no-cache'
    },
    data: {default_redirection_uri: 'https://boats-api-mariast.wl.r.appspot.com/login'}
};

axios.request(options).then(function (response) {
    console.log(response.data);
  }).catch(function (error) {
    console.error(error);
});

//get users
var user_options = {
    method: 'GET',
    url: 'https://mariast-boats-api.us.auth0.com/api/v2/users',
    params: {search_engine: 'v2'},
    headers: {authorization: 'Bearer YOUR_MGMT_API_ACCESS_TOKEN'},
};

app.get('/users', function(req, res){
    axios.request(user_options).then(function (response) {
        res.status(200).send(response);
      }).catch(function (error) {
        console.error(error);
    });
});


//get home page 

app.get('/', function(req, res){
    if (req.oidc.isAuthenticated()){
        res.send(req.oidc.idToken);
    }
    else{
        res.send("you are logged out");
    }
});

//port

const PORT = process.env.PORT || 8080;

app.listen(PORT, () =>{
    console.log(`Server listening on port ${PORT}...`);
});