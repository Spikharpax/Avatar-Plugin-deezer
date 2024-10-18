const fs = require('fs-extra');
const _ = require('underscore');
const {Graph} = require('cyto-avatar');
const {remote, ipcRenderer} = require('electron');
const {Menu, BrowserWindow, ipcMain} = remote;
const soundex  = require('./services/soundex.js').soundex;

let deezer;
let deezerAPI;
let deezerWindow;
let cyto;
let deezerGenres = [];

exports.addPluginElements = function(CY){

    // init variable globale module Graph
   cyto = new Graph (CY, __dirname);

    // Chargement des éléments sauvegardés
    cyto.loadAllGraphElements()
    .then(elems => {
      if (!elems || elems.length == 0) {
        addDeezerGraph(cyto)
        .then(elem => cyto.onClick(elem, (evt) => {
            showAddTitle();
        }))
        .catch(err => {
          console.log('err:', err || 'erreur dans la création du node Deezer');
        })
      } else {
        cyto.onClick(elems[0], (evt) => {
            showAddTitle();
        });
      }
    })
}



function addDeezerGraph(cyto) {
  return new Promise((resolve, reject) => {
    cyto.getGraph()
    .then(cy => cyto.addGraphElement(cy, "Deezer"))
    .then(elem => cyto.addElementClass(elem, "Deezer"))
    .then(elem => cyto.addElementImage(elem, __dirname+"/assets/images/deezer.png"))
    .then(elem => cyto.addElementSize(elem, 45))
    .then(elem => cyto.addElementRenderedPosition(elem, 100, 100))
    .then(elem => {
        resolve(elem);
    })
    .catch(err => {
      reject();
    })
  })
}


function showAddTitle() {

    if (deezerWindow) {
      deezerWindow.show();
      return;
    }

    let id = ipcRenderer.sendSync('info', 'id');
    let win = BrowserWindow.fromId(id);
    let style = {
      parent: win,
      frame: true,
      movable: true,
      resizable: true,
      show: false,
      width: 400,
      skipTaskbar: false,
      height: 275,
      title: 'Deezer',
      icon: 'resources/core/plugins/deezer/assets/images/deezer.png',
    }
    if (fs.existsSync('./resources/core/plugins/deezer/style.json')) {
      let prop = fs.readJsonSync('./resources/core/plugins/deezer/style.json', { throws: false });
      if (prop) {
          style.x = prop.x;
          style.y = prop.y;
      }
    }

    deezerWindow = new BrowserWindow(style);
    deezerWindow.loadFile('../core/plugins/deezer/assets/html/deezer.html');
    //deezerWindow.openDevTools();
    ipcRenderer.sendSync('addPluginWindowID', deezerWindow.id);
    deezerWindow.once('ready-to-show', () => {
        deezerWindow.show();
        ipcRenderer.sendSync('DeezerGenre', deezerGenres);
    });
    deezerWindow.on('closed', function () {
      ipcMain.removeAllListeners('Deezer');
      ipcMain.removeAllListeners('DeezerWindowsID');
      ipcMain.removeAllListeners('DeezerRefreshConfig');
      deezerWindow = null;
    });

    ipcMain.on('DeezerWindowsID', (event, arg) => {
      event.returnValue = deezerWindow.id;
    })
    .on('DeezerRefreshConfig', (event, arg) => {
      Config.modules.deezer = arg.modules.deezer;
      event.returnValue = true;
    })
    .on('Deezer', (event, arg) => {
      switch (arg) {
        case 'quit':
          ipcRenderer.sendSync('removePluginWindowID', deezerWindow.id);
          event.returnValue = true;
          deezerWindow.close();
          break;
      }
    })

}


exports.onAvatarClose = function(callback){

  cyto.saveAllGraphElements("Deezer")
  .then(() => {
    callback();
  })
  .catch(err => {
    console.log('Error saving Elements', err)
    callback();
  })

}


exports.init = function(){

	if (Config.modules.deezer.account.port && Config.modules.deezer.account.client_id && Config.modules.deezer.account.client_secret) {
		const {DZ} = require('./services/DZ.js');
		deezer = new DZ (Config.modules.deezer);
		const {DZAPI} = require('./services/API.js');
		deezerAPI = new DZAPI (deezer, Config.modules.deezer.tts_lexic, Config.modules.deezer.search_lexic);

    deezerAPI.getGenres()
    .then(genres => {
      deezerGenres = genres;
    })

  } else {
		warn('Deezer: Paramètres de connections manquants. Suivez la documentation.')
	}
}

exports.action = function(data, callback){

	if (!Config.modules.deezer.account.port || !Config.modules.deezer.account.client_id || !Config.modules.deezer.account.client_secret) {
		warn("Le compte deezer n'est pas configuré.")
		return callback();
	}
	// Tableau d'actions
	let tblCommand = {
		musicMine : () => {
			askMusic(data.client, client);
    },
		stopMusic : function() {
			stopMusic (data.client, client);
		}
	};

	let client = setClient(data);
	info("deezer:", data.action.command, "From:", data.client, "To:", client);
  tblCommand[data.action.command]();
	callback();
}



