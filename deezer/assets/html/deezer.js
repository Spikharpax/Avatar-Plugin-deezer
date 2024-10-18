const {ipcRenderer, remote} = require('electron');
const {ipcMain, BrowserWindow} = remote;
const fs = require('fs-extra');
const _ = require('underscore');

let config = fs.readJsonSync(__dirname + '/../../deezer.prop', { throws: false });
let tblGenres = [];


window.onbeforeunload = (e) => {
  e.preventDefault();
  close();
}


document.getElementById('exit').addEventListener('click', function(){
    close();
});


function close() {

  let DeezerWindowsID = ipcRenderer.sendSync('DeezerWindowsID');
  let DeezerWindows = BrowserWindow.fromId(DeezerWindowsID);
  let pos = DeezerWindows.getPosition();
  fs.writeJsonSync('./resources/core/plugins/deezer/style.json', {
    x: pos[0],
    y: pos[1]
  });

  ipcMain.removeAllListeners('DeezerSpeech');
  ipcMain.removeAllListeners('DeezerUnderstand');
  ipcMain.removeAllListeners('DeezerSay');
  ipcMain.removeAllListeners('DeezerGenre');
  ipcMain.removeAllListeners('DeezerMine');
  ipcMain.removeAllListeners('DeezerAutoDelete');
  ipcMain.removeAllListeners('DeezerGetGenre');
  ipcMain.removeAllListeners('DeezerEraseInfo');
  ipcMain.removeAllListeners('DeezerRemoveGenre');
  ipcRenderer.sendSync('Deezer', 'quit');
}


document.getElementById('menu-genre').addEventListener('click', function(){
  document.getElementById('speech').value = "";
  document.getElementById('title').value = "";
  document.getElementById('lexic').value = "";
})


document.getElementById('check-mine').addEventListener('click', function(){
  if (document.getElementById('check-mine').toggled) {
    document.getElementById('speech').value = "Playlist - Album - Artiste - Coup de coeur";
    document.getElementById('speech-label').innerHTML = "Dans ma bibliothèque";

  } else {
    document.getElementById('speech').value = "Album - Artiste - Titre - Genre";
    document.getElementById('speech-label').innerHTML = "Recherche dans Deezer";
  }
})

document.getElementById('check-genre').addEventListener('click', function(){
 if (document.getElementById('check-genre').toggled) {
    document.getElementById("title").style.visibility = "hidden";
    document.getElementById('genre').style.display = "block";
    document.getElementById("genre").style.visibility = "visible";
    //document.getElementById("selection").toggled = true;
  } else {
    document.getElementById('genre').style.visibility = "hidden";
    document.getElementById('title').style.display = "block";
    document.getElementById('title').style.visibility = "visible";
  }
})


document.getElementById('check-delete').addEventListener('click', function(){
    if (document.getElementById('check-delete').toggled) {
      document.getElementById("text-delete").innerHTML = "Conserver tous les textes";
      document.getElementById("delete").disabled = true;
    } else {
      document.getElementById("text-delete").innerHTML = "Cliquez pour effacer tous les textes";
      document.getElementById("delete").disabled = false;
    }
})


document.getElementById('delete').addEventListener('click', function(){
  document.getElementById('title').value = "";
  document.getElementById('speech').value = "";
  document.getElementById('lexic').value = "";
  document.getElementById("selection").toggled = true;
})

