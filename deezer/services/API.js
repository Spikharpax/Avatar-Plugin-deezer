/**
 * Deezer API library
 * @module API
 * Stephane Bascher
 * avatar.home.automation@gmail.com
 * creation date: 2021-02-12
 */

const soundex  = require('./soundex.js').soundex;
const clj_fuzzy = require('clj-fuzzy');
const _ = require('underscore');

var DZAPI = function DZAPI (DZ, lexic, search_lexic) {
   this.DZ = DZ;
   this.lexic = lexic;
   this.search_lexic = search_lexic;
}


DZAPI.prototype.getMeArtists = function (value) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/user/me/artists',
  			method: 'get'
  	}))
    .then(result => {
      if (!value) return resolve(result.data);

      let artistsMatched = [];
      let sdx = soundex(value);
      let score = 0;
      result.data.forEach(artist => {
        if (this.getLevenshteinDistance(sdx, artist.name, score))
          artistsMatched.push (artist);
      });
      resolve(artistsMatched);
    })
    .catch(err => {
      reject ("getMeArtists:: "+err);
    })
  })
}


DZAPI.prototype.getMePlaylists = function (value) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/user/me/playlists',
  			method: 'get'
  	}))
    .then(result => {
      if (!value) return resolve(result.data);

      let playlistsMatched = [];
      let sdx = soundex(value);
      let score = 0;
      result.data.forEach(playlist => {
        if (this.getLevenshteinDistance(sdx, playlist.title, score))
          playlistsMatched.push (playlist);
      });
      resolve(playlistsMatched);
    })
    .catch(err => {
      reject ("getMePlaylists:: "+err);
    })
  })
}


DZAPI.prototype.getMeTracks = function (value) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/user/me/tracks',
  			method: 'get'
  	}))
    .then(result => {
      if (!value) return resolve(result.data);

      let tracksMatched = [];
      let sdx = soundex(value);
      let score = 0;
      result.data.forEach(track => {
        if (this.getLevenshteinDistance(sdx, track.title, score))
          tracksMatched.push (track);
      });
      resolve(tracksMatched);
    })
    .catch(err => {
      reject ("getMeTracks:: "+err);
    })
  })
}



DZAPI.prototype.getMeAlbums = function (type, value) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/user/me/albums',
  			method: 'get'
  	}))
    .then(result => {
      if (!type || !value) return resolve(result.data);

      let albumsMatched = [];
      let sdx = soundex(value);
      let score = 0;
      result.data.forEach(album => {
        if (this.getLevenshteinDistance(sdx, (type === 'artist' ? album[type].name : album[type]), score))
          albumsMatched.push (album);
      });
      resolve(albumsMatched);
    })
    .catch(err => {
      reject ("getMeAlbums:: "+err);
    })
  })
}


DZAPI.prototype.getGenres = function () {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/genre',
  			method: 'get'
  	}))
    .then(result => {
      result = _.filter(result.data, function(num){return num.name != 'All';});
      resolve(result);
    })
    .catch(err => {
      reject ("getGenres:: "+err);
    })
  })
}


function asyncGetAlbumsByGenre (Deezer, genre, result, pos, albumsMatched, callback) {

  if (pos >= result.length) {
    callback(albumsMatched);
    return;
  }

  if (result[pos].album) {
    let even = _.find(albumsMatched, function(num){ return num.id == result[pos].album.id;});
    if (!even) {
      Deezer.getAccessToken()
      .then(accessToken => Deezer.request(accessToken,
    	{
    			resource: '/album/'+result[pos].album.id,
    			method: 'get'
    	}))
      .then(album => {
        albumsMatched.push(album);
        asyncGetAlbumsByGenre (Deezer, genre, result, ++pos, albumsMatched, callback);
      })
      .catch(err => {
        asyncGetAlbumsByGenre (Deezer, genre, result, ++pos, albumsMatched, callback);
      })
    } else {
      asyncGetAlbumsByGenre (Deezer, genre, result, ++pos, albumsMatched, callback);
    }
  } else {
    asyncGetAlbumsByGenre (Deezer, genre, result, ++pos, albumsMatched, callback);
  }

}