function askMusic (from, to) {

  if (deezerWindow && ipcRenderer.sendSync('DeezerMine')) {
    let title = ipcRenderer.sendSync('DeezerSpeech');
    if (title && title != "Playlist - Album - Artiste - Coup de coeur") {
      title = deezerAPI.getSearchLexic(title);
      ipcRenderer.sendSync('DeezerUnderstand', title);
      let say = deezerAPI.getLexic(title);
      ipcRenderer.sendSync('DeezerSay', say);
      findMusicMine(from, to, title, say);
      return;
    }
  }

  Avatar.askme("Qu'est ce que tu veux écouter ?|Tu veux quoi ?", from,
        {
            "*": "generic",
            "qu'est ce que je peux dire": "sommaire",
						"comme tu veux": "doit",
						"fais-toi plaisir": "doit",
            "terminer": "done"
        }, 0, function (answer, end) {

            // Test si la réponse contient "generic"
            if (answer && answer.indexOf('generic') != -1) {
                end(from);
                answer = answer.split(':')[1];

                if (answer.toLowerCase().indexOf('cherche') != -1) {
                  if (answer.toLowerCase().indexOf('album') != -1) {
                    askSearchAlbum(from, to);
                    return;
                  }

                  if (answer.toLowerCase().indexOf('genre') != -1) {
                    askSearchGenre(from, to);
                    return;
                  }

                  if (answer.toLowerCase().indexOf('artiste') != -1) {
                    askSearchArtiste(from, to);
                    return;
                  }

                  if (answer.toLowerCase().indexOf('piste') != -1 || answer.toLowerCase().indexOf('morceau') != -1 || answer.toLowerCase().indexOf('titre') != -1) {
                    askSearchTrack(from, to);
                    return;
                  }

                  /*
                  *********************
                  Radio not used at this time
                  *********************
                  if (answer.toLowerCase().indexOf('radio') != -1) {
                    askSearchRadio(from, to);
                    return;
                  }*/

                  Avatar.speak("Je n'ai pas très bien compris, recommence", from, () => {
                      askMusic (from, to);
                  });
                  return;
                }

                if (deezerWindow)
                  ipcRenderer.sendSync('DeezerSpeech', answer);
                answer = deezerAPI.getSearchLexic(answer);
                if (deezerWindow)
                   ipcRenderer.sendSync('DeezerUnderstand', answer);
                let say = deezerAPI.getLexic(answer);
                if (deezerWindow)
                   ipcRenderer.sendSync('DeezerSay', say);

								findMusicMine(from, to, answer, say);
                return;
            }
            // Grammaire fixe
            switch(answer) {
                case "sommaire":
									end(from);
									Avatar.speak("Tu peux dire:", from, function(){
										Avatar.speak("Un nom de play liste ou d'albums.", from, function(){
											Avatar.speak("Comme tu veux ou fais-toi plaisir.", from, function(){
												Avatar.speak("Ou terminé.", from, function(){
													askMusic (from, to);
												});
											});
										});
									});
                  break;
								case "doit":
									end(from);
									asYouWant(from, to);
									break;
                case "done":
                default:
                  if (deezerWindow)
                    ipcRenderer.sendSync('DeezerEraseInfo');
                  Avatar.speak("Terminé", from, function(){
                      end(from, true);
                  });
           }
        }
    );

}


function askSearchRadio (from, to) {

  if (deezerWindow) {
    let radio = ipcRenderer.sendSync('DeezerSpeech');
    if (radio && radio != "Album - Artiste - Titre - Genre") {
      radio = deezerAPI.getSearchLexic(radio);
      ipcRenderer.sendSync('DeezerUnderstand', radio);
      let say = deezerAPI.getLexic(radio);
      ipcRenderer.sendSync('DeezerSay', say);
      setRadioFromSearch (from, to, radio, say);
      return;
    }
  }

  Avatar.askme("quel radio ?", from,
      {
          "*": "generic",
          "qu'est ce que je peux dire": "sommaire",
          "terminer": "done"
      }, 0, function (answer, end) {
          if (answer && answer.indexOf('generic') != -1) {
              end(from);
              answer = answer.split(':')[1];

              if (deezerWindow)
                ipcRenderer.sendSync('DeezerSpeech', answer);

              answer = deezerAPI.getSearchLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerUnderstand', answer);

              let say = deezerAPI.getLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerSay', say);

              setRadioFromSearch (from, to, answer, say);
              return;
          }

          // Grammaire fixe
          switch(answer) {
              case "sommaire":
                end(from);
                Avatar.speak("Tu peux dire:", from, () => {
                  Avatar.speak("Un nom de radio.", from, () => {
                    Avatar.speak("Ou terminé.", from, () => {
                      askSearchRadio (from, to);
                    });
                  });
                });
                break;
              case "done":
              default:
                if (deezerWindow)
                  ipcRenderer.sendSync('DeezerEraseInfo');
                Avatar.speak("Terminé", from, function(){
                    end(from, true);
                });
          }
        }
    )

}