document.getElementById('save').addEventListener('click', function(){

  let toSave;

  if (document.getElementById('speech').value && document.getElementById('title').value && (document.getElementById('speech').value.toLowerCase() != document.getElementById('title').value.toLowerCase())) {
    let understood = document.getElementById('title').value;
    let found;
    for (item in config.modules.deezer.search_lexic) {
      if (item.toLowerCase() == understood.toLowerCase())
          found = item;
    }
    if (found) {
      config.modules.deezer.search_lexic[found] = _.union([document.getElementById('speech').value], config.modules.deezer.search_lexic[found]);
    } else {
      found = understood;
      config.modules.deezer.search_lexic[found] = [document.getElementById('speech').value];
    }
    toSave = true;
  }

  if (document.getElementById('lexic').value  && document.getElementById('title').value && (document.getElementById('genre').style.visibility == "" || document.getElementById('genre').style.visibility == "hidden") && (document.getElementById('lexic').value.toLowerCase() != document.getElementById('title').value.toLowerCase())) {
      let say = document.getElementById('lexic').value;
      let found;
      for (item in config.modules.deezer.tts_lexic) {
        if (item.toLowerCase() == say.toLowerCase())
            found = item;
      }

      if (found) {
          config.modules.deezer.tts_lexic[found] = _.union([document.getElementById('title').value], config.modules.deezer.tts_lexic[found]);
      } else {
        found = say;
        config.modules.deezer.tts_lexic[found] = [document.getElementById('title').value];
      }
      toSave = true;
  }

  if (document.getElementById('lexic').value && document.getElementById('genre').style.visibility == "visible") {
      let say = document.getElementById('lexic').value;
      let found;
      for (item in config.modules.deezer.tts_lexic) {
        if (item.toLowerCase() == say.toLowerCase())
            found = item;
      }

      let value;
      let menuGenre = document.getElementById('menu-genre');
      for(var i=0; i < menuGenre.childNodes.length;i++) {
    		  let child = menuGenre.childNodes[i];
          if (child.toggled && child.value != "Sélectionnez un genre") {
            value = child.value.split('@@')[0];
            break;
          }
  	  }

      if (found && found.toLowerCase() != value.toLowerCase()) {
          config.modules.deezer.tts_lexic[found] = _.union([value], config.modules.deezer.tts_lexic[found]);
      } else {
        found = say;
        config.modules.deezer.tts_lexic[found] = [value];
      }
      toSave = true;
  }

  if (toSave) {
    fs.writeJsonSync(__dirname + '/../../deezer.prop', config);
    ipcRenderer.sendSync('DeezerRefreshConfig', config);
    let notification = document.getElementById('notification');
    notification.innerHTML = "Sauvegardé !"
    notification.opened = true;
  }

});


function setGenre (genres) {

  let imgs = ['games','art-track','audiotrack','library-music','queue-music','surround-sound','radio','playlist-play','album','airplay','music-video','high-quality']
  let menuGenres = document.getElementById('menu-genre');
  genres.forEach(genre => {
      let menuitem = document.createElement("x-menuitem");
      menuitem.value = genre.name+'@@'+genre.id;
      tblGenres.push(genre.name+'@@'+genre.id);
      let icon = document.createElement("x-icon");
      let img = imgs[Math.floor(Math.random() * imgs.length)];
      icon.setAttribute('name', img);
      let label = document.createElement("x-label");
      label.className = 'label-help';
      label.innerHTML = genre.name;
      menuitem.appendChild(icon);
      menuitem.appendChild(label);
      menuGenres.appendChild(menuitem);
  })

  document.getElementById("selection").toggled = true;

}


ipcMain.on('DeezerSpeech', (event, arg) => {
  if (arg)
    document.getElementById('speech').value = arg;
  event.returnValue = document.getElementById('speech').value;
})
.on('DeezerEraseInfo', (event) => {
    document.getElementById('title').value = '';
    document.getElementById('speech').value = '';
    document.getElementById('lexic').value = '';
    event.returnValue = true;
})
.on('DeezerUnderstand', (event, arg) => {
  if (arg)
    document.getElementById('title').value = arg;
  event.returnValue = document.getElementById('title').value;
})
.on('DeezerSay', (event, arg) => {
  if (arg)
    document.getElementById('lexic').value = arg;
  event.returnValue = document.getElementById('lexic').value;
})
.on('DeezerGenre', (event, arg) => {
  document.getElementById('check-genre').disabled = false;
  if (tblGenres.length > 0) tblGenres = [];
  setGenre(arg);
  event.returnValue = true;
})
.on('DeezerMine', (event) => {
  event.returnValue = document.getElementById('check-mine').toggled;
})
.on('DeezerAutoDelete', (event) => {
  event.returnValue = document.getElementById('check-delete').toggled;
}).on('DeezerGetGenre', (event, arg) => {
  let value = false;
  if (document.getElementById('genre').style.visibility == "visible") {
    let menuGenre = document.getElementById('menu-genre');
    for(var i=0; i < menuGenre.childNodes.length;i++) {
  		  let child = menuGenre.childNodes[i];
        if (child.toggled && child.value != "Sélectionnez un genre") {
          value = child.value;
          break;
        }
	  }
  } else if (document.getElementById('title').value) {
    for(var i = 0; i < tblGenres.length; i++) {
        if (tblGenres[i].split('@@')[0].toLowerCase() == document.getElementById('title').value.toLowerCase()) {
            value = tblGenres[i];
            break;
        }
    }
  }

  event.returnValue = value;
})
.on('DeezerRemoveGenre', (event, arg) => {
  if (document.getElementById('genre').style.visibility == "visible") {
    let menuGenre = document.getElementById('menu-genre');
    for(var i=0; i < menuGenre.childNodes.length;i++) {
  		  let child = menuGenre.childNodes[i];
        if (child.value == "Sélectionnez un genre") {
          child.toggled = true;
        } else if (child.toggled && child.value != "Sélectionnez un genre")
          child.toggled = false;
	  }
  }
  event.returnValue = true;
})