DZAPI.prototype.getAlbumsByGenre = function (speak, max, genre) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/search?q=label:"'+genre+'"',
  			method: 'get'
  	}))
    .then(result => {
      return new Promise((res, rej) => {
        if (result.data.length == 0) return resolve([]);
        asyncGetAlbumsByGenre (this.DZ, genre, result.data, 0, [], albums => {
          if (result.total > result.data.length) {
            let count = Math.floor((result.total-25)/result.data.length);
            if (max && typeof max === 'number')
              count = (count > max) ? max : count;
            getAllAlbumsByGenre(speak, this.DZ, genre, albums, 1, count, values => {
              res(values);
            })
          } else
             res(albums);
        })
      })
    })
    .then(albums => {
      isSpeak = null;
      resolve(albums);
    })
    .catch(err => {
      isSpeak = null;
      reject ("getGenres:: "+err);
    })
  })
}


let isSpeak;
function getAllAlbumsByGenre(speak, DZ, genre, albums, pos, count, callback) {

  let index = 25*pos;

  if (index > count) {
    callback(albums);
    return;
  }

  if (!isSpeak && count > 100 && index >= (count / 2)) {
    speak();
    isSpeak = true;
  }

  DZ.getAccessToken()
  .then(accessToken => DZ.request(accessToken,
  {
      resource: '/search?q=label:"'+genre+'"&index='+index,
      method: 'get'
  }))
  .then(result => {
    if (result.data.length == 0) {
      callback(albums);
      return;
    }
    asyncGetAlbumsByGenre (DZ, genre, result.data, 0, albums, values => {
      getAllAlbumsByGenre(speak, DZ, genre, values, ++pos, count, callback);
    })
  })
  .catch(err => {
    callback(albums);
    return;
    console.log("getGenres:: "+err);
  })
}



function asyncGetAlbumsByArtist (Deezer, artist, result, pos, albumsMatched, callback) {

  if (pos >= result.length) {
    callback(albumsMatched);
    return;
  }

  if (result[pos].album) {
    let even = _.find(albumsMatched, function(num){ return num.id == result[pos].album.id;});
    if (!even) {
      Deezer.getAccessToken()
      .then(accessToken => Deezer.request(accessToken,
    	{
    			resource: '/album/'+result[pos].album.id,
    			method: 'get'
    	}))
      .then(album => {
        albumsMatched.push(album);
        asyncGetAlbumsByArtist (Deezer, artist, result, ++pos, albumsMatched, callback);
      })
      .catch(err => {
        asyncGetAlbumsByArtist (Deezer, artist, result, ++pos, albumsMatched, callback);
      })
    } else {
      asyncGetAlbumsByArtist (Deezer, artist, result, ++pos, albumsMatched, callback);
    }
  } else {
    asyncGetAlbumsByArtist (Deezer, artist, result, ++pos, albumsMatched, callback);
  }

}



DZAPI.prototype.getArtist = function (speak, max, artist) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/search?q="'+artist+'"',
  			method: 'get'
  	}))
    .then(result => {
      return new Promise((res, rej) => {
        if (result.data.length == 0) return resolve([]);
        asyncGetAlbumsByArtist (this.DZ, artist, result.data, 0, [], albums => {
          if (result.total > result.data.length) {
            let count = Math.floor((result.total-25)/result.data.length);
            if (max && typeof max === 'number')
              count = (count > max) ? max : count;
            getAllAlbumsByArtist(speak, this.DZ, artist, albums, 1, count, values => {
              res(values);
            })
          } else
             res(albums);
        })
      })
    })
    .then(albums => {
      isSpeak = null;
      resolve(albums);
    })
    .catch(err => {
      isSpeak = null;
      reject ("getArtist:: "+err);
    })
  })
}


function getAllAlbumsByArtist(speak, DZ, artist, albums, pos, count, callback) {

  if (pos >= count) {
    callback(albums);
    return;
  }

  let index = 25*pos;

  if (!isSpeak && speak && albums.length > 49) {
    speak();
    isSpeak = true;
  }

  DZ.getAccessToken()
  .then(accessToken => DZ.request(accessToken,
  {
      resource: '/search?q="'+artist+'"&index='+index,
      method: 'get'
  }))
  .then(result => {
    if (result.data.length == 0) {
      callback(albums);
      return;
    }
    asyncGetAlbumsByArtist (DZ, artist, result.data, 0, albums, values => {
      getAllAlbumsByArtist(speak, DZ, artist, values, ++pos, count, callback);
    })
  })
  .catch(err => {
    callback(albums);
    return;
    console.log("getArtist:: "+err);
  })
}