function setRadioFromSearch (from, to, answer, say) {

  deezerAPI.getRadio(answer)
  .then(result => {
    if (result.length === 0) {
      Avatar.speak("Je n'ai trouvé aucune radio pour "+say, from, () => {
          if (deezerWindow)
            ipcRenderer.sendSync('DeezerEraseInfo');
          askSearchRadio (from, to);
      });
      return;
    }

    if (result.length > 1)  {
     Avatar.speak('J\'ai trouvé '+result.length+' radios pour '+say, from, () => {
        searchMultipleChoices (from, result, 0, radio => {
          Avatar.speak("Je mets "+(radio.title ? radio.title : say), from, () => {
            if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
              ipcRenderer.sendSync('DeezerEraseInfo');
              play(from, to, radio);
          });
        }, false);
      })
      return;
    }

    let speech;
    if (result.id)
      speech = result.title;
    else if (result[0])
      speech = result[0].title;
    else
      speech = say;
    Avatar.speak('Je mets '+speech, from, () => {
      if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
        ipcRenderer.sendSync('DeezerEraseInfo');
      play(from, to, result.id ? result : result[0]);
    });
  })
  .catch(err => {
    Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
      if (Avatar.isMobile(from))
          Avatar.Socket.getClientSocket(from).emit('askme_done');
      else
          Avatar.Speech.end(from);
    });
    console.log(err);
  });

}


function askSearchGenre (from, to) {

  if (deezerWindow) {
    let genre = ipcRenderer.sendSync('DeezerSpeech');
    if (genre && genre != "Album - Artiste - Titre - Genre") {
      genre = deezerAPI.getSearchLexic(genre);
      genre = ipcRenderer.sendSync('DeezerUnderstand', genre);
      let say = deezerAPI.getLexic(genre);
      ipcRenderer.sendSync('DeezerSay', say);
      setGenreFromSearch (from, to, genre, say);
      return;
    } else {
      let genre = ipcRenderer.sendSync('DeezerGetGenre');
      if (genre) {
        genre = genre.split('@@')[0];
        let say = deezerAPI.getLexic(genre);
        ipcRenderer.sendSync('DeezerSay', say);
        setGenreFromSearch (from, to, genre, say);
        return;
      }
    }
  }

  Avatar.askme("quel genre ?", from,
      {
          "*": "generic",
          "qu'est ce que je peux dire": "sommaire",
          "terminer": "done"
      }, 0, function (answer, end) {
          if (answer && answer.indexOf('generic') != -1) {
              end(from);
              answer = answer.split(':')[1];

              let genreMatched = [];
              let sdx = soundex(answer);
              let score = 0;
              deezerGenres.forEach(genre => {
                if (deezerAPI.getLevenshteinDistance(sdx, genre.name, score))
                    genreMatched.push (genre);
              });

              if (genreMatched.length == 0 || genreMatched.length > 1) {
                Avatar.speak("Je n'ai pas très bien compris, recommence", from, () => {
                    askSearchGenre (from, to);
                });
                return;
              } else
                answer = genreMatched[0].name;

              if (deezerWindow)
                ipcRenderer.sendSync('DeezerSpeech', answer);
              answer = deezerAPI.getSearchLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerUnderstand', answer);
              let say = deezerAPI.getLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerSay', say);

              setGenreFromSearch (from, to, answer, say);
              return;
          }

          // Grammaire fixe
          switch(answer) {
              case "sommaire":
                end(from);
                Avatar.speak("Tu peux dire:", from, () => {
                  Avatar.speak("Un genre ou terminé.", from, () => {
                      askSearchGenre (from, to);
                  });
                });
                break;
              case "done":
              default:
                if (deezerWindow)
                  ipcRenderer.sendSync('DeezerEraseInfo');
                Avatar.speak("Terminé", from, function(){
                    end(from, true);
                });
          }
        }
    )

}


function setGenreFromSearch (from, to, genre, say) {

  function speak() {
    Avatar.speak(Config.modules.deezer.search.toLong, from);
  }

  deezerAPI.getAlbumsByGenre(speak, Config.modules.deezer.search.max, genre)
  .then(result => {
    if (result.length === 0) {
      Avatar.speak("Je n'ai rien trouvé pour le genre "+say, from, () => {
          if (deezerWindow)
            ipcRenderer.sendSync('DeezerEraseInfo');
          askSearchGenre (from, to);
      });
      return;
    }
    if (result.length > 1)  {
      Avatar.speak('J\'ai trouvé '+result.length+' musiques de '+say, from, () => {
        searchMultipleChoices (from, result, 0, album => {
          Avatar.speak("Je mets "+album.title, from, () => {
            if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
              ipcRenderer.sendSync('DeezerEraseInfo');
            play(from, to, album);
          });
        }, true);
      })
      return;
    }
    Avatar.speak('Je mets '+(result.id ? result.title : result[0].title), from, () => {
      if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
        ipcRenderer.sendSync('DeezerEraseInfo');
      play(from, to, result.id ? result : result[0]);
    });
  })
  .catch(err => {
    Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
      if (Avatar.isMobile(from))
          Avatar.Socket.getClientSocket(from).emit('askme_done');
      else
          Avatar.Speech.end(from);
    });
    console.log(err);
  });
}


