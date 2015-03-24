var recorder;
(function(window) {
    
	recorder = {
		/**
		 *the events are 
		 * begin: when someone starts to record
		 * stop: when some program stops the current recording
		 * clear: when some program clear the recorder
		 * config: when someone changes the config
		 * convert: when the module begins to convert some wave to MP3
		 * newrecord: when the MP3 convertation is finished 
		 */
		_events: {},
        on: function(event, callback) {
			event = event.toLowerCase();
            if (!(event in this._events))
                this._events[event] = [];
            if (this._events[event].indexOf(callback) === -1)
                this._events[event].push(callback);
        },
        off: function(event, callback) {
            if (!event) {
                this._events = {};
                return;
            }
            if (!callback) {
                delete this._events[event];
            } else {
                delete this._events[event][this._events[event].indexOf(callback)];
            }
        },
        trigger: function(event, args) {
            if (!event)
                return;
            if (!this._events[event])
                return;
            var i = this._events[event].length;
            while (i--) {
                this._events[event][i](args);
            }
        },
		init: function() {
			try {
				// webkit shim
				window.AudioContext = window.AudioContext || window.webkitAudioContext;
				navigator.getUserMedia = (navigator.getUserMedia || 
				navigator.webkitGetUserMedia || 
				navigator.mozGetUserMedia || 
				navigator.msGetUserMedia);
				window.URL = window.URL || window.webkitURL;
				
				this._audio_context = new AudioContext;
			} catch (e) {
				alert('No web audio support in this browser!');
			}
			
			navigator.getUserMedia({audio: true}, startUserMedia, function(e) {
				console.error('no reccorder access');
			});
		},
		record:function(){
			this._recorder.record();
			this.trigger('begin');
		},
		stop: function() {
			this._recorder.stop();
			this.trigger('stop');
			this.clear();
        },
		clear: function(){
			this._recorder.clear();
			this.trigger('clear')
		},
		/**
		 * @param config {object} some object with options
		 *		options are:
		 *			bitrate: int || 128
		 *			
		 */
		configure:function(config){
			this._recorder.configure(config);
			this.trigger('config')
		},
		_audio_context: null,
		_recorder:null
	}
	
    function startUserMedia(stream) {
        var input = recorder._audio_context.createMediaStreamSource(stream);

        //uncomment the next line, to listen the sound directly
        //input.connect(audio_context.destination);
        
        recorder._recorder = new Recorder(input,{bitrate:8});
    }
    
	
	// internal Recorder Module from https://github.com/nusofthq/Recordmp3js
    var WORKER_PATH = 'js/recorderWorker.js';
    var encoderWorker = new Worker('js/mp3Worker.js');
    
    var Recorder = function(source, cfg) {
        // simple event system
        

        //recorder itself
        var config = cfg || {};
        var bufferLen = config.bufferLen || 2048;
        this.context = source.context;
        this.node = (this.context.createScriptProcessor || 
        this.context.createJavaScriptNode).call(this.context, bufferLen, 2, 2);
        
        var worker = new Worker(config.workerPath || WORKER_PATH);
        worker.postMessage({
            command: 'init',
            config: {sampleRate: this.context.sampleRate}
        });
        var recording = false;
        
        this.node.onaudioprocess = function(e) {
            if (!recording)
                return;
            worker.postMessage({
                command: 'record',
                buffer: [
                    e.inputBuffer.getChannelData(0), 
                //e.inputBuffer.getChannelData(1)
                ]
            });
        }
        
        this.configure = function(cfg) {
            for (var prop in cfg) {
                if (cfg.hasOwnProperty(prop)) {
                    config[prop] = cfg[prop];
                }
            }
        };
        this.isRecording = function(){
			return recording;
		};
        this.record = function() {
            recording = true;
        };
        
        this.stop = function() {
            recording = false;
			this.exportWAV();
        };
        
        this.clear = function() {
            worker.postMessage({command: 'clear'});
        };
        
        this.getBuffer = function(cb) {
            worker.postMessage({command: 'getBuffer'})
        };
        
        this.exportWAV = function(cb, type) {
			type = type || config.type || 'audio/wav';
            worker.postMessage({
                command: 'exportWAV',
                type: type
            });
        };
        //Mp3 conversion
        worker.onmessage = function(e) {
            var blob = e.data;
            //console.log("the blob " ,	blob , " " + blob.size + " " + blob.type);
            
            var arrayBuffer;
            var fileReader = new FileReader();
            
            fileReader.onload = function() {
                arrayBuffer = this.result;
                var buffer = new Uint8Array(arrayBuffer);
                var data = parseWav(buffer);
                
                console.log(data);
                console.log("Converting to Mp3");
                recorder.trigger('convert');
                //log.innerHTML += "\n" + "Converting to Mp3";
                
                encoderWorker.postMessage({cmd: 'init',config: {
					mode: 3,
					channels: 1,
					samplerate: data.sampleRate,
					bitrate: config.bitrate || data.bitsPerSample
				}});
                
                encoderWorker.postMessage({cmd: 'encode',buf: Uint8ArrayToFloat32Array(data.samples)});
                encoderWorker.postMessage({cmd: 'finish'});
                encoderWorker.onmessage = function(e) {
                    if (e.data.cmd == 'data') {
                        console.log("Done converting to Mp3");
                        recorder.trigger('newrecord', [new Record(e.data.buf)]);
                    }
                };
            };
            fileReader.readAsArrayBuffer(blob);
        }
		
        function parseWav(wav) {
            function readInt(i, bytes) {
                var ret = 0, 
                shft = 0;
                
                while (bytes) {
                    ret += wav[i] << shft;
                    shft += 8;
                    i++;
                    bytes--;
                }
                return ret;
            }
            if (readInt(20, 2) != 1)
                throw 'Invalid compression code, not PCM';
            if (readInt(22, 2) != 1)
                throw 'Invalid number of channels, not 1';
            return {
                sampleRate: readInt(24, 4),
                bitsPerSample: readInt(34, 2),
                samples: wav.subarray(44)
            };
        }
        
        function Uint8ArrayToFloat32Array(u8a) {
            var f32Buffer = new Float32Array(u8a.length);
            for (var i = 0; i < u8a.length; i++) {
                var value = u8a[i << 1] + (u8a[(i << 1) + 1] << 8);
                if (value >= 0x8000)
                    value |= ~0x7FFF;
                f32Buffer[i] = value / 0x8000;
            }
            return f32Buffer;
        }
        
        source.connect(this.node);
        this.node.connect(this.context.destination); //this should not be necessary
    };
	function encode64(buffer) {
		var binary = '', 
		bytes = new Uint8Array(buffer), 
		len = bytes.byteLength;
		
		for (var i = 0; i < len; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return window.btoa(binary);
	}
		
    /*Recorder.forceDownload = function(blob, filename){
	console.log("Force download");
		var url = (window.URL || window.webkitURL).createObjectURL(blob);
		var link = window.document.createElement('a');
		link.href = url;
		link.download = filename || 'output.wav';
		var click = document.createEvent("Event");
		click.initEvent("click", true, true);
		link.dispatchEvent(click);
	}*/


    /**
	 * @class
	  *@param data {buffer}
	 */
    function Record(data) {
        this.data = data;
    }
	Record.prototype.getDataURL = function(){
		return 'data:audio/mp3;base64,'+encode64(this.data);
	};
    Record.prototype.upload = function(url,filename,sucess,progress) {
		var that = this;
		var mp3Blob = new Blob([new Uint8Array(this.data)], {type: 'audio/mp3'});
		var reader = new FileReader();
		reader.onload = function(event) {
			var fd = new FormData();
			var mp3Name = encodeURIComponent(filename);
			console.log("mp3name = " + mp3Name);
			fd.append('fname', mp3Name);
			fd.append('data', mp3Blob, mp3Name);
			// Set up the request.
			var xhr = new XMLHttpRequest();
			xhr.open('POST', url, true);
			// Set up a handler for when the request finishes.
			xhr.onload = function() {
				if(!sucess)return;
				if (xhr.status === 200 ) {
					sucess(null,mp3Name);
				} else {
					sucess('An error occurred!');
				}
			};
			xhr.upload.addEventListener('progress', function(e) {
				var progressValue = e.loaded / e.total;
				if(progress)
					progress(progressValue)
			});
			// Send the Data.
			xhr.send(fd);
		};
		reader.readAsDataURL(mp3Blob);
    }
        
})(window);
