// ======================================================================
//
// ALMAcube: hard-coded AudioCube test
//
// ----------------------------------------------------------------------
//
// AMN Last Mod: 31/07/16
//
//
// Requires jsfft-master/lib/complex_array.js and jsfft-master/lib/fft.js
// ======================================================================

    // ======== "Global" variables

    // ------ Status flags etc
var DataReady = false;

var ClickStatus; // The status of the mouse button in the main image window
var PlayingSpec; // The Data id of the spectrum current being played (invalid if ClickStatus = false);

    // ------ Canvases and their contexts

var ImageCnv, ImageCtx;
var SpecCnv, SpecCtx;
var ParamCnv, ParamCtx;

    // ------ Sizes etc
   
var ICwidth, ICheight; // ImageCanvas size
var ImgWidth, ImgHeight, ImgOffX, ImgOffY; // Image size and position on ImageCanvas
var DataWidth, DataHeight, DataDepth; // Data dimensions

var SCwidth, SCheight; // SpecCanvas width and height

    // ------ The Data (spectral and RGB)
var DataCube = [];
var DataRGB = [];
var DataMin, DataMax;

    // ------ The Audio variables
var AudioCtx;         // The Audio context
var AudioBuffer = []; // Array of buffers for the audio
var AudCurrBuff;      // The ID selecting the current buffer
var AudMaxBuff;       // The maximum number of buffers...
var AudioSource = []; // The audio sources to connect the buffer to the context
var AudioGain = [];   // Control, the volumne of the two soruces independently
var AudBuffSiz;       // The audio buffer size (in samples)
var AudSampleRate;    // Sample rate (probably 44100 sam/sec but could be changed)
var AudAmplify;       // The amount to amplify the spectral values
var AudAmpScale;      // Power to scale the amps by (>1.0 to exaggerate peaks a bit more)
var AudMinFreq, AudMaxFreq; // Lower and upper frequencies to map to
var AudFadeTime;      // Duration of fade in/out (in seconds)



    // ======== Functions to setup and link-in canvases and contexts, initialise variables etc

function linkCanvases() {

  ImageCnv = document.getElementById('ImageCanvas');
  ImageCtx = ImageCanvas.getContext('2d');
  ICwidth = ImageCtx.canvas.width;
  ICheight = ImageCtx.canvas.height;
  ImgOffX = 5;
  ImgOffY = 4;
  ImageWidth = ICwidth - (ImgOffX * 2);
  ImageHeight = ICheight - (ImgOffY * 2);

  SpecCnv = document.getElementById('SpecCanvas');
  SpecCtx = SpecCanvas.getContext('2d');
  SCwidth = SpecCtx.canvas.width;
  SCheight = SpecCtx.canvas.height;

  ParamCnv = document.getElementById('ParamCanvas');
  ParamCtx = ParamCanvas.getContext('2d');

}

        // -------- Initialise Audio setting and context/buffer
        // -------- Change teh values here to optimse for a particular data set etc.
function initAudio() {

      // Default values for the parameters
    AudBuffSiz = 1024;  // Too small and limited range of pitches. Too large and it may lead to "warbling". The ideal balance is data-dependent. 512 ok for alma
    AudAmplify = 0.04; // This may need to be "tweaked" for different data sets (0.01 ok)
    AudAmpScale = 0.8; // 1.3 is good to emphasise "peakiness", 0.5 good to "smooth" the sounds out a bit
    AudMinFreq = 50.0;  // In Hz
    AudMaxFreq = 1000.0;
    AudMaxBuff = 64;  // The maximum number of buffers (the larger the more memory, but the less chance of "clicks" from fast mouse movement)
    AudFadeTime = 0.4; // Fade in/out time in seconds. Too small and get "clicking"

    AudioCtx = new AudioContext();
    AudSampleRate = AudioCtx.sampleRate;
    for(var i=0; i<AudMaxBuff; i++) {
	AudioBuffer[i] = AudioCtx.createBuffer(1, AudBuffSiz, AudSampleRate);
    }
    AudCurrBuff = 0;

    PlayingSpec = -1;

}

    // -------- Setup "Listener" functions for mouse activity etc