function askSearchArtiste(from, to) {

  if (deezerWindow) {
    let artist = ipcRenderer.sendSync('DeezerSpeech');
    if (artist && artist != "Album - Artiste - Titre - Genre") {
      artist = deezerAPI.getSearchLexic(artist);
      ipcRenderer.sendSync('DeezerUnderstand', artist);
      let say = deezerAPI.getLexic(artist);
      ipcRenderer.sendSync('DeezerSay', say);
      setArtistFromSearch (from, to, artist, say);
      return;
    }
  }

  Avatar.askme("quel artiste ?", from,
      {
          "*": "generic",
          "qu'est ce que je peux dire": "sommaire",
          "terminer": "done"
      }, 0, function (answer, end) {
          if (answer && answer.indexOf('generic') != -1) {
              end(from);
              answer = answer.split(':')[1];

              if (deezerWindow)
                ipcRenderer.sendSync('DeezerSpeech', answer);

              answer = deezerAPI.getSearchLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerUnderstand', answer);

              let say = deezerAPI.getLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerSay', say);

              setArtistFromSearch (from, to, answer, say);
              return;
          }

          // Grammaire fixe
          switch(answer) {
              case "sommaire":
                end(from);
                Avatar.speak("Tu peux dire:", from, () => {
                  Avatar.speak("Un nom d'artiste.", from, () => {
                    Avatar.speak("Ou terminé.", from, () => {
                      askSearchArtiste (from, to);
                    });
                  });
                });
                break;
              case "done":
              default:
                if (deezerWindow)
                  ipcRenderer.sendSync('DeezerEraseInfo');
                Avatar.speak("Terminé", from, function(){
                    end(from, true);
                });
          }
        }
    )
}


function setArtistFromSearch (from, to, artist, say) {

  function speak() {
    Avatar.speak(Config.modules.deezer.search.toLong, from);
  }

  deezerAPI.getArtist(speak, Config.modules.deezer.search.max, artist)
  .then(result => {
    if (result.length === 0) {
      Avatar.speak("Je n'ai trouvé aucun artiste pour "+say, from, () => {
          if (deezerWindow)
            ipcRenderer.sendSync('DeezerEraseInfo');
          askSearchArtiste (from, to);
      });
      return;
    }

    if (result.length > 1)  {
     Avatar.speak('J\'ai trouvé '+result.length+' albums pour l\'artiste '+say, from, () => {
        searchMultipleChoices (from, result, 0, album => {
          Avatar.speak("Je mets "+(album.title ? album.title : say), from, () => {
            if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
              ipcRenderer.sendSync('DeezerEraseInfo');
              play(from, to, album);
          });
        }, false);
      })
      return;
    }

    let speech;
    if (result.id)
      speech = result.title;
    else if (result[0])
      speech = result[0].title;
    else
      speech = say;
    Avatar.speak('Je mets '+speech, from, () => {
      if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
        ipcRenderer.sendSync('DeezerEraseInfo');
      play(from, to, result.id ? result : result[0]);
    });
  })
  .catch(err => {
    Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
      if (Avatar.isMobile(from))
          Avatar.Socket.getClientSocket(from).emit('askme_done');
      else
          Avatar.Speech.end(from);
    });
    console.log(err);
  });
}


function askSearchTrack (from, to) {

  function returnTrack(answer) {
    let artist;
    let title;
    answer = deezerAPI.getSearchLexic(answer);
    ipcRenderer.sendSync('DeezerUnderstand', answer);
    if (answer.toLowerCase().indexOf(' de ') != -1){
        title = answer.split(' de ')[0];
        artist = answer.split(' de ')[1];
    } else if (answer.toLowerCase().indexOf(' par ') != -1){
        title = answer.split(' par ')[0];
        artist = answer.split(' par ')[1];
    } else if (answer.toLowerCase().indexOf(',') != -1 ){
        title = answer.split(',')[0];
        artist = answer.split(',')[1];
    } else
      title = answer;

    return {title: title, artist: artist};
  }

  if (deezerWindow) {
    let title = ipcRenderer.sendSync('DeezerSpeech');
    if (title && title != "Album - Artiste - Titre - Genre") {
      let val = returnTrack(title);
      let say = deezerAPI.getLexic(title);
      ipcRenderer.sendSync('DeezerSay', say);
      setTrackFromSearch (from, to, val.title, val.artist, say);
      return;
    }
  }

  Avatar.askme("quel morceau ?|quel piste ?|quel titre ?", from,
      {
          "*": "generic",
          "qu'est ce que je peux dire": "sommaire",
          "terminer": "done"
      }, 0, function (answer, end) {
          if (answer && answer.indexOf('generic') != -1) {
              end(from);
              answer = answer.split(':')[1];
              let title, artist;

              if (deezerWindow)
                ipcRenderer.sendSync('DeezerSpeech', answer);

              answer = deezerAPI.getSearchLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerUnderstand', answer);

              let say = deezerAPI.getLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerSay', say);

              if (answer.toLowerCase().indexOf(' de ') != -1) {
                title = answer.split(' de ')[0];
                artist = answer.split(' de ')[1];
              } else if (answer.toLowerCase().indexOf(' par ') != -1) {
                title = answer.split(' par ')[0];
                artist = answer.split(' par ')[1];
              } else
                title = answer;

              setTrackFromSearch (from, to, title, artist, say);
              return;
          }

          // Grammaire fixe
          switch(answer) {
              case "sommaire":
                end(from);
                Avatar.speak("Tu peux dire:", from, () => {
                  Avatar.speak("Un nom de morceau seul ou avec un artiste.", from, () => {
                    Avatar.speak("Ou terminé.", from, () => {
                      askSearchTrack (from, to);
                    });
                  });
                });
                break;
              case "done":
              default:
                if (deezerWindow)
                  ipcRenderer.sendSync('DeezerEraseInfo');
                Avatar.speak("Terminé", from, function(){
                    end(from, true);
                });
          }
        }
    )

}