DZAPI.prototype.getTracks = function (title, artist) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/search?q=track:"'+title+'"'+(artist ? ' artist:"'+artist+'"' : ""),
  			method: 'get'
  	}))
    .then(result => {
      if (result.data.length == 0) return resolve([]);
      resolve(result.data);
    })
    .catch(err => {
      reject ("getTracks:: "+err);
    })
  })
}


DZAPI.prototype.getRadio = function (radio) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/search/radio?q='+radio,
  			method: 'get'
  	}))
    .then(result => {
      if (result.data.length == 0) return resolve([]);
      resolve(result.data);
    })
    .catch(err => {
      reject ("getRadio:: "+err);
    })
  })
}


function asyncGetAlbums (Deezer, title, result, pos, albumsMatched, callback) {

  if (pos >= result.length) return callback(albumsMatched);

  if (result[pos].album && result[pos].album.title.toLowerCase() == title.toLowerCase()) {
    let even = _.find(albumsMatched, function(num){ return num.id == result[pos].album.id;});
    if (!even) {
      Deezer.getAccessToken()
      .then(accessToken => Deezer.request(accessToken,
    	{
    			resource: '/album/'+result[pos].album.id,
    			method: 'get'
    	}))
      .then(album => {
        albumsMatched.push(album);
        asyncGetAlbums (Deezer, title, result, ++pos, albumsMatched, callback);
      })
      .catch(err => {
        asyncGetAlbums (Deezer, title, result, ++pos, albumsMatched, callback);
      })
    } else {
      asyncGetAlbums (Deezer, title, result, ++pos, albumsMatched, callback);
    }
  } else {
    asyncGetAlbums (Deezer, title, result, ++pos, albumsMatched, callback);
  }

}


DZAPI.prototype.getAlbums = function (title, artist) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/search?q=album:"'+title+'"'+(artist ? ' artist:"'+artist+'"' : ""),
  			method: 'get'
  	}))
    .then(result => {
      if (result.data.length == 0) return resolve([]);
      if (artist) {
        this.getAlbum(result.data[0].album.id)
        .then(album => resolve(album))
        .catch(err => reject(err))
        return;
      }

      asyncGetAlbums (this.DZ, title, result.data, 0, [], albums => {
        resolve(albums);
      })
    })
    .catch(err => {
      reject ("getAlbums:: "+err);
    })
  })
}


DZAPI.prototype.getAlbum = function (id) {
  return new Promise((resolve, reject) => {
    this.DZ.getAccessToken()
    .then(accessToken => this.DZ.request(accessToken,
  	{
  			resource: '/album/'+id,
  			method: 'get'
  	}))
    .then(result => {
        resolve(result);
    })
    .catch(err => {
      reject ("getAlbum:: "+err);
    })
  })
}


DZAPI.prototype.getLevenshteinDistance = function (sdx, text, score) {
  let sdx_gram = soundex(text);
  let levens  = clj_fuzzy.metrics.levenshtein(sdx, sdx_gram);
      levens  = 1 - (levens / sdx_gram.length);
  if (levens > score && levens >= 0.8){
    score = levens;
    return true;
  } else {
    return false;
  }
}


DZAPI.prototype.getLexic = function (sentence) {

  for (let i in this.lexic) {
      let even = _.find(this.lexic[i], (num) => {
          if (sentence.toLowerCase().indexOf(num) != -1) {
            let replaceSentence = sentence.substring(0, sentence.toLowerCase().indexOf(num) - 1);
            let replaceSentence1 = sentence.substring(sentence.toLowerCase().indexOf(num) + num.length);
            sentence = replaceSentence+' '+i+' '+replaceSentence1;
          }
          return sentence.toLowerCase() == num.toLowerCase();
      });
      if (even) {
          sentence = i;
          break;
      }
  }
  return sentence;
}


DZAPI.prototype.getSearchLexic = function (sentence) {

  for (let i in this.search_lexic) {
      let even = _.find(this.search_lexic[i], (num) => {
          return sentence.toLowerCase() == num.toLowerCase();
      });
      if (even) {
          sentence = i;
          break;
      }
  }
  return sentence;
}



 module.exports.DZAPI = DZAPI;
