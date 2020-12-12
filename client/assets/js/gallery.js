const crypto            = require('crypto'); // tot sign our pre-signed URL
const marshaller        = require("@aws-sdk/eventstream-marshaller"); // for converting binary event stream messages to and from JSON
const util_utf8_node    = require("@aws-sdk/util-utf8-node"); // utilities for encoding and decoding UTF8
const mic               = require('microphone-stream'); // collect microphone input as a stream of raw bytes
const creds             = require('./credentials.json');

let socket;
let micStream;
const eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);

$('#submit-query').click(function() {
    $('#error').hide();
    getPhotos();
});

$('#submit-upload').click(function() {
    $('#error').hide();
    uploadPhoto();
});

$('#record').click(function() {
    $('#record').hide()
    $('#error').hide();
    $('#stop-record').show()
    window.navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
    }).then(function (stream){stream_audio(stream);})
    .catch(function (error) {
        showError('There was an error transcribing your audio. Please try again.');
        $('#stop-record').hide();
        $('#record').show();
        console.log(error);
    });
});

$('#stop-record').click(function() {
    $('#stop-record').hide();
    $('#record').show();
    
    if (socket.readyState === socket.OPEN) {
        micStream.stop();

        // Send an empty frame so that Transcribe initiates a closure of the WebSocket after submitting all transcripts
        let emptyMessage = getAudioEventMessage(Buffer.from([]));
        let emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
        socket.send(emptyBuffer);
    }
});

function getPhotos() {
    $('#search-icon').removeClass("fa-search");
    $('#search-icon').addClass("fa-spinner");
    var query = $('#search-input').val();
    if ($.trim(query) == '') {
        return false;
    }
    $('#search-input').val('');
    sdk.searchGet({'q': encodeURIComponent(query)}, {}, {})
        .then((response)=>{
            console.log(response)
            var data = response.data;
            if (data.results) {
                var photos = data.results;
                $('.gallery').empty();
                var i = 0;
                for (let photo of photos) {
                    row = Math.floor(i/4);
                    if(i%4 == 0) {
                        $('.gallery').append("<div id='row"+row+"'></div>")
                    }
                    var $newphoto = $("<img src='"+photo.url+"'>");
                    $('#row'+row).append($newphoto);
                    i+=1;
                }
            }
            $('#search-icon').removeClass("fa-spinner");
            $('#search-icon').addClass("fa-search");
        });
}

function uploadPhoto() {
    $('#upload-icon').removeClass("fa-upload");
    $('#upload-icon').addClass("fa-spinner");
    const reader = new FileReader();  
    var filename = $('#upload-img').val().split('\\').pop();
    var imgFiles = $('#upload-img').prop('files');
    if(imgFiles.length > 0) {
        let imgFile=imgFiles[0];
        reader.onload = function(e) {
            let img_bin = e.target.result.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
            sdk.uploadKeyPut({'key': filename, 'Content-Type': 'application/json'}, img_bin, {})
                .then((response)=>{
                    $('#upload-icon').removeClass("fa-spinner");
                    $('#upload-icon').addClass("fa-upload");
                });
            $('#upload-img').val('');
        };
        reader.readAsDataURL(imgFile);
    }
}

function stream_audio(stream) {
    var inputSampleRate;
    micStream = new mic();
    
    micStream.on("format", function(data) {
        inputSampleRate = data.sampleRate;
    });

    micStream.setStream(stream);
    var url = generate_presigned_URL();
    socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onopen = function() {
        micStream.on('data', function(rawAudioChunk) {
            let binary = convertAudioToBinaryMessage(rawAudioChunk, inputSampleRate);

            if (socket.readyState === socket.OPEN)
                socket.send(binary);
        }
    )};

    let transcribeException = false;
    socket.onmessage = function (message) {
        //convert the binary event stream message to JSON
        let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(message.data));
        let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
        if (messageWrapper.headers[":message-type"].value === "event") {
            handleEventStreamMessage(messageBody);
        }
        else {
            transcribeException = true;
            showError(messageBody.Message);
            $('#stop-record').hide();
            $('#record').show();
        }
    };

    let socketError;
    socket.onerror = function () {
        socketError = true;
        showError('WebSocket connection error. Try again.');
        $('#stop-record').hide();
        $('#record').show();
    };
    
    socket.onclose = function (closeEvent) {
        micStream.stop();
        
        // the close event immediately follows the error event; only handle one.
        if (!socketError && !transcribeException) {
            if (closeEvent.code != 1000) {
                showError('</i><strong>Streaming Exception</strong><br>' + closeEvent.reason);
            }
            $('#stop-record').hide();
            $('#record').show();
        }
    };
}