function setTrackFromSearch (from, to, title, artist, say) {

  deezerAPI.getTracks(title, artist)
  .then(result => {
    if (result.length === 0) {
      Avatar.speak("Je n'ai trouvé aucun morceau pour "+say, from, () => {
          if (deezerWindow)
            ipcRenderer.sendSync('DeezerEraseInfo');
          askSearchTrack (from, to);
      });
      return;
    }
    let tts;
    if (result.length > 1)  {
     Avatar.speak('J\'ai trouvé '+result.length+' titres pour '+say, from, () => {
        searchMultipleChoices (from, result, 0, titre => {
          if (titre.title) {
            tts = titre.title + (titre.artist && titre.artist.name ? " de "+titre.artist.name : "");
          } else
            tts = say;
          Avatar.speak("Je mets "+tts, from, () => {
            if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
              ipcRenderer.sendSync('DeezerEraseInfo');
              play(from, to, titre);
          });
        }, true);
      })
      return;
    }

    if (result.id && result.title) {
        tts = result.title + (result.artist && result.artist.name ? " de "+result.artist.name : "");
    } else if (result[0] && result[0].title) {
      tts = result[0].title + (result[0].artist && result[0].artist.name ? " de "+result[0].artist.name : "");
    } else
      tts = say;
    Avatar.speak('Je mets '+tts, from, () => {
        if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
          ipcRenderer.sendSync('DeezerEraseInfo');
        play(from, to, result.id ? result : result[0]);
    });
  })
  .catch(err => {
    Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
      if (Avatar.isMobile(from))
          Avatar.Socket.getClientSocket(from).emit('askme_done');
      else
          Avatar.Speech.end(from);
    });
    console.log(err);
  });
}


function askSearchAlbum (from, to) {

  function returnAlbum(answer) {
    let artist;
    let title;
    answer = deezerAPI.getSearchLexic(answer);
    ipcRenderer.sendSync('DeezerUnderstand', answer);
    if (answer.toLowerCase().indexOf(' de ') != -1){
        title = answer.split(' de ')[0];
        artist = answer.split(' de ')[1];
    } else if (answer.toLowerCase().indexOf(' par ') != -1){
        title = answer.split(' par ')[0];
        artist = answer.split(' par ')[1];
    } else if (answer.toLowerCase().indexOf(',') != -1 ){
        title = answer.split(',')[0];
        artist = answer.split(',')[1];
    } else
      title = answer;

    return {title: title, artist: artist};
  }

  if (deezerWindow) {
    let title = ipcRenderer.sendSync('DeezerSpeech');
    if (title && title != "Album - Artiste - Titre - Genre") {
      let val = returnAlbum(title);
      let say = deezerAPI.getLexic(title);
      ipcRenderer.sendSync('DeezerSay', say);
      setAlbumFromSearch (from, to, val.title, val.artist, say);
      return;
    }
  }

  Avatar.askme("quel album ?", from,
      {
          "*": "generic",
          "qu'est ce que je peux dire": "sommaire",
          "terminer": "done"
      }, 0, function (answer, end) {
          if (answer && answer.indexOf('generic') != -1) {
              end(from);
              answer = answer.split(':')[1];
              let title, artist;

              if (deezerWindow)
                ipcRenderer.sendSync('DeezerSpeech', answer);

              answer = deezerAPI.getSearchLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerUnderstand', answer);

              let say = deezerAPI.getLexic(answer);
              if (deezerWindow)
                 ipcRenderer.sendSync('DeezerSay', say);

              if (answer.toLowerCase().indexOf(' de ') != -1) {
                title = answer.split(' de ')[0];
                artist = answer.split(' de ')[1];
              } else if (answer.toLowerCase().indexOf(' par ') != -1){
                  title = answer.split(' par ')[0];
                  artist = answer.split(' par ')[1];
              } else
                title = answer;

              setAlbumFromSearch (from, to, title, artist, say);
              return;
          }

          // Grammaire fixe
          switch(answer) {
              case "sommaire":
                end(from);
                Avatar.speak("Tu peux dire:", from, () => {
                  Avatar.speak("Un nom d'album seul ou avec un artiste.", from, () => {
                    Avatar.speak("Ou terminé.", from, () => {
                      askSearchAlbum (from, to);
                    });
                  });
                });
                break;
              case "done":
              default:
                if (deezerWindow)
                  ipcRenderer.sendSync('DeezerEraseInfo');
                Avatar.speak("Terminé", from, function(){
                    end(from, true);
                });
          }
        }
    )
}