function createListeners() {

    ImageCnv.addEventListener('mousedown', function(evt) {
        if(DataReady) {
            ClickStatus = true;
            playAudio(evt);
        }
    }, false);
    ImageCnv.addEventListener('mouseup', function(evt) {
        if(DataReady) {
            ClickStatus = false;
            stopAudioAll(evt);
        }
    }, false);
    ImageCnv.addEventListener('mouseenter', function(evt) { // Reverse the effects of "mouseout", *if* mouse is also down
        if(DataReady && ClickStatus) {
            playAudio(evt);
        }
    }, false);
    ImageCnv.addEventListener('mouseout', function(evt) { // Safety in case "mouseup" not seen. Do not change "clickstatus"
        if(DataReady && ClickStatus) {
            stopAudioAll(evt);
        }
    }, false);
    ImageCnv.addEventListener('mousemove', function(evt) {
        if(DataReady) {
            if(ClickStatus) {
		changeAudio(evt);
            }
        }
      }, false);
}

    // ======== Functions to map various coordinates
    //          (e.g. data<->mouse coordinates, spectral wavelength to audio
    //          frequency etc).


    // -------- Mouse <-> Data coordinates
function mouse2data(mcoo) {
  var dcoo = {};
  var rect = ImageCnv.getBoundingClientRect();
  dcoo.x = Math.floor((mcoo.x - rect.left - ImgOffX) * (DataWidth/ImageWidth));
  dcoo.y = Math.floor((mcoo.y - rect.top - ImgOffY) * (DataHeight/ImageHeight));
  return(dcoo);
}

function data2mouse(dcoo) {
  var mcoo = {};
  var rect = ImageCnv.getBoundingClientRect();
  mcoo.x = (dcoo.x / (DataWidth/ImageWidth)) + ImgOffX + rect.left;
  mcoo.y = (dcoo.y / (DataHeight/ImageHeight)) + ImgOffY + rect.top;
  return(mcoo);
}

    // -------- Data wavelength <-> Audio frequency (Hz)

    //   Spectral wavelength index [0] corresponds to a frequency of AudMinFreq
    //   Spectral wavelength index [DataDepth-1] corresponds to a frequency of AudMaxFreq

function datafreq2audiofreq(wlen) {

  var frange, freq, wdist;

  frange = AudMaxFreq - AudMinFreq; // Range of frequencies
  wdist = wlen / (DataDepth-1); // Distance along spectrum (from the long-wavelength end)

  freq = AudMinFreq + (wdist * frange);

  return(freq);
}


   //   Frequency maps to index by:
   //      Freq = index * (sample rate / FFT buffer size)
   //   And so:
   //      index = freq * bufsize / samplerate


function audiofreq2fftindex(freq) {

  var indx = freq *  AudBuffSiz / AudSampleRate;
  return(Math.floor(indx));

}


    // ======== Functions to get the data and store it (also sets Data{Width,Height,Depth})
    //          Also functions to access the data by "coordinate"

    // -------- Initialise every5ting with a new dataset
    //           * Read in some data
    //           * Create a new image in the ImageCanvas
    // -------- This function must be setup as an
    //          addEventListener('change',...) for the File selector
    //          dialog ('chooseFile')


function newData(evt) {

  DataReady = false;  // Set to "false" here. This will be reset to "true" by the file-reading code in readData();

  statusMessage(ParamCnv, ParamCtx, "Loading");

  readData(evt);

}

    // --------- Update the image window with text showing the status so far
function statusMessage(canvas, context, message) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = '10pt Calibri';
      context.fillStyle = 'black';
      context.fillText(message, 10, 15);
}


    // -------- Read the actual data
