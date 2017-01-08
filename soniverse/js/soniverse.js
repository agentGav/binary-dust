// =======================================================================
//
// Soniverse JS modeling
// Code: http://www.astro.ljmu.ac.uk/~amn/
// 
//
// -----------------------------------------------------------------------
//
// A series of classes and helper functions to represent sounds and
// different aspects of soniverse models, and the methods to use the
// model to manipulate the sounds.
//
// -----------------------------------------------------------------------
//
// History:
//
// 30/12/16 AMN: Started
// 01/01/17 AMN: Reached stage of:
//                 * A basic "Soniverse" model class
//                 * Ability to create a spectrum in AudioSpec and
//                   turn it into a time-varying signal (i.e. audio)
//                 * Simply spec-shift of AudioSpec
//
// -----------------------------------------------------------------------
// IMPORTANT NOTE ON UNITS
//
// The soniverse model uses "natural" units. In other words, the speed of
// sound c_nat = 1. This has some important consequencies for some of the
// familar parameters. So, if we keep our units of  as seconds
// wavelength is in units of sound-seconds
//
//  w_phys = c_phys * w_nat
//
// =======================================================================


// =======================================================================
// A Soniverse cosmological model

var SoniverseModel = function() {

    // The speed of sound in physical units (m/s). Internally, everything
    // works in natural units (speed-of-sound=1) but this is required
    // if we want to convert into "physical" units
    this.Cphys = 343.2; // Default to speed of sound in dry air at STP


    // "Cosmological" parameters:

    // "Hubble-like" constant in 1/s (i.e. light-sec/s/light-sec)
    this.Hubble = 0.01; // Arbitrary default (gives upper limit of 100 sec)

    // "Density" parameters
    this.OmegaMass = 0.26; // Default to a "flat" soniverse (i.e. OmegaTotal = 1)
    this.OmegaVac = 0.74;

} // class SoniverseModel

// -----------------------------------------------------------------------
// Methods for SoniverseModel


// Given a "natural" wavelength, get its "physical" value
SoniverseModel.prototype.wlen2physical = function(wl) {
    return(wl * this.Cphys);
}
// Given a "physical" wavelength, get its "natural" value
SoniverseModel.prototype.wlen2natural = function(w) {
    return(wl / this.Cphys);
}



// =======================================================================
// Cosmological paramters of a "position"

var SoniPosition = function() {

        // This is the core value that the others are calculated from (given a SoniverseModel)
    this.z = 0.0; // Pitchshift.
    
    this.age = 0.0; // Age the the Soniverse (does not depend on "z" but is calculated at the same time)
    this.zage = 0.0; // Age at the given z
    this.travelt = 0.0; // Sound travel time from z (i.e. the delay)
    this.voldist = 0.0; // "Volume" distance (i.e. the inverse-square-drop distance)
    this.angdist = 0.0; // "Angular size" distance (no direct sonic equivalence)
    this.comovdist = 0.0; // Comoving Distance.

};

// -----------------------------------------------------------------------
// Methods for SoniPosition

// Given a SoniverseModel, calcualte the relevant values for the current "z"
// This is based heavily on Ned Wright's Javascript Cosmology Calculator:
//   http://www.astro.ucla.edu/~wright/CosmoCalc.html