function setAlbumFromSearch (from, to, title, artist, say) {

  deezerAPI.getAlbums(title, artist)
  .then(result => {
    if (result.length === 0) {
      Avatar.speak("Je n'ai trouvé aucun album pour "+say, from, () => {
          if (deezerWindow)
            ipcRenderer.sendSync('DeezerEraseInfo');
          askSearchAlbum (from, to);
      });
      return;
    }
    if (result.length > 1)  {
     Avatar.speak('J\'ai trouvé '+result.length+' albums pour '+say, from, () => {
        searchMultipleChoices (from, result, 0, album => {
          Avatar.speak("Je mets "+album.title, from, () => {
            if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
              ipcRenderer.sendSync('DeezerEraseInfo');
              play(from, to, album);
          });
        }, true);
      })
      return;
    }
    Avatar.speak('Je mets '+say, from, () => {
      if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
        ipcRenderer.sendSync('DeezerEraseInfo');
        play(from, to, result.id ? result : result[0]);
    });
  })
  .catch(err => {
    Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
      if (Avatar.isMobile(from))
          Avatar.Socket.getClientSocket(from).emit('askme_done');
      else
          Avatar.Speech.end(from);
    });
    console.log(err);
  });
}


function findMusicMine (from, to, answer, say) {

	searchMePlaylists(answer)
	.then(result => searchMeAlbums(result, answer))
	.then(result => searchMeTracks(result, answer))
  .then(result => searchMeArtists(from, result, answer))
	.then(result => {
		return new Promise((resolve, reject) => {
			if (typeof result === 'number') {
				Avatar.speak("Je n'ai rien trouvé pour "+say, from, () => { // Autre demande
          if (deezerWindow)
            ipcRenderer.sendSync('DeezerEraseInfo');
					askMusic (from, to); // On recommence...
				});
				return;
			}

			if (result.length > 1)  {
				let type = result[0].type;
				let translate = [['track'],['morceaux']];
				if (_.indexOf(translate[0], type) != -1) {
					type = translate[1][_.indexOf(translate[0], type)];
				}

				Avatar.speak('J\'ai trouvé '+result.length+' '+type+' pour '+say, from, () => {
					searchMultipleChoices (from, result, 0, result => {
						Avatar.speak("Je mets "+say, from, () => {
								resolve(result);
						});
					});
				});
				return;
			}

			Avatar.speak('Je mets '+say, from, () => {
					resolve(result.id ? result : result[0]);
			});
		})
	})
	.then(toplay => {  // musique à lire
    if (deezerWindow && !ipcRenderer.sendSync('DeezerAutoDelete'))
      ipcRenderer.sendSync('DeezerEraseInfo');
		play(from, to, toplay);
	})
	.catch(err => {
		Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
			if (Avatar.isMobile(from))
					Avatar.Socket.getClientSocket(from).emit('askme_done');
			else
					Avatar.Speech.end(from);
		});
		console.log(err);
	})
}


function searchMultipleChoices (from, result, pos, callback, setartist, voice) {

	if (pos == result.length) {
	  Avatar.speak('j\'ai atteint la fin de la liste.', from, () => {
			searchMultipleChoices (from, result, --pos, callback, setartist, voice);
		});
    return;
  }

	if (pos < 0) {
	  Avatar.speak('j\'ai atteint le début de la liste.', from, () => {
			searchMultipleChoices (from, result, ++pos, callback, setartist, voice);
		});
    return;
  }

  let tts;
  console.log('result:',result[pos]);
  if (result[pos].record_type && result[pos].record_type == "album") {
    tts = "Album: "; // albums
  } else if (voice) {
    tts = "Track: ";
  } else { // single
    tts = "Piste: ";
  }

  if (voice)
    tts = tts + result[pos].title +(setartist ? " of "+result[pos].artist.name : "");
  else
    tts = tts + result[pos].title +(setartist ? " de "+result[pos].artist.name : "");

  if (tts.Length <= 7) tts = result[pos].title;

	Avatar.askme(tts, from,
      {
          "qu'est ce que je peux dire" : "sommaire",
          "en anglais": "US",
          "en français": "FR",
          "suivant": "next",
          "précédent": "previous",
          "vas à la fin": "end",
          "vas au milieu": "middle",
          "vas au milieu à gauche": "middleLeft",
          "vas au milieu à droite": "middleRight",
          "vas au début": "begin",
          "retourne au début": "begin",
          "c'est quoi" : "whatis",
          "mets-le": "putit",
					"vas-y mets-le": "putit",
					"c'est bon": "putit",
          "ok": "putit",
          "comme tu veux": "doit",
          "fais-toi plaisir": "doit",
          "terminer": "done"
      }, 0, function (answer, end) {

				switch(answer) {
					case "sommaire":
						end(from);
						Avatar.speak("Tu peux dire:", from, () => {
              Avatar.speak("En anglais ou en francais.", from, () => {
  							Avatar.speak("Suivant ou Précédent.", from, () => {
  								Avatar.speak("Vas au début, Vas au milieu, Vas au milieu à gauche ou à droite ou Vas à la fin.", from, () => {
  									Avatar.speak("Mets-le, c'est bon ou ok.", from, () => {
  										Avatar.speak("c'est quoi", from, () => {
  											Avatar.speak("Comme tu veux ou fais toi plaisir.", from, () => {
  												Avatar.speak("ou terminé.", from, () => {
  													searchMultipleChoices (from, result, pos, callback, setartist, voice);
  												});
  											});
  										});
  									});
  								});
  							});
              });
						});
						break;
          case "US":
            end(from);
            if (Config.modules.deezer.voice.US) {
              voice = Config.modules.deezer.voice.US;
              searchMultipleChoices (from, result, pos, callback, setartist, voice);
            } else {
              Avatar.speak("Il n'y a aucune voix anglaise dans les paramètres.", from, () => {
                searchMultipleChoices (from, result, pos, callback, setartist, voice);
              });
            }
            break;
          case "FR":
            end(from);
            voice = undefined;
            searchMultipleChoices (from, result, pos, callback, setartist, voice);
            break;
					case "next":
						end(from);
						searchMultipleChoices (from, result, ++pos, callback, setartist, voice);
						break;
					case "previous":
						end(from);
						searchMultipleChoices (from, result, --pos, callback, setartist, voice);
						break;
					case "end":
						end(from);
						searchMultipleChoices (from, result, (result.length - 1), callback, setartist, voice);
						break;
					case "begin":
						end(from);
						searchMultipleChoices (from, result, 0, callback, setartist, voice);
						break;
					case "middle":
						end(from);
						searchMultipleChoices (from, result, (Math.floor(result.length / 2)), callback, setartist, voice);
						break;
          case "middleLeft":
						end(from);
						searchMultipleChoices (from, result, (Math.floor((result.length / 2) / 2)), callback, setartist, voice);
						break;
          case "middleRight":
						end(from);
						searchMultipleChoices (from, result, (Math.floor((result.length / 2) + ((result.length / 2) / 2))), callback, setartist, voice);
						break;
					case "putit":
						end(from);
						callback(result[pos]);
						break;
          case "doit" :
            end(from);
            break;
          case "whatis" :
            end(from);
            searchMultipleChoices (from, result, pos, callback, setartist, voice);
            break;
					case "done":
          default:
              if (deezerWindow)
                ipcRenderer.sendSync('DeezerEraseInfo');
              Avatar.speak("Terminé", from, () => {
                  end(from, true);
              });
       }
    }, voice);
}