function readData(evt) {

  var files = evt.target.files; // FileList object

    // files is a FileList of File objects. List some properties and
    // then read the contents of the first one (ignore any subsequent
    // files as this should only be used with single files selector
    // lists)

  var output = [];
  var f = files[0];

  var reader = new FileReader();

    // Set up an "onload" function to read the data in and parse it line-by-line
  reader.onload = function(e) {

         // Actually read in all the text file
    var text = e.target.result;

    var msg = "Processing: 0%";
    statusMessage(ParamCnv, ParamCtx, msg);

         // Split the (large) text object into lines
    var lines = text.split(/[\r\n]+/g); // tolerate both Windows and Unix linebreaks

    var i = 0;
    var dimflg = false;
    while(!dimflg) {
      var line = lines[i].trim();
      if((line.indexOf('#') != 0) && (line.length != 0)) {
        var _d = line.split(' ');
        DataWidth = parseInt(_d[0],10);
        DataHeight = parseInt(_d[1],10);
        DataDepth = parseInt(_d[2],10);
        dimflg = true;
      } else {
        i++;
        if(i >= lines.length) {
          alert(encodeURI(f.name)+' is not correctly formatted (no dimensions)');
          return(990); // Bad format code
        }
      }
    }
    i++;

      // Read rest of file into Data and RGB arrays
    DataMin = 0.0;  // Default to a minimum of 0 (negatives is impossible)
    DataMax = 0.0;
    var datan = 0, rgbn = 0;
    for(var j=i; j<lines.length; j++) {
      var line = lines[j].trim();
      if((line.indexOf('#') != 0) && (line.length != 0)) {
        var _s = line.split(' ');
        DataRGB[rgbn] = {};
        DataRGB[rgbn].r = parseInt(_s[0].substring(0,2), 16);
        DataRGB[rgbn].g = parseInt(_s[0].substring(2,4), 16);
        DataRGB[rgbn].b = parseInt(_s[0].substring(4,6), 16);
        rgbn++;

        for(var n=0; n<(DataDepth*2); n=n+2) {
          DataCube[datan] = parseInt(_s[1].substring(n, n+2), 16);
	  if(DataCube[datan] > DataMax) DataMax = DataCube[datan];
	  if(DataCube[datan] < DataMin) DataMin = DataCube[datan];
          datan++;
        }
      }
              // Update a "processing" message every so often
      if((j % 5000) == 0) {
        var pcnt = Math.ceil(100 * (datan / (DataWidth*DataHeight*DataDepth)));
        var msg = "Processing: "+pcnt+"%";
        statusMessage(ParamCnv, ParamCtx, msg);
      }
    }

    statusMessage(ParamCnv, ParamCtx, "");

       // Check that the dimensions match
    if(datan != (DataWidth*DataHeight*DataDepth)) {
      alert(encodeURI(f.name)+' has the wrong number of data ('+datan+' != '+(DataWidth*DataHeight*DataDepth)+')');
      return(991); // Wrong number of data code
    } else if(rgbn != (DataWidth*DataHeight)) {
      alert(encodeURI(f.name)+' has the wrong number of RGB values ('+rgbn+' != '+(DataWidth*DataHeight)+')');
      return(991); // Wrong number of data code
    }

    return(0); // OK code

  } // reader.onload()

     // onloadend is called once the file is finished loading. It makes the image
  reader.onloadend = function(e) {
    makeImage();
    DataReady = true;

  }

     // onprogress allows us to keep track of the processing of the file etc
     // This is only relevant while it is reading in the data. The other processing in onload() above is not included.
  reader.onprogress = function(e) {
    if(e.lengthComputable) {
      var pcnt = Math.ceil(100 * (e.loaded / e.total));
      var msg = "Loading: "+pcnt+"%";
      statusMessage(ParamCnv, ParamCtx, msg);
    }
  }


  reader.readAsText(f);  // Read this as a text file

  

}

function getDataIdx(x, y, s) {
  var i = s + (x*DataDepth) + (y*DataDepth*DataWidth);
  return(i);
}

function getRGBIdx(x, y) {
  var i = x + (y*DataWidth);
  return(i);
}


    // ======== Functions to create the audio

    // -------- Start playing audio
function playAudio(evt) {

    console.log("++PLAY: Buffer"+AudCurrBuff+" ("+evt.clientX+", "+evt.clientY+")");

       // Map from mouse to spectral data position
    var mcoo = {}, dcoo = {};
    mcoo.x = evt.clientX;
    mcoo.y = evt.clientY;
    dcoo = mouse2data(mcoo);
    var speci = getDataIdx(dcoo.x, dcoo.y, 0);

    // If the audio source already exists, "stop" it.
    if(AudioSource[AudCurrBuff]) {
	AudioSource[AudCurrBuff].stop();
    }
    AudioSource[AudCurrBuff] = AudioCtx.createBufferSource();
   
    // Calculate the appropriate sound and store it in the audiobuffer
    spec2audio(speci);
    PlayingSpec = speci;

    // Play the sound (it will loop until stopped)
    AudioSource[AudCurrBuff].start(0);
    AudioGain[AudCurrBuff].gain.linearRampToValueAtTime(0.5, AudioCtx.currentTime + AudFadeTime); // medium Fade in

      // Update the spectral image
    makeSpecImage(speci);

}

    // -------- Stop playing current audio
function stopAudio(evt) {
    console.log("++STOP: Buffer"+AudCurrBuff+" ("+evt.clientX+", "+evt.clientY+")");

    AudioGain[AudCurrBuff].gain.linearRampToValueAtTime(0.0, AudioCtx.currentTime + AudFadeTime); // medium Fade out

    PlayingSpec = -1;
    clearSpecImage();

}

    // -------- Stop playing ALL audio
function stopAudioAll(evt) {
    console.log("++STOPALL: Buffer"+AudCurrBuff+" ("+evt.clientX+", "+evt.clientY+")");

    for(var i=0; i<AudMaxBuff; i++) {
	if(AudioGain[i]) {
	    AudioGain[i].gain.linearRampToValueAtTime(0.0, AudioCtx.currentTime + AudFadeTime); // medium Fade out
	}
    }

    PlayingSpec = -1;
    clearSpecImage();

}

 

    // -------- Change the tone