SoniPosition.prototype.calculate = function(model) {

    var calcDCMT = function(oval, comovdist) {
	var ratio = 1.0;
	var x,y;
	x = Math.sqrt(Math.abs(oval)*comovdist);
	if(x>0.1) {
	    ratio = (oval > 0) ? 0.5*(Math.exp(x)-Math.exp(-x))/x : Math.sin(x)/x;
	    y = ratio*comovdist;
	    return y;
	}
	y = x*x;
	if(oval < 0) y = -y;
	ratio = 1 + y/6 + y*y/120;
	y = ratio * comovdist;
	return y;
    };

    // Do we have a model?
    try {
	if(!model instanceof SoniverseModel) throw "Model is not a SoniverseModel";
    }
    catch(err) {
	console.log("SoniPosition:calculate " + err);
	return;
    }


    // Some basic paramters:
    var i=0; // A useful index variable for loops
    var n = 1000; // Number of step in integrals
    var a,az,adot; // Temporary floating values in integrals etc
    var otot; // Omega Total
    var ononf; // Omega deviation from "flatness"
    otot = model.OmegaMass + model.OmegaVac; // I'm ignoreing "OmegaRadiation" as it has no sensible equivalent in the Soniverse
    ononf = 1.0 - otot;
    
    az = 1.0 / (1+1.0*this.z);
    this.age = 0;
    for(i=0; i<n; i++) {
	a =  az * (i+0.5)/n;
	adot =  Math.sqrt(ononf +  (model.OmegaMass/a) + (model.OmegaVac * a * a));
	this.age = this.age + 1/adot;
    }
    this.zage = az*this.age/n; // final zage in units of 1/H0

       // NB: Ignore the corrections for particle annihiliations at this point - not relevant

    this.travelt = 0.0;
    this.comovdist = 0.0;
    for(i=0; i<n; i++) {
	a = az+(1-az)*(i+0.5)/n;
	adot = Math.sqrt(ononf + (model.OmegaMass/a) + (model.OmegaVac*a*a));
	this.travelt = this.travelt + 1/adot;
	this.comovdist = this.comovdist + 1/(a*adot);
    }
    this.travelt = (1-az)*this.travelt / n;  // final "sound travel time" in units of 1/H0
    this.comovdist = (1-az)*this.comovdist / n; // final "Comoving Distance" in units of 1/H0

    this.age = this.travelt + this.zage; // Get correct age of universe in units of 1/H0

    this.angdist = az * calcDCMT(ononf, this.comovdist);  // final angular distance in units of 1/H0
    this.voldist = this.angdist/(az*az); // final volume distance in units of 1/H0

    // Scale everything to standard units
    this.age = this.age / model.Hubble; // Age of the soniverse in seconds
    this.zage =  this.zage  / model.Hubble; // Age at "z" in seconds
    this.travelt = this.travelt / model.Hubble; // Sound travel time from "z" in seconds
    this.voldist =  this.voldist / model.Hubble; // "Volume" (aka luminosity) distance in sound-seconds
    this.angdist = this.angdist / model.Hubble; // "Angular size distance" in sound-seconds
    this.comovdist =  this.comovdist / model.Hubble; // Co-moving distance in sound-seconds

}; // SoniPosition::calculate()


// =======================================================================
// Audio storage and basic manipulation
//
// By default, audio will be stored as a Fourier Spectrum. This allows it
// to have a spectral range much wider that the audible range, which will
// be necessary for large-scale doppler-shifting.


// =======================================================================
// A Class to store audio as a fourier spectrum
//
var AudioSpec = function() {

    this.spec = []; // This will be an array of objects, each consisting of freq, power and phase
    // NB It cannot be assumed that this will be in frequency order
    this.sorted = true;  // Is the array sorted by frequency?
    this.modified = false; // Set to "true" if the spectral data has been modified since the "audio" (below) was last generated

    this.audio = []; // The data in spec convered into a monophonic audio signal
    this.audRate = 44100; // The sampling rate (samples/sec)
    this.audMinFreq = 0.0; // The minimum frequency that contributes to the current "audio"
    this.audMaxFreq = 0.0; // The maximum frequency that contributes to the current "audio"
    
} // class AudioSpec

// -----------------------------------------------------------------------
// Methods for AudioSpec

    // -------------------------------------------------------------------
    // Cleanup the audioSpec to make sure it is ready for a new set of data
AudioSpec.prototype.cleanup = function() {

    this.spec = [];
    this.sorted = true;
    this.modified = true;

};


    // -------------------------------------------------------------------
    // Add a new element to the spectrum array *without* checking that it is in frequency order
AudioSpec.prototype.specAppend = function(frq, pow, phs) {
    this.spec.push({
	"freq": frq,
	"power": pow,
	"phase": phs
    });
    this.modified = true;
	// Check to see if the array is still sorted...
	// If this is the first element it is sorted
    if(this.spec.length == 1) {
	this.sorted = true;
	    // Otherwise, if it wasn't already sorted, it won't magically become sorted...
    } else if(this.sorted == false) {
	this.sorted = false; // No change...
	    // Otherwise we need to check that this is > the previous value. If this is always true, then the array is sorted
    } else if(frq <= this.spec[(this.spec.length)-2].freq) {
	this.sorted = false;
    }
};



    // -------------------------------------------------------------------
    // Make sure that the spectrum is in frequency order
