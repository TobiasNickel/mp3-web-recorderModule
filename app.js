var express = require('express');

var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var fs = require('file-system');

var app = express();
var http = require('http').Server(app);


// websocket connection
var sockets=[];
var io = require('socket.io')(http);
io.on('connection', function(socket){
	sockets.push(socket);
	console.log('a user connected, cound:',sockets.length);
	io.emit('usercount',sockets.length)
	socket.on('disconnect', function(){
		sockets.splice(sockets.indexOf(socket),1)
		console.log('user disconnected');
		io.emit('usercount',sockets.length)
	});
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


app.use(logger('dev'));
//app.use(bodyParser.json());
//app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
//	res.end();
    next();
}

//uncomment the next line to allow cros domain fileupload
app.use(allowCrossDomain);

var fs = require('fs');
var formidable = require('formidable');
app.post('/upload.json', function(req, res,next) {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
        res.writeHead(200, {'content-type': 'text/plain'});
        res.write('received upload:\n\n');
        res.end("end");
    });
    form.on('end', function(fields, files) {
        for(var i = 0; i < this.openedFiles.length;i++){
            fs.createReadStream(this.openedFiles[i].path).pipe(
                fs.createWriteStream('./public/uploads/'+this.openedFiles[i].name)
            );
			var that = this;
			setTimeout(function(){
				io.emit( 'play', '/uploads/'+that.openedFiles[0].name);
			},500);
        }
    });
});
app.use('/upload.json', function(req, res,next) {
	res.end('true');
});
app.use('/uploads.json',function(req,res,next){
    fs.readdir('./public/uploads/', function(err,files){
        res.json(files);
    })
});

/// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if(app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


http.listen(1337, function(){
    console.log('listening on *:3000');
});