function changeAudio(evt) {

       // Map from mouse to spectral data position
    var mcoo = {}, dcoo = {};
    mcoo.x = evt.clientX;
    mcoo.y = evt.clientY;
    dcoo = mouse2data(mcoo);
    var speci = getDataIdx(dcoo.x, dcoo.y, 0);

    // Only change if this is a new sound
    if((speci != PlayingSpec) || (PlayingSpec < 0)) {  
	console.log("++CHANGE: ("+evt.clientX+", "+evt.clientY+")");
	stopAudio(evt);
	AudCurrBuff++;
	if(AudCurrBuff >= AudMaxBuff) AudCurrBuff = 1;
	playAudio(evt);
    }

}


    // -------- Take a data spectrum and inverse-FFT it to get an audio buffer
    //            speci: the first element of the spectrum
function spec2audio(speci) {

    var fftdata = new complex_array.ComplexArray(AudBuffSiz);

     // Initialise to 0
    for(var i=0; i<AudBuffSiz; i++) {
	fftdata.real[i] = 0;
	fftdata.imag[i] = 0;
    }

    // Loop over the input spectrum and map from input "wavelength" to spectral frequency
    for(i=0; i<DataDepth; i++) {
	var f = datafreq2audiofreq(i);
	var fi = audiofreq2fftindex(f);
	fftdata.real[fi] = fftdata.real[fi] + (AudAmplify * Math.pow(DataCube[speci + i], AudAmpScale));
    }

    fftdata.InvFFT();

    var tmpBuffer = AudioBuffer[AudCurrBuff].getChannelData(0);
    for(i=0; i<AudBuffSiz; i++) {
	tmpBuffer[i] = fftdata.real[i];
    }

    AudioSource[AudCurrBuff].buffer = AudioBuffer[AudCurrBuff];
    AudioGain[AudCurrBuff] = AudioCtx.createGain();
    AudioSource[AudCurrBuff].connect(AudioGain[AudCurrBuff]);
    AudioGain[AudCurrBuff].connect(AudioCtx.destination);
    AudioGain[AudCurrBuff].gain.setValueAtTime(0.0, AudioCtx.currentTime); // Start with Gain=0 to allow fade in
    AudioSource[AudCurrBuff].loop = true;


} // spec2audio()

    // ======== Functions to create/update the image/spectrum/parameter canvases

    // -------- Make the image and put it in the appropriate canvas. 
function makeImage() {

  var imgData = ImageCtx.createImageData(ImageWidth, ImageHeight);
  var i=0;
  for(var y=0; y<imgData.height; y++) {
    for(var x=0; x<imgData.width; x++) {
      var mcoo = {}, dcoo = {};
      var rect = ImageCnv.getBoundingClientRect();
      mcoo.x = x+ImgOffX+rect.left; mcoo.y = y+ImgOffY+rect.top;
      dcoo = mouse2data(mcoo);
      var rgbi = getRGBIdx(dcoo.x, dcoo.y);
      imgData.data[i] = DataRGB[rgbi].r; i++;
      imgData.data[i] = DataRGB[rgbi].g; i++;
      imgData.data[i] = DataRGB[rgbi].b; i++;
      imgData.data[i] = 255; i++; // Alpha
    }
  }
  ImageCtx.putImageData(imgData, ImgOffX, ImgOffY);

}

    // ------- Draw a spectrum to the spectrum window

function makeSpecImage(speci) {

    // Find the dimensions of the spectrum window and work out the scaling parameters
  var binwid, yscal;

  binwid = SCwidth / DataDepth;
  yscal = SCheight / DataMax; // Always go down to zero, regardless of DataMin

    // Loop over all the data bins from low-frequency/red to high/blue and draw rectangles
  var x1=0, x2, y, r,g,b;
  for(var i=0; i<DataDepth; i++) {
    x2 = Math.ceil((i+1)*binwid);
    if(x2 > SCwidth) {x2 = SCwidth;}

    y = DataCube[speci + i] * yscal;
    if(y > SCheight) {y = SCheight;}

        // Get the colour...
    b = Math.floor(255 * i / (DataDepth-1));
    r = Math.floor(255 - b);
    g = 255 - Math.floor((r+b)/2);

        // Draw a rectangle
    var _col = "rgb("+r+","+g+","+b+")"
    SpecCtx.fillStyle = _col;
    SpecCtx.fillRect(x1,SCheight-y, (x2-x1), y);

    x1 = x2;
  }

}

    // ------- Clear the spectrum window
function clearSpecImage() {

   SpecCtx.fillStyle = "black";
   SpecCtx.fillRect(0,0,SCwidth,SCheight);
}