AudioSpec.prototype.specOrder = function() {
    this.spec.sort(function(a, b) {
	return parseFloat(a.freq) - parseFloat(b.freq);
    });
    this.sorted = true;
};

    // -------------------------------------------------------------------
    // Several functions for getting relevant aspects of the spectral array
AudioSpec.prototype.numFreq = function() {
    return(this.spec.length);
};
AudioSpec.prototype.isSorted = function() {
    return(this.sorted);
};
AudioSpec.prototype.minFreq = function() {
    if(!this.sorted) {
	this.specOrder();
    }
    return(this.spec[0].freq);
};
AudioSpec.prototype.maxFreq = function() {
    if(!this.sorted) {
	this.specOrder();
    }
    return(this.spec[(this.spec.length)-1].freq);
};

    // -------------------------------------------------------------------
    // Converting the spectral array into an audio signal array
    // where "audiolen" is the length of the audio in samples
AudioSpec.prototype.genAudio = function(audiolen) {

    if(!this.modified && (audiolen == this.audio.length)) {
	return 1; // Flag for "nothing needed doing"
    }

    var numsec; // length of the audio to generate in seconds
    numsec = audiolen / this.audRate;

    var numsam; // The length of the audio to create from the FFT (must be a power of two)
                // Once generated, the actaul data will be truncated to audiolen if neededu
    if( (audiolen && (audiolen & (audiolen - 1))) === 0) {
	numsam = audiolen;
    } else {
	var n = Math.log(audiolen) / Math.log(2);
	n = Math.floor(n)+1;
	numsam = Math.floor(Math.pow(2,n));
    }

    // Create an FFT complex array ready to invert and initialise it to 0
    var fftdata = new complex_array.ComplexArray(numsam);
    for(var i=0; i<numsam; i++) {
	fftdata.real[i] = 0;
	fftdata.imag[i] = 0;
    }

    // What are the minimum and maximum frequencies that are relvant to this FFT?
    //   min = (frequency for FFT bin 2)/2;
    this.audMinFreq = 0.5 * this.audRate / numsam;
    //   max = (frequency for FFT bin numsam-1)
    this.audMaxFreq = (numsam-1) * this.audRate / numsam;

    // Loop over the spectral data and add approriate phased data to each spectral FFT component
    var frq, pow, phs, rl, im, ffti;
    for(var i=0; i<this.numFreq(); i++) {

	frq = this.spec[i].freq;
	if((frq >= this.audMinFreq) && (frq < this.audMaxFreq)) {
	    pow = this.spec[i].power;
	    phs = this.spec[i].phase;

	    // What FFT index will this frequency correspond to?
	    ffti = Math.floor(frq * numsam / this.audRate);

	    // And convert power/phase into real/imag components
	    rl = pow * Math.cos(phs);
	    im = pow * Math.sin(phs);
	    fftdata.real[ffti] += rl;
	    fftdata.imag[ffti] += im;
	}
    }


    // Invert the FFT and pull the relevant data out
    fftdata.InvFFT();

    this.audio = new Array(); // Clean out any old data
    for(var i=0; i<audiolen; i++) {
	this.audio.push(fftdata.real[i]);
    }


    this.modified = false;
    return 0; // Flag for "everything went fine, with new data created"
}

// =======================================================================
// Basic manipulation in the Soniverse

// ------------------------------------------------------------------------
// Apply a cosmological redshift to an AudioSpec object to create a new one
// ("blueshifts" can relevant data out created with negative z).

AudioSpec.prototype.redshift = function(z, outSpec) {

    // Make sure outSpec is "clean" and empty
    outSpec.cleanup();

    // Just "shift" the frequency component
    var newf;
    for(var i=0; i<this.spec.length; i++) {
	newf = (this.spec[i].freq)/(z+1.0);
	outSpec.specAppend(newf, this.spec[i].power, this.spec[i].phase);
    }
};
