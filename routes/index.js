var express = require('express');
var util = require("util");
var io = require('socket.io')(8081);
var shortid = require('shortid');
var router = express.Router();
var Data = require('../database/data');
var Room = require('../database/room');

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { roomId: -1 });
});

router.get('/mongoT', function(req, res, next) {
    var silence = new Data({ area: 12 });
    silence.save();
    res.end(JSON.stringify(silence));
});

router.get('/play', function(req, res, next) {
    res.render('index', { roomId: -1 });
});

/* Create room */
router.post('/create', function(req, res, next) {
    var manager = req.body.user_id;

    var newRoom = new Room({
        users: [ manager ],
        bound: {
            'latitudeMin': req.body.min_latitude,
            'latitudeMax': req.body.max_latitude,
            'longitudeMin': req.body.min_longitude,
            'longitudeMax': req.body.max_longitude
        }
    });
    newRoom.save();

    var data = new Data({userId: manager});
    data.save();

    res.render('create', { roomId: newRoom.roomId});
});

router.get('/create', function(req, res, next) {
    res.render('create', { roomId: -1});
});

/* Join room */
router.post('/join', function(req, res, next) {
    Room.where({ 'roomId': req.body.room_id }).findOne(function (err, room) {
        console.log(err, room);
        if (room) {
            room.users.push(req.body.user_id);

            room.users = room.users.filter(function(elem, pos) {
                return room.users.indexOf(elem) == pos;
            })

            room.save();

            var data = new Data({userId: req.body.user_id});
            data.save();

            io.emit('join', {userId: req.body.user_id});
            res.end(JSON.stringify({ 'roomId': room.roomId}));
        } else {
            res.end(JSON.stringify({'error': 'not found'}));
        }
    });
});

/* Update user location */
router.post('/update', function(req, res, next) {
    var LatLng;
    var userId = req.body.user_id;
    var pos = {
        'latitude': req.body.latitude,
        'longitude': req.body.longitude
    }

    Room.where({ 'roomId': req.body.room_id }).findOne(function (err, room) {
        LatLng = room.bound;

        var time = new Date();
        time = (time - room.time)/60000;
        var msg;

        if (time>= 10) {
            res.end(JSON.stringify({'msg': 'game_end_timeout'}));
        } else {
            Data.where({'userId': userId}).findOne(function(err, data){
                data.path.push(pos);
                data.save();

                io.emit('update', {userId: userId, pos: pos});

                if (time > 2) {
                    var startPoint = data.path[0];

                    var lng = Math.pow(startPoint.longitude - pos.longitude, 2);
                    var lat = Math.pow(startPoint.latitude - pos.latitude, 2);

                    var dis = Math.sqrt(lng+lat) * 100000;

                    if (dis <= 16*Math.sqrt(2)) {
                        res.end(JSON.stringify({'msg': 'game_end_calc_score'}));
                        io.emit('end', {userId: userId});
                        data.complete = true;
                        data.save();
                    }
                }
                res.end(JSON.stringify({'msg': 'game_update_ok'}));
            });
        }
    });
});


io.on('connection', function(socket) {
    socket.on('init', function(data){
        var sdata = {};
        roomId = data.roomId;

        Room.where({ 'roomId': roomId }).findOne(function (err, room) {
            var cursor = Data.find().where('userId').in(room.users).exec(function(err, docs) {
                // console.log(docs, b);
                sdata['paths'] = docs;
                sdata['bound'] = room.bound;
                
                console.log(sdata);
                socket.emit('init', sdata);
            });

        });

    });
});

module.exports = router;