function play(from, to, toplay) {

	if (Config.modules.deezer.destination == 'Sonos' && Avatar.exists("SonosPlayer") && (Config.modules.SonosPlayer.active || Config.modules.SonosPlayer.active === undefined)) {
    let item = {};
		if (toplay.type == 'album') {
			item.uri = "x-rincon-cpcontainer:1004006calbum-"+toplay.id+"?sid=2&flags=108&sn=3"
			item.title = toplay.title;
		} else if (toplay.type == 'playlist') {
			item.uri = "x-rincon-cpcontainer:10060a6cplaylist_spotify%3aplaylist-"+toplay.id+"?sid=2&flags=2668&sn=3"
			item.title = toplay.title;
		} else if (toplay.type == 'track') { // track - special "deezer_track_" hack, managed in sonosPlayer in node_modules/sonos/lib/helper.js
			item.uri = "deezer_track_x-sonos-http:tr%3a"+toplay.id+".mp3?sid=2&flags=8224&sn=3"
			item.title = toplay.title;
		} else {
			return Avatar.speak('Je ne peux jouer que des albums, playlists ou morceaux dizeur. Pour le reste utilises directement Sonos', from, () => {
				if (Avatar.isMobile(from))
						Avatar.Socket.getClientSocket(from).emit('askme_done');
				else
						Avatar.Speech.end(from);
			});
		}
		Avatar.call('SonosPlayer', {action: {command:'deezerPlay', player: to, item: item}, client: from}, done => {
			if (done)
				error('Deezer: Impossible de lancer la musique');
			if (Avatar.isMobile(from))
					Avatar.Socket.getClientSocket(from).emit('askme_done');
			else
					Avatar.Speech.end(from);
		});
	} else { // Deezer plugin on client
		if (Avatar.isMobile(to)) { // Mobile
			return Avatar.speak('Je ne peux pas jouer de la musique sur un client mobile', from, () => {
				if (Avatar.isMobile(from))
						Avatar.Socket.getClientSocket(from).emit('askme_done');
				else
						Avatar.Speech.end(from);
			});
		}
		// Client mappé, pour rechercher le client réel
		let even = _.find(Config.default.mapping, num => {
			return to == num.split(',')[0];
		});
		if (even) to = mapped.split(',')[1];

		let url='"https://www.deezer.com/plugins/player?format=square&autoplay=true&playlist=false&width=218&height=240&color=EF5466&layout=dark&size=small&type=#DEEZERTYPE&id=#DEEZERID&app_id=#APPID"';
		url = 'cmd /c start /wait chrome --app='+url.replace('#DEEZERTYPE', (toplay.type == 'track' ? 'tracks' : toplay.type))
		.replace('#DEEZERID', toplay.id)
		.replace('#APPID', Config.modules.deezer.account.client_id);

		if (Avatar.isMobile(from)) { // Is a mobile client ?
				Avatar.Socket.getClientSocket(from).emit('askme_done'); // force close askme waiting on mobile client
				stopMusic (null, to, () => {
					Avatar.runApp(url, null, to); //, () => { // start player
					/*	setTimeout(() => { // resize player
							Avatar.runApp('%CD%/lib/nircmd/nircmd win setsize title "Widget Deezer" 100 100 218 258', null, to);
						}, 4000);
					});*/
				});
		} else { // Classic Client
			Avatar.Speech.end(from, true, () => { // end client
				stopMusic (null, to, () => {
					Avatar.runApp(url, null, to); //, () => { // start player
						/*setTimeout(() => { // resize player
							Avatar.runApp('%CD%/lib/nircmd/nircmd win setsize title "Widget Deezer" 100 100 218 258', null, to);
						}, 4000);
					});*/
				});
			});
		}
	}
}