function generate_presigned_URL() {
    var now = new Date();
    var method = "GET";
    var service = "transcribe";
    var region = creds.region;
    var endpoint = "wss://transcribestreaming."+region+".amazonaws.com:8443";
    var host = "transcribestreaming."+region+".amazonaws.com:8443";
    var amz_date = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    var datestamp = amz_date.substring(0, 8);

    var canonical_uri = "/stream-transcription-websocket";

    var canonical_headers = "host:" + host + "\n";
    var signed_headers = "host";

    var algorithm = "AWS4-HMAC-SHA256";

    var credential_scope = datestamp + "/" + region + "/" + service + "/" + "aws4_request";

    var canonical_querystring  = "X-Amz-Algorithm=" + algorithm;
    canonical_querystring += "&X-Amz-Credential="+ encodeURIComponent(creds.access_key + "/" + credential_scope);
    canonical_querystring += "&X-Amz-Date=" + amz_date;
    canonical_querystring += "&X-Amz-Expires=300";
    canonical_querystring += "&X-Amz-SignedHeaders=" + signed_headers;
    canonical_querystring += "&language-code=en-US&media-encoding=pcm&sample-rate=16000";

    var payload_hash = crypto.createHash('sha256').update('', 'utf8').digest('hex');

    var canonical_request = method + '\n' + canonical_uri + '\n' + canonical_querystring + '\n' + canonical_headers + '\n' + signed_headers + '\n' + payload_hash;

    var string_to_sign = algorithm + "\n"+ amz_date + "\n" + credential_scope + "\n" + crypto.createHash('sha256').update(canonical_request, 'utf8').digest('hex');
    var signing_key = generate_signing_key(creds.secret, datestamp, region, service);
    var signature = crypto.createHmac('sha256', signing_key).update(string_to_sign, 'utf8').digest('hex');

    canonical_querystring += "&X-Amz-Signature=" + signature;
    return endpoint + canonical_uri + "?" + canonical_querystring;
}


function generate_signing_key(secret, timestamp, region, service) {
    var kDate = crypto.createHmac('sha256', "AWS4" + secret).update(timestamp, 'utf8').digest();
    var kRegion = crypto.createHmac('sha256', kDate).update(region, 'utf8').digest();
    var kService = crypto.createHmac('sha256', kRegion).update(service, 'utf8').digest();
    var kSigning = crypto.createHmac('sha256', kService).update("aws4_request", 'utf8').digest();
    return kSigning;
}

function convertAudioToBinaryMessage(audioChunk, inputSampleRate) {
    let raw = mic.toRaw(audioChunk);

    if (raw == null)
        return;

    // downsample and convert the raw audio bytes to PCM
    let downsampledBuffer = downsampleBuffer(raw, inputSampleRate);
    let pcmEncodedBuffer = pcmEncode(downsampledBuffer);

    // add the right JSON headers and structure to the message
    let audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));

    //convert the JSON object + headers into a binary event stream message
    let binary = eventStreamMarshaller.marshall(audioEventMessage);

    return binary;
}

function pcmEncode(input) {
    var offset = 0;
    var buffer = new ArrayBuffer(input.length * 2);
    var view = new DataView(buffer);
    for (var i = 0; i < input.length; i++, offset += 2) {
        var s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}

function downsampleBuffer(buffer, inputSampleRate = 44100, outputSampleRate = 16000) {  
    if (outputSampleRate === inputSampleRate) {
        return buffer;
    }

    var sampleRateRatio = inputSampleRate / outputSampleRate;
    var newLength = Math.round(buffer.length / sampleRateRatio);
    var result = new Float32Array(newLength);
    var offsetResult = 0;
    var offsetBuffer = 0;
    
    while (offsetResult < result.length) {

        var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);

        var accum = 0,
        count = 0;
        
        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++ ) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;

    }

    return result;

}

function getAudioEventMessage(buffer) {
    // wrap the audio data in a JSON envelope
    return {
        headers: {
            ':message-type': {
                type: 'string',
                value: 'event'
            },
            ':event-type': {
                type: 'string',
                value: 'AudioEvent'
            }
        },
        body: buffer
    };
}

function handleEventStreamMessage(messageBody) {
    let results = messageBody.Transcript.Results;

    if (results.length > 0) {
        if (results[0].Alternatives.length > 0) {
            let transcript = results[0].Alternatives[0].Transcript;

            // fix encoding for accented characters
            transcript = decodeURIComponent(escape(transcript));

            $('#search-input').val(transcript);
        }
    }
}

function showError(message) {
    $('#error').html('<i class="fa fa-times-circle"></i> ' + message);
    $('#error').show();
}