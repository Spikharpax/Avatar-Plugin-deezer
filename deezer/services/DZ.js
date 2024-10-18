/**
 * Deezer library to get an access code from the owner's Deezer account
 * @module DZ
 * Stephane Bascher
 * avatar.home.automation@gmail.com
 * creation date: 2021-02-12
 */
 const {shell} = require('electron');
 const express = require('express');
 const request = require('request');
 const querystring = require('querystring');
 const path = require('path');
 const fs = require('fs-extra');

 var DZ = function DZ (Config) {
   this.Config = Config;
   this.endpoints = {
      redirect_uri: 'http://localhost:'+Config.account.port+'/deezer/callback',
   		resources: 'https://api.deezer.com',
   		userAuth: 'https://connect.deezer.com/oauth/auth.php',
   		accessToken: 'https://connect.deezer.com/oauth/access_token.php/'
 	 };
}


DZ.prototype.getAccessToken = function () {
  return new Promise((resolve, reject) => {
    if (!this.Config.account.access_token) {
      this.getAuthenticate()
      .then(code => this.createSession (this.Config.account.client_id, this.Config.account.client_secret, code))
      .then(result => {
          if (!result)
            return reject("Aucun résultat pour la requete Deezer");

          this.Config.account.access_token = result.accessToken;
          let file = path.resolve(path.normalize(__dirname) + '/../deezer.prop');
          fs.writeJsonSync(file, {"modules": {"deezer": this.Config}});
          resolve(result.accessToken);
      })
      .catch(err => {
        error(err);
      })
    } else {
      resolve(this.Config.account.access_token);
    }
  })
}



 DZ.prototype.getAuthenticate = function () {
    return new Promise((resolve, reject) => {
       var deezerApp = express();
       deezerApp.get('/deezer/callback', function(req, res, next) {
         res.status(200).end();
         deezerServer.close();
         if (!req.param('code')) {
          var err = req.param('error_reason');
          reject("error: "+err);
        } else {
          resolve(req.param('code'));
        }
       })
       var deezerServer = deezerApp.listen(8888);
       loginUrl = this.getLoginUrl(this.Config.account.client_id, this.endpoints.redirect_uri, ['offline_access']);
       shell.openExternal(loginUrl);
    })
}


DZ.prototype.getLoginUrl = function (appId, redirectUrl, perms) {
  if (!perms) perms = ['offline_access'];

  return this.endpoints.userAuth +
    '?' + querystring.stringify({
      app_id			: appId,
      redirect_uri	: redirectUrl,
      perms			: perms
    });
}


 DZ.prototype.createSession = function (appId, secret, code) {
   return new Promise((resolve, reject) => {
      request.get({
        url		: this.endpoints.accessToken,
        qs		: {
          app_id	: appId,
          secret	: secret,
          code	: code
        }
      }, function createSessionResponse (err, r, body) {
        err = catchApiError(err, r, body);
        if (err) return reject(err);

        var parsedResponse = querystring.parse(body);
        if (!parsedResponse.access_token) return reject(body);
        if (!parsedResponse.expires) parsedResponse.expires = 0;
        if (typeof parsedResponse.expires === 'string')
          parsedResponse.expires.replace(/\s*/g, '');
        parsedResponse.expires = +parsedResponse.expires;
        resolve({
          accessToken	: parsedResponse.access_token,
          expires		: parsedResponse.expires
        });
      });
    })
}



DZ.prototype.request = function (accessToken, options) {

  return new Promise((resolve, reject) => {
     // Default `options.fields` to {}
     if ( !options.fields ) {
       options.fields = {};
     }
     // Default `options.method` to HTTP GET and ensure that it is lowercased
     if ( !isHttpMethod(options.method) ) {
       options.method = 'get';
     }
     options.method = options.method.toLowerCase();

     // Build request
     let apiRequest = {
       url		: this.endpoints.resources + '/' + options.resource,
       method	: options.method
     };

     let paramEncoding;
     // Use different field encoding depending on HTTP method
     if (options.method === 'get')
      paramEncoding = 'qs';
     else
      paramEncoding = 'qs';

     // Build field set
     apiRequest[paramEncoding] = options.fields;
     // Always embed access_token as a parameter
     apiRequest[paramEncoding].access_token = accessToken;
     // Communicate w/ Deezer
     request(apiRequest, function apiResponse (err, r, body) {

       // Catch API errors in a standardized way
       err = catchApiError(err, r, body);
       if (err) return reject(err);
       // Attempt to parse response body as form values
       // (see example here: http://developers.deezer.com/api/oauth)
       var parsedResponse;
       try {
         parsedResponse = JSON.parse(body);
         if (parsedResponse.error && parsedResponse.error.message) {
           return reject (parsedResponse.error.message);
         }

         // Handle valid api response
         if ( typeof parsedResponse.status !== 'undefined') {
           return resolve (parsedResponse);
         }

         return resolve(parsedResponse);
       }
       catch (e) {
          reject (body);
       }
     });
  })
 }


function isHttpMethod (str) {
  	if (typeof str !== 'string') return false;
  	var verbExpr = /^get|post|put|delete|trace|options|connect|patch|head$/i;
  	return !!str.match(verbExpr);
}


function catchApiError (err, r, body) {
   	if (err) return err;
   	var status = r.statusCode;
   	if (status !== 200 && body) {
   		try {
   			body = JSON.parse(body);
   			return body;
   		}
   		catch (e) { return body; }
   	}
   	if (!body) return 'An unexpected response was returned from the Deezer API:';
}



 module.exports.DZ = DZ;