function asYouWant(from, to) {

	let choice = [];
	searchMePlaylists()
	.then(playlists => {
		return new Promise((resolve, reject) => {
			if (playlists.length > 0) choice.push(playlists)
			searchMeAlbums()
			.then(albums => {
					if (albums.length > 0) choice.push(albums)
					resolve();
			})
		})
	})
	.then(() => {
		return new Promise((resolve, reject) => {
			searchMeTracks()
			.then(tracks => {
				if (tracks.length > 0) choice.push(tracks)
				resolve();
			})
		})
	})
	.then(() => {
		return new Promise((resolve, reject) => {
			if (choice.length > 0) {
				choice = _.flatten(choice);
		    resolve(choice[Math.floor(Math.random() * choice.length)]);
			}	else {
				Avatar.speak("Je suis désolé, Je n'ai trouvé aucune musique", from, () => {
					if (Avatar.isMobile(from))
							Avatar.Socket.getClientSocket(from).emit('askme_done');
					else
							Avatar.Speech.end(from);
				});
			}
		})
	})
	.then(toplay => {
		let answer = deezerAPI.getLexic(toplay.title);
		Avatar.speak('Super! Je mets '+answer+(toplay.artist ? ' de '+toplay.artist.name : ''), from, () => {
				play(from, to, toplay);
		});
	})
	.catch(err => {
		Avatar.speak("Je suis désolé, j'ai rencontré une erreur", from, () => {
			if (Avatar.isMobile(from))
					Avatar.Socket.getClientSocket(from).emit('askme_done');
			else
					Avatar.Speech.end(from);
		});
		console.log(err);
	})
}


function searchMeArtists (from, result, answer) {
	return new Promise((resolve, reject) => {
		if (typeof result === 'object') return resolve (result);
		deezerAPI.getMeArtists(answer)
    .then(artist => {
      if (artist.length !== 1) return resolve(0);
      function speak() {
        Avatar.speak(Config.modules.deezer.search.toLong, from);
      }
      deezerAPI.getArtist(speak, Config.modules.deezer.search.max, artist[0].name)
      .then(albums => {
        resolve(albums);
      })
      .catch(err => reject(err));
    })
		.catch(err => reject(err));
	})
}


function searchMeAlbums (result, answer) {
	return new Promise((resolve, reject) => {
		if (typeof result === 'object') return resolve (result);

		let searchTypes = ["title"]; //, "artist"];
		let all = [];
		searchAlbumByType(0, answer, searchTypes, all, result => {
				if (typeof result === 'string') return reject (result);
				if (all.length > 0) result = _.flatten(all);
				resolve (result);
		});
	})
}


function searchAlbumByType (pos, answer, searchTypes, all, callback) {

	if (pos == searchTypes.length)
			return callback(0);

		deezerAPI.getMeAlbums(searchTypes[pos], answer)
		.then(result => {
			if (result.length === 0 || answer == null) {
				if (result.length > 0) all.push(result);
				return searchAlbumByType (++pos, answer, searchTypes, all, callback);
			}
			callback(result);
		})
		.catch(err => callback(err));
}



function searchMePlaylists (answer) {
	return new Promise((resolve, reject) => {
			deezerAPI.getMePlaylists(answer)
			.then(result => {
				if (result.length === 0) return resolve(0);
				resolve(result);
			})
			.catch(err => reject(err));
	})
}


function searchMeTracks (result, answer) {
	return new Promise((resolve, reject) => {
		if (typeof result === 'object') return resolve (result);
		deezerAPI.getMeTracks(answer)
		.then(result => {
			if (result.length === 0) return resolve(0);
			resolve(result);
		})
		.catch(err => reject(err));
	})
}



function stopMusic (from, to, callback) {
  if (Config.modules.deezer.destination == 'Sonos' && Avatar.exists("SonosPlayer") && (Config.modules.SonosPlayer.active || Config.modules.SonosPlayer.active === undefined)) {
      Avatar.call('SonosPlayer', {action: {command:'stopMusic'}, client: from})
  } else {
    Avatar.runApp('%CD%/lib/nircmd/nircmd win close title "Widget Deezer"', null, to, () => {
			if (!callback) {
				Avatar.speak("c'est fait", from, () => {
					Avatar.Speech.end(from);
				});
			} else {
				setTimeout(() => {
					callback();
				}, 1000)
			}
		});
  }
}


function setClient (data) {
	let client = data.client;
	if (data.action.room)
		client = (data.action.room != 'current') ? data.action.room : (Avatar.currentRoom) ? Avatar.currentRoom : Config.default.client;
	if (data.action.setRoom)
		client = data.action.setRoom;
	return client;
}
