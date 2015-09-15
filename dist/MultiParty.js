/**
 * MultiParty.ts
 *
 * SkyWayで簡単にマルチパーティ接続を実現するライブラリ
 * https://github.com/nttcom/SkyWay-MultiParty/blob/master/lib/MultiParty.js
 *
 *
 Copyright (c) 2015 NTT Communications Corporation, http://www.ntt.com

 (The MIT License)

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
 "Software"), to deal in the Software without restriction, including
 without limitation the rights to use, copy, modify, merge, publish,
 distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to
 the following conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * a3cddd6072481b99578a5aab548846bad2fee375
 * の派生版( modifier: MKGaru )
 * 変更点：
 * 　開発言語を、javascript から typescriptに移植しました。
 * 　Peer間でDataChannelを繋ぐ祭、接続先が自分と同じRoomかを判定して、不正な接続であれば切断するようにしました。
 * 　　（Room名がわからずRoomID(Hash)では接続できないようにしました。（盗聴防止））
 * 　ハッシュアルゴリズムをMD5から、SHA-224に変更しました。
 * 　SkyWayに接続完了時、各peerへの自動発信を任意のタイミングに変更できるようにしました（auto_call option）
 * 　Peer間でのMediaStream開始時、応答(answer)の可否をユーザ設定できるようにしました（manual_answer option)
 * 　他、いくつかの調整。
 */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var SkyWay;
(function (SkyWay,jsSHA,EventEmitter2) {
    navigator.getUserMedia =
        navigator.getUserMedia
            || navigator.webkitGetUserMedia
            || navigator.mozGetUserMedia;
    var AudioContext = window['AudioContext'] || window['webkitAudioContext'];
    var util;
    (function (util) {
        function checkOpts(opts_) {
            var opts = {};
            // key check (なかったら throw)
            if (!opts_.key || typeof (opts_.key) !== "string")
                throw "app key must be specified";
            // key check ( string patter がマッチしなかったら throw )
            if (!opts_.key.match(/^[0-9a-z]{8}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{12}$/))
                throw "wrong string pattern of app key";
            // copy key
            opts.key = opts_.key;
            // todo : room prefix にdomainを意識したほげほげ
            // room check (なかったら "")
            if (!opts_.room || typeof (opts_.room) !== "string") {
                var seed = "";
            }
            else if(!opts_.room.match(/^[0-9a-zA-Z\-\_]{4,32}$/)){
                throw "room name should be digit|alphabet and length between 4 and 32";
            }
            else {
                var seed = opts_.room;
            }
            opts.room_name = seed;
            opts.room_id = util.makeRoomID(seed);

            // id check (なかったら生成）
            var hash_ = location.pathname + "_peer_id";
            if (!!sessionStorage[hash_]) {
                opts.id = opts.room_id + sessionStorage[hash_];
            }
            else if (!opts_.id || typeof (opts_.id) !== "string") {
                opts.id = opts.room_id + util.makeID();
            }
            else {
                opts.id = opts.room_id + opts_.id;
            }
            sessionStorage[hash_] = opts.id.substring(opts.room_id.length);
            // reliable check (なかったら false)
            opts.reliable = !!opts_.reliable;
            // serialization check (未指定なら binary)
            if (!opts_.serialization) {
                opts.serialization = "binary";
            }
            else {
                // serializationのタイプをチェックする
                // binary, utf-8, json以外はエラー
                opts.serialization = opts_.serialization;
            }
            // stream check
            opts.video_stream = (opts_.video === undefined ? true : opts_.video);
            opts.audio_stream = (opts_.audio === undefined ? true : opts_.audio);
            opts.use_stream = opts.video_stream || opts.audio_stream;
            opts.auto_call = opts_.auto_call === undefined ? true : opts_.auto_call;
            opts.manual_answer = opts_.manual_answer === undefined ? function (peerId, cb) { return cb(true); } : opts_.manual_answer;
            // polling disconnect/reconnect (must for FF)
            opts.polling = (opts_.polling === undefined ? true : opts_.polling);
            opts.polling_interval = (opts_.polling_interval === undefined ? 3000 : opts_.polling_interval);
            // peerjs options
            opts.peerjs_opts = {
                debug: opts_.debug || false,
                key: opts.key
            };
            if (opts_.host)
                opts.peerjs_opts.host = opts_.host;
            if (opts_.port)
                opts.peerjs_opts.port = opts_.port;
            if (opts_.secure)
                opts.peerjs_opts.secure = opts_.secure;
            if (opts_.config)
                opts.peerjs_opts.config = opts_.config;
            return opts;
        }
        util.checkOpts = checkOpts;
        function makeToken(room_name, local, remote) {
            var sha = new jsSHA('SHA-224', 'TEXT');
            var seed = local + '_' + room_name + '_' + remote;
            sha.update(seed);
            return sha.getHash("HEX");
        }
        util.makeToken = makeToken;
        function makeID() {
            var id = "";
            for (var i = 0; i < 32; i++) {
                // id += String.fromCharCode( (Math.random() * (125 - 33) + 33) | 0)
                id += String.fromCharCode((Math.random() * (57 - 48) + 48) | 0);
            }
            return id;
        }
        util.makeID = makeID;
        function makeRoomID(seed) {
            var sha = new jsSHA('SHA-224', 'TEXT');
            seed = seed || "";
            //seed += location.host + location.pathname;
            //return CybozuLabs.MD5.calc(seed).substring(0,6) + "R_";
            sha.update(seed);
            var hash = sha.getHash("HEX");
            return hash.substring(0, 8) + "R_";
        }
        util.makeRoomID = makeRoomID;
        function createVideoNode(video) {
            // 古いノードが会った場合は削除
            var prev_node = document.getElementById(video.id);
            if (prev_node)
                prev_node.parentNode.removeChild(prev_node);
            // 表示用のビデオノードを作る
            var v_ = document.createElement("video");
            v_.setAttribute("src", video.src);
            v_.setAttribute("id", video.id);
            var played = false;
            v_.addEventListener("loadedmetadata", function (ev) {
                if (!played) {
                    played = true;
                    this.play();
                }
            }, false);
            // since FF37 sometimes doesn't fire "loadedmetadata"
            // work around is after 500msec, calling play();
            setTimeout(function (ev) {
                if (!played) {
                    played = true;
                    v_.play();
                }
            }, 500);
            return v_;
        }
        util.createVideoNode = createVideoNode;
    })(util || (util = {}));
    var MultiParty = (function (_super) {
        __extends(MultiParty, _super);
        function MultiParty(opts) {
            //__extends(MultiParty,new ee2.EventEmitter2())
            //MultiParty.prototype = new ee2.EventEmitter2();
            _super.call(this);
            this.opts = opts;
            this.room = null; //room name
            this.id = null; // ID
            this.key = null; //app key
            this.peers = {}; // peer objects
            this.stream = null; //my media stream
            this.tracks_ = {};
            this.pollInterval = null;
            this.opened = false;
            this.peer = null; //自分自身のpeerオブジェクト
            this.screenStream = null; // SkyWayのScreenStream
            // option をチェック
            // room, myid, key プロパティを割り当てる
            this.opts = util.checkOpts(opts);
            var self = this;
            setTimeout(function (ev) {
                self.conn2SkyWay_();
            }, 0);
        }
        MultiParty.prototype.log_ = function (msg, level) {
            if (level === void 0) { level = 3; }
            if (level <= this.opts.debug)
                console.log(msg);
        };
        /**
         * SkyWayサーバーに繋ぐ
         * @private
         */
        MultiParty.prototype.conn2SkyWay_ = function () {
            var self = this;
            this.peer = new Peer(this.opts.id, this.opts.peerjs_opts);
            // SkyWayサーバーへの接続が完了したら、open イベントを起こす
            this.peer.on('open', function (id) {
                if (self.opened) {
                    self.fire_("sw_err", "Error : connection to SkyWay is already opened");
                    throw "Error : connection to SkyWay is already opened";
                }
                else {
                    self.opened = true;
                }
                // id check
                if (id !== this.opts.id) {
                    throw "Error : SkyWay returns wrong peer id for myself";
                }
                // open イベントを発火する
                self.fire_('open', id);
                // Roomメンバーに接続
                self.connectPeers_();
                self.setupPeerHandler_();
                // 接続確認pollingを始める
                if (this.opts.polling) {
                    self.startPollingConnections_();
                }
            }.bind(this));
            // SkyWayサーバーへの接続が失敗した場合のerror処理
            this.peer.on("error", function (err) {
                self.fire_("sw_err", err);
                //throw "Error : " + err;
            });
        };
        /**
         * APIServerから取得した各Peerに接続を行う
         * @private
         */
        MultiParty.prototype.connectPeers_ = function () {
            var self = this;
            self.listAllPeers(function (peers) {
                peers.forEach(function (peer_id) {
                    self.peers[peer_id] = {};
                });
                // MediaStream処理を開始する
                if (self.opts.use_stream) {
                    self.startMediaStream_();
                }
                // DataChannel処理を開始する
                self.startDataChannel_();
            });
        };
        /**
         * 接続中のIDとサーバのIDを比較して接続・再接続・切断する
         * @private
         */
        MultiParty.prototype.startPollingConnections_ = function () {
            var self = this;
            self.pollInterval = setInterval(function () {
                self.listAllPeers(function (newList) {
                    for (var peer_id in self.peers) {
                        var removeId = true;
                        var addId = false;
                        if (peer_id === undefined) {
                            return;
                        }
                        $.each(newList, function (j, peerId) {
                            if (peer_id === peerId) {
                                removeId = false;
                            }
                            if (self.peers[peerId] == void 0) {
                                addId = true;
                            }
                        });
                        if (removeId) {
                            self.removePeer(peer_id);
                        }
                        else if (addId) {
                            self.DCconnect_(peer_id);
                        }
                        else {
                            var peer = self.peers[peer_id];
                            var reconnect = {
                                video: peer.call ? !peer.call.open : false,
                                screen: peer.screen_sender ? !peer.screen_sender.open : false,
                                data: peer.DCconn ? !peer.DCconn.open : false
                            };
                            if (reconnect.video || reconnect.screen || reconnect.data) {
                                if (!peer.reconnectIndex_) {
                                    peer.reconnectIndex_ = 1;
                                }
                                else {
                                    peer.reconnectIndex_++;
                                }
                                // reconnect on powers of 2 minus (1, 2, 4, 8 ...)
                                if ((peer.reconnectIndex_ & (peer.reconnectIndex_ - 1)) == 0) {
                                    self.reconnect(peer_id, reconnect);
                                }
                            }
                            else {
                                peer.reconnectIndex_ = 0;
                            }
                        }
                    }
                });
            }, self.opts.polling_interval);
        };
        ////////////////////////////////////
        // video 処理
        /**
         * Media Stream 処理の開始
         * @private
         */
        MultiParty.prototype.startMediaStream_ = function () {
            this.startMyStream_();
        };
        /**
         * video stream 取得開始
         * @private
         */
        MultiParty.prototype.startMyStream_ = function () {
            var self = this;
            //Set up AudioContext and gain for browsers that support createMediaStreamSource properly
            //Use the regular stream directly if it doesn't.
            /* Audio Connection
             * [mic media stream]─┬─[ analyzerNode ]─[ scriptNode ] -->void
             *                     │
             *                     └─[ gainNode ]─[ outputNode ]── stream
             */
            var audioContext = new AudioContext();
            self.audioContext_ = audioContext;
            var analyser = audioContext.createAnalyser();
            analyser.smoothingTimeConstant = 0.3;
            analyser.fftSize = 1024;
            self.analyzerNode = analyser;
            self.gainNode = audioContext.createGain();
            var outputNode = audioContext.createMediaStreamDestination();
            self.outputNode_ = outputNode;
            var scriptNode = audioContext.createScriptProcessor(0, 1, 1);
            self.scriptNode = scriptNode;
            scriptNode.onaudioprocess = function () { };
            self.gainNode.connect(outputNode);
            self.stream = outputNode.stream;
            analyser.connect(scriptNode);
            scriptNode.connect(outputNode);
            self.fire_('my_ms', { "src": URL.createObjectURL(self.stream), "id": self.opts.id });
            if (self.opts.auto_call) {
                navigator.getUserMedia({ "video": self.opts.video_stream, "audio": self.opts.audio_stream }, function (stream) {
                    self.bindMediaStream(stream);
                    self.listAllPeers(function (peers) {
                        self.startCall_(peers);
                    });
                }, function (err) { throw err; });
            }
        };
        MultiParty.prototype.bindMediaStream = function (stream) {
            var self = this;
            var mic = self.audioContext_.createMediaStreamSource(stream);
            if (self.mediaStreamSorce_)
                self.mediaStreamSorce_.disconnect();
            self.mediaStreamSorce_ = mic;
            mic.connect(self.analyzerNode);
            mic.connect(self.gainNode);
            if (self.outputNode_.stream.getVideoTracks()[0]) {
                self.outputNode_.stream.removeTrack(self.outputNode_.stream.getVideoTracks()[0]);
            }
            if (stream.getVideoTracks()[0]) {
                self.outputNode_.stream.addTrack(stream.getVideoTracks()[0]);
            }
            // 自己再生（確認）用のトラック
            if (stream.getVideoTracks()[0]) {
                self.tracks_.video = self.stream.getVideoTracks()[0];
            }
            if (stream.getAudioTracks()[0]) {
                self.tracks_.audio = self.stream.getAudioTracks()[0];
            }
        };
        /**
         * MediaTrackをmuteする
         * @param opts
         */
        MultiParty.prototype.mute = function (opts) {
            if (opts === undefined) {
                this.tracks_.audio.enabled = false;
                this.tracks_.video.enabled = false;
                if (this.gainNode !== undefined) {
                    this.gainNode.gain.value = 0;
                }
                return;
            }
            if (opts.audio !== undefined && opts.audio === true) {
                this.tracks_.audio.enabled = false;
                this.tracks_.audio.muted = true;
                if (this.gainNode !== undefined) {
                    this.gainNode.gain.value = 0;
                }
            }
            if (opts.video !== undefined && opts.video === true) {
                this.tracks_.video.enabled = false;
            }
        };
        /**
         * MediaTrackをunmuteする
         * @param opts
         */
        MultiParty.prototype.unmute = function (opts) {
            if (opts === undefined) {
                this.tracks_.audio.enabled = true;
                this.tracks_.video.enabled = true;
                if (this.gainNode !== undefined) {
                    this.gainNode.gain.value = 3;
                }
                return;
            }
            if (opts.audio !== undefined && opts.audio === true) {
                this.tracks_.audio.enabled = true;
                if (this.gainNode !== undefined) {
                    this.gainNode.gain.value = 3;
                }
            }
            if (opts.video !== undefined && opts.video === true) {
                this.tracks_.video.enabled = true;
            }
        };
        /**
         * peersに対して、MediaStream callを開始する
         * @param peers
         * @param isScreen
         * @private
         */
        MultiParty.prototype.startCall_ = function (peers, isScreen) {
            if (peers === void 0) { peers = []; }
            if (isScreen === void 0) { isScreen = false; }
            var self = this;
            peers.forEach(function (peer_id) {
                if (isScreen === true) {
                    if (!self.peers[peer_id].screen_sender || self.peers[peer_id].screen_sender.open) {
                        var call = self.peer.call(peer_id, self.screenStream, { metadata: { type: 'screen', token: self.makeToken_(peer_id) } });
                        self.log_("peer.call called from screenshare startCall_", 3);
                        self.peers[peer_id].screen_sender = call;
                        self.setupStreamHandler_(call);
                    }
                }
                else {
                    var call = self.peer.call(peer_id, self.stream, { metadata: { token: self.makeToken_(peer_id) } });
                    self.log_("peer.call called from generic media exchange startCall_", 3);
                    self.peers[peer_id].call = call;
                    self.setupStreamHandler_(call);
                }
            });
        };
        /**
         * peersに対して、MediaStream callを終了する
         * @param peers
         * @param isScreen
         * @private
         */
        /*
        private endCall_(peers:string[]=[],isScreen=false){
            var self = this;
            peers.forEach(peer_id=>{
                var peer = self.peers[peer_id];
                if(isScreen){
                    if(peer.screen_sender) {
                        peer.screen_sender.close();
                        peer.screen_sender = false;
                    }
                }else{
                    if(peer.call){
                        peer.call.close();
                        peer.call = false;
                        console.log("hangup:"+peer);
                    }
                }
            });
        }
        */
        /**
         * room_nameとlocal_peer_idとremote_peer_idから　Remoteへ接続用のTokenを生成する
         * @param remote peerID
         * @returns {string} Token
         * @private
         */
        MultiParty.prototype.makeToken_ = function (remote) {
            return util.makeToken(this.opts.room_name, remote, this.peer.id);
        };
        MultiParty.prototype.makeToken = function (remote) {
            return this.makeToken_(remote);
        };
        MultiParty.prototype.authPeer_ = function (conn) {
            if (!conn.metadata || !conn.metadata.token)
                return false;
            return conn.metadata.token == util.makeToken(this.opts.room_name, this.peer.id, conn.peer);
        };
        /**
         * 新規に接続してきたpeerからのcallを受け付けるハンドラ
         * @private
         */
        MultiParty.prototype.setupPeerHandler_ = function () {
            var self = this;
            // 新規に接続してきたpeerからのcallを受け付けるハンドラ
            if (!this.peer._events.call || this.peer._events.call.length === 0) {
                this.peer.on('call', function (call) {
                    if (!self.authPeer_(call)) {
                        self.log_("Failed check server connection token.", 1);
                        call.close();
                        return;
                    }
                    if (!self.peers[call.peer]) {
                        self.peers[call.peer] = {};
                    }
                    if (call.metadata && call.metadata.type === 'screen') {
                        self.peers[call.peer].screen_receiver = call;
                        self.opts.manual_answer(call.peer, function (shouldAnswer) {
                            if (shouldAnswer) {
                                call.answer();
                                self.setupStreamHandler_(call);
                            }
                        });
                    }
                    else {
                        self.peers[call.peer].call = call;
                        self.opts.manual_answer(call.peer, function (shouldAnswer) {
                            if (shouldAnswer) {
                                call.answer(self.stream);
                                self.setupStreamHandler_(call);
                                if (!!self.screenStream) {
                                    self.peers[call.peer].screen_sender = self.peer.call(call.peer, self.screenStream, { metadata: { type: 'screen', token: self.makeToken_(call.peer) } });
                                }
                            }
                        });
                    }
                });
            }
        };
        /**
         * peerからのvideo stream, closeに対し、ハンドラをセットする
         * @param call
         * @private
         */
        MultiParty.prototype.setupStreamHandler_ = function (call) {
            var self = this;
            var isReconnect = !!(call.metadata && call.metadata.reconnect);
            call.on('stream', function (stream) {
                if (call.metadata && call.metadata.type === 'screen') {
                    self.peers[this.peer].screen_receiver.stream = stream;
                    self.setupPeerScreen_(this.peer, stream, isReconnect);
                }
                else {
                    self.peers[this.peer].call.stream = stream;
                    self.setupPeerVideo_(this.peer, stream, isReconnect);
                }
            }).on('close', function () {
                // handle peer close event
                // check skyway server to see this user is disconnected.
                var peer_id = this.peer;
                var metadata = this.metadata;
                self.listAllPeers(function (list) {
                    var isDisconnected = true;
                    for (var index in list) {
                        if (list[index] === peer_id) {
                            isDisconnected = false;
                            break;
                        }
                    }
                    if (isDisconnected) {
                        if (metadata && metadata.type === 'screen') {
                            self.fire_('ss_close', peer_id);
                        }
                        else {
                            self.fire_('ms_close', peer_id);
                        }
                        // check if user has any other open connections
                        if (self.peers[peer_id] &&
                            (self.peers[peer_id].call === undefined || !self.peers[peer_id].call.open) &&
                            (self.peers[peer_id].DCconn === undefined || !self.peers[peer_id].DCconn.open) &&
                            (self.peers[peer_id].screen_sender === undefined || !self.peers[peer_id].screen_sender.open)) {
                            self.removePeer(peer_id);
                        }
                    }
                    else {
                    }
                });
            });
        };
        /**
         * peerのvideoのObjectURLを生成し、frontにpeer_msイベントを返す
         * @param peer_id
         * @param stream
         * @param isReconnect
         * @private
         */
        MultiParty.prototype.setupPeerVideo_ = function (peer_id, stream, isReconnect) {
            // prevent to call twice.
            // if(!!this.peers[peer_id].video) return;
            var url = window['URL'].createObjectURL(stream);
            // set isReconnect as boolean
            isReconnect = !!isReconnect;
            this.peers[peer_id].video = stream;
            this.fire_('peer_ms', { id: peer_id, src: url, video: stream, reconnect: isReconnect });
        };
        /**
         * peerのvideo Nodeをセットアップする
         *  loadedmetadataが完了したら、'peer_video'をfireする
         * @param peer_id
         * @param stream
         * @param isReconnect
         * @private
         */
        MultiParty.prototype.setupPeerScreen_ = function (peer_id, stream, isReconnect) {
            var self = this;
            if (!isReconnect) {
                isReconnect = false;
            }
            self.peers[peer_id].screen_receiver.video = stream;
            self.fire_('peer_ss', { src: URL.createObjectURL(stream), id: peer_id, reconnect: isReconnect });
        };
        /**
         * peerのdcとmcを全てクローズする
         * @param peer_id
         */
        MultiParty.prototype.removePeer = function (peer_id) {
            try {
                if (this.peers[peer_id] !== undefined) {
                    var peer = this.peers[peer_id];
                    if (peer.call) {
                        peer.call.close();
                    }
                    if (peer.screen_sender) {
                        peer.screen_sender.close();
                    }
                    if (peer.screen_receiver) {
                        peer.screen_receiver.close();
                    }
                    if (peer.DCconn) {
                        peer.DCconn.close();
                    }
                }
            }
            finally {
                delete this.peers[peer_id];
            }
        };
        //////////////////////////////////
        // DataChannel 処理
        /**
         * DataChannel 処理を開始する
         * @private
         */
        MultiParty.prototype.startDataChannel_ = function () {
            this.startDCconnection_();
        };
        /**
         * DataChannelのコネクション処理を行う
         * @private
         */
        MultiParty.prototype.startDCconnection_ = function () {
            var self = this;
            // API経由で取得したIDには、自分からconnectする
            for (var peer_id in this.peers) {
                this.DCconnect_(peer_id);
            }
            //新規に接続してきたpeerからのconnection要求を受け付けるハンドラ
            this.peer.on('connection', function (conn) {
                if (!self.authPeer_(conn)) {
                    self.log_("Failed check server connection token.", 1);
                    conn.close();
                    return;
                }
                if (!self.peers[conn.peer]) {
                    self.peers[conn.peer] = {};
                }
                if (conn.metadata && conn.metadata.type) {
                    self.fire_('dc_custom', conn);
                }
                else {
                    self.peers[conn.peer].DCconn = conn;
                    self.setupDCHandler_(conn);
                    self.fire_('dc_open', conn.peer);
                }
            });
        };
        /**
         * DataChannelのコネクション処理を行う
         * @param peer_id
         * @constructor
         * @private
         */
        MultiParty.prototype.DCconnect_ = function (peer_id) {
            var conn = this.peer.connect(peer_id, { "serialization": this.opts.serialization, "reliable": this.opts.reliable, metadata: { token: this.makeToken_(peer_id) } });
            this.peers[peer_id].DCconn = conn;
            conn.on('open', function () {
                this.setupDCHandler_(conn);
                this.fire_('dc_open', conn.peer);
            }.bind(this));
        };
        /**
         *  DataChannelのイベントハンドラをセットする
         * @param conn
         * @private
         */
        MultiParty.prototype.setupDCHandler_ = function (conn) {
            var self = this;
            conn.on('data', function (data) {
                self.fire_('message', { "id": this.peer, "data": data });
            }).on('close', function () {
                // handle peer close event
                // check skyway server to see this user is disconnected.
                var peer_id = this.peer;
                var metadata = this.metadata;
                self.listAllPeers(function (list) {
                    var isDisconnected = true;
                    for (var index in list) {
                        if (list[index] === peer_id) {
                            isDisconnected = false;
                            break;
                        }
                    }
                    if (isDisconnected) {
                        self.fire_('dc_close', peer_id);
                        // check if user has any other open connections
                        if (self.peers[peer_id] &&
                            (self.peers[peer_id].call === undefined || !self.peers[peer_id].call.open) &&
                            (self.peers[peer_id].DCconn === undefined || !self.peers[peer_id].DCconn.open) &&
                            (self.peers[peer_id].screen_sender === undefined || !self.peers[peer_id].screen_sender.open)) {
                            self.removePeer(peer_id);
                        }
                    }
                    else {
                    }
                });
            });
        };
        /**
         * DataChannelでつながっている、peerにメッセージを送信する
         * @param data
         * @private
         */
        MultiParty.prototype.send_ = function (data) {
            if (!this.peer) {
                return false;
            }
            if (data && typeof (data) === "string" && data.length === 0) {
                return false;
            }
            if (data && (typeof (data) === "string" || typeof (data) === "object")) {
                for (var peer_id in this.peers)
                    if (this.peers[peer_id].DCconn) {
                        this.peers[peer_id].DCconn.send(data);
                    }
            }
        };
        /**
         * イベントを発火する
         * @param name
         * @param obj
         * @private
         */
        MultiParty.prototype.fire_ = function (name, obj) {
            this.emit(name, obj);
        };
        ////////////////////////////////////
        // public method
        /**
         *  DataChannelでつながっているpeerにメッセージを送信する
         * @param data
         */
        MultiParty.prototype.send = function (data) {
            if (this.peer)
                this.send_(data);
        };
        /**
         * 切断する
         */
        MultiParty.prototype.close = function () {
            if (this.peer)
                this.peer.destroy();
            clearInterval(this.pollInterval);
        };
        /**
         * Voice(またはVideo）通話を開始する
         * @param peers
         */
        MultiParty.prototype.call = function (peers) {
            this.startCall_(peers);
        };
        /**
         * Voice(またはVideo）通話を終了
         * @param peers
         */
        /*
        public hangup(peers:string[],isScreen=false){
            this.endCall_(peers,isScreen);
        }*/
        /**
         * 画面共有を開始する
         * @param peers 対象ピア
         * @param success
         * @param error
         */
        MultiParty.prototype.startScreenShare = function (peers, success, error) {
            if (!this.peer)
                return;
            var self = this;
            if (SkyWay && SkyWay.ScreenShare) {
                var sc = new SkyWay.ScreenShare();
                if (sc.isEnabledExtension()) {
                    sc.startScreenShare({
                        Width: screen.width,
                        Height: screen.height,
                        FrameRate: 5
                    }, function (stream) {
                        self.screenStream = stream;
                        self.startCall_(peers, true);
                        self.log_("MediaConnection created in OFFER", 3);
                        //callback use video
                        success(stream);
                    }, error);
                }
            }
        };
        /**
         * 画面共有を停止する
         */
        MultiParty.prototype.stopScreenShare = function () {
            if (this.screenStream) {
                this.screenStream.stop();
                for (var peer_id in this.peers) {
                    if (this.peers[peer_id].screen_sender) {
                        this.peers[peer_id].screen_sender.close();
                    }
                    delete this.peers[peer_id].screen_sender;
                }
                this.screenStream = undefined;
            }
        };
        /**
         * 同じRoomのpeer listを取得
         * @param callback
         */
        MultiParty.prototype.listAllPeers = function (callback) {
            var self = this;
            this.peer.listAllPeers(function (peers) {
                var roomPeers = [];
                peers.forEach(function (peer_id) {
                    // peer_idが自分のidではなく、かつ、peer_idの接頭辞がroom_idの場合
                    if (peer_id !== self.opts.id && peer_id.indexOf(self.opts.room_id) === 0) {
                        roomPeers.push(peer_id);
                    }
                });
                callback(roomPeers);
            });
        };
        /**
         * ユーザに再接続する
         * @param peer_id
         * @param connections
         */
        MultiParty.prototype.reconnect = function (peer_id, connections) {
            var self = this;
            var peer = self.peers[peer_id];
            if (!peer)
                return;
            if (connections === undefined) {
                connections = {
                    video: true,
                    screen: true,
                    data: true
                };
            }
            if (connections.video) {
                if (peer.call && peer.call.close) {
                    peer.call.close();
                }
                var call = self.peer.call(peer_id, self.stream, { metadata: { reconnect: true, token: self.makeToken_(peer_id) } });
                console.log("peer.call called from reconnect method");
                peer.call = call;
                self.setupStreamHandler_(call);
            }
            if (connections.screen) {
                if (self.screenStream) {
                    if (peer.screen_sender && peer.screen_sender.close) {
                        peer.screen_sender.close();
                    }
                    var call = self.peer.call(peer_id, self.screenStream, { metadata: { reconnect: true, type: 'screen', token: self.makeToken_(peer_id) } });
                    console.log("peer.call called from reconnect method in screenshare");
                    peer.screen_sender = call;
                }
            }
            if (connections.data) {
                if (peer.DCconn && peer.DCconn.close) {
                    peer.DCconn.close();
                }
                var conn = this.peer.connect(peer_id, {
                    "serialization": this.opts.serialization,
                    "reliable": this.opts.reliable,
                    "metadata": { reconnect: true, token: self.makeToken_(peer_id) }
                }).on('open', function () {
                    peer.DCconn = conn;
                    self.setupDCHandler_(conn);
                });
            }
        };
        return MultiParty;
    })(EventEmitter2);
    MultiParty.util = util;
    SkyWay.MultiParty = MultiParty;
})(SkyWay || (SkyWay = {}),(function(){
var exports={};
/*
 A JavaScript implementation of the SHA family of hashes, as
 defined in FIPS PUB 180-2 as well as the corresponding HMAC implementation
 as defined in FIPS PUB 198a

 Copyright Brian Turek 2008-2015
 Distributed under the BSD License
 See http://caligatio.github.com/jsSHA/ for more information

 Several functions taken from Paul Johnston
*/
'use strict';(function(T){function y(c,a,d){var b=0,f=[],k=0,g,e,n,h,m,u,r,p=!1,q=!1,t=[],v=[],x,w=!1;d=d||{};g=d.encoding||"UTF8";x=d.numRounds||1;n=J(a,g);if(x!==parseInt(x,10)||1>x)throw Error("numRounds must a integer >= 1");if("SHA-1"===c)m=512,u=K,r=U,h=160;else if(u=function(a,d){return L(a,d,c)},r=function(a,d,b,f){var k,e;if("SHA-224"===c||"SHA-256"===c)k=(d+65>>>9<<4)+15,e=16;else if("SHA-384"===c||"SHA-512"===c)k=(d+129>>>10<<5)+31,e=32;else throw Error("Unexpected error in SHA-2 implementation");
for(;a.length<=k;)a.push(0);a[d>>>5]|=128<<24-d%32;a[k]=d+b;b=a.length;for(d=0;d<b;d+=e)f=L(a.slice(d,d+e),f,c);if("SHA-224"===c)a=[f[0],f[1],f[2],f[3],f[4],f[5],f[6]];else if("SHA-256"===c)a=f;else if("SHA-384"===c)a=[f[0].a,f[0].b,f[1].a,f[1].b,f[2].a,f[2].b,f[3].a,f[3].b,f[4].a,f[4].b,f[5].a,f[5].b];else if("SHA-512"===c)a=[f[0].a,f[0].b,f[1].a,f[1].b,f[2].a,f[2].b,f[3].a,f[3].b,f[4].a,f[4].b,f[5].a,f[5].b,f[6].a,f[6].b,f[7].a,f[7].b];else throw Error("Unexpected error in SHA-2 implementation");
return a},"SHA-224"===c)m=512,h=224;else if("SHA-256"===c)m=512,h=256;else if("SHA-384"===c)m=1024,h=384;else if("SHA-512"===c)m=1024,h=512;else throw Error("Chosen SHA variant is not supported");e=z(c);this.setHMACKey=function(a,d,f){var k;if(!0===q)throw Error("HMAC key already set");if(!0===p)throw Error("Cannot set HMAC key after finalizing hash");if(!0===w)throw Error("Cannot set HMAC key after calling update");g=(f||{}).encoding||"UTF8";d=J(d,g)(a);a=d.binLen;d=d.value;k=m>>>3;f=k/4-1;if(k<
a/8){for(d=r(d,a,0,z(c));d.length<=f;)d.push(0);d[f]&=4294967040}else if(k>a/8){for(;d.length<=f;)d.push(0);d[f]&=4294967040}for(a=0;a<=f;a+=1)t[a]=d[a]^909522486,v[a]=d[a]^1549556828;e=u(t,e);b=m;q=!0};this.update=function(a){var c,d,g,h=0,p=m>>>5;c=n(a,f,k);a=c.binLen;d=c.value;c=a>>>5;for(g=0;g<c;g+=p)h+m<=a&&(e=u(d.slice(g,g+p),e),h+=m);b+=h;f=d.slice(h>>>5);k=a%m;w=!0};this.getHash=function(a,d){var g,m,n;if(!0===q)throw Error("Cannot call getHash after setting HMAC key");n=M(d);switch(a){case "HEX":g=
function(a){return N(a,n)};break;case "B64":g=function(a){return O(a,n)};break;case "BYTES":g=P;break;default:throw Error("format must be HEX, B64, or BYTES");}if(!1===p)for(e=r(f,k,b,e),m=1;m<x;m+=1)e=r(e,h,0,z(c));p=!0;return g(e)};this.getHMAC=function(a,d){var g,n,t;if(!1===q)throw Error("Cannot call getHMAC without first setting HMAC key");t=M(d);switch(a){case "HEX":g=function(a){return N(a,t)};break;case "B64":g=function(a){return O(a,t)};break;case "BYTES":g=P;break;default:throw Error("outputFormat must be HEX, B64, or BYTES");
}!1===p&&(n=r(f,k,b,e),e=u(v,z(c)),e=r(n,h,m,e));p=!0;return g(e)}}function b(c,a){this.a=c;this.b=a}function V(c,a,d){var b=c.length,f,k,e,l,n;a=a||[0];d=d||0;n=d>>>3;if(0!==b%2)throw Error("String of HEX type must be in byte increments");for(f=0;f<b;f+=2){k=parseInt(c.substr(f,2),16);if(isNaN(k))throw Error("String of HEX type contains invalid characters");l=(f>>>1)+n;for(e=l>>>2;a.length<=e;)a.push(0);a[e]|=k<<8*(3-l%4)}return{value:a,binLen:4*b+d}}function W(c,a,d){var b=[],f,k,e,l,b=a||[0];d=
d||0;k=d>>>3;for(f=0;f<c.length;f+=1)a=c.charCodeAt(f),l=f+k,e=l>>>2,b.length<=e&&b.push(0),b[e]|=a<<8*(3-l%4);return{value:b,binLen:8*c.length+d}}function X(c,a,d){var b=[],f=0,e,g,l,n,h,m,b=a||[0];d=d||0;a=d>>>3;if(-1===c.search(/^[a-zA-Z0-9=+\/]+$/))throw Error("Invalid character in base-64 string");g=c.indexOf("=");c=c.replace(/\=/g,"");if(-1!==g&&g<c.length)throw Error("Invalid '=' found in base-64 string");for(g=0;g<c.length;g+=4){h=c.substr(g,4);for(l=n=0;l<h.length;l+=1)e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(h[l]),
n|=e<<18-6*l;for(l=0;l<h.length-1;l+=1){m=f+a;for(e=m>>>2;b.length<=e;)b.push(0);b[e]|=(n>>>16-8*l&255)<<8*(3-m%4);f+=1}}return{value:b,binLen:8*f+d}}function N(c,a){var d="",b=4*c.length,f,e;for(f=0;f<b;f+=1)e=c[f>>>2]>>>8*(3-f%4),d+="0123456789abcdef".charAt(e>>>4&15)+"0123456789abcdef".charAt(e&15);return a.outputUpper?d.toUpperCase():d}function O(c,a){var d="",b=4*c.length,f,e,g;for(f=0;f<b;f+=3)for(g=f+1>>>2,e=c.length<=g?0:c[g],g=f+2>>>2,g=c.length<=g?0:c[g],g=(c[f>>>2]>>>8*(3-f%4)&255)<<16|
(e>>>8*(3-(f+1)%4)&255)<<8|g>>>8*(3-(f+2)%4)&255,e=0;4>e;e+=1)8*f+6*e<=32*c.length?d+="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".charAt(g>>>6*(3-e)&63):d+=a.b64Pad;return d}function P(c){var a="",d=4*c.length,b,f;for(b=0;b<d;b+=1)f=c[b>>>2]>>>8*(3-b%4)&255,a+=String.fromCharCode(f);return a}function M(c){var a={outputUpper:!1,b64Pad:"="};c=c||{};a.outputUpper=c.outputUpper||!1;a.b64Pad=c.b64Pad||"=";if("boolean"!==typeof a.outputUpper)throw Error("Invalid outputUpper formatting option");
if("string"!==typeof a.b64Pad)throw Error("Invalid b64Pad formatting option");return a}function J(c,a){var d;switch(a){case "UTF8":case "UTF16BE":case "UTF16LE":break;default:throw Error("encoding must be UTF8, UTF16BE, or UTF16LE");}switch(c){case "HEX":d=V;break;case "TEXT":d=function(c,d,b){var e=[],l=[],n=0,h,m,u,r,p,e=d||[0];d=b||0;u=d>>>3;if("UTF8"===a)for(h=0;h<c.length;h+=1)for(b=c.charCodeAt(h),l=[],128>b?l.push(b):2048>b?(l.push(192|b>>>6),l.push(128|b&63)):55296>b||57344<=b?l.push(224|
b>>>12,128|b>>>6&63,128|b&63):(h+=1,b=65536+((b&1023)<<10|c.charCodeAt(h)&1023),l.push(240|b>>>18,128|b>>>12&63,128|b>>>6&63,128|b&63)),m=0;m<l.length;m+=1){p=n+u;for(r=p>>>2;e.length<=r;)e.push(0);e[r]|=l[m]<<8*(3-p%4);n+=1}else if("UTF16BE"===a||"UTF16LE"===a)for(h=0;h<c.length;h+=1){b=c.charCodeAt(h);"UTF16LE"===a&&(m=b&255,b=m<<8|b>>>8);p=n+u;for(r=p>>>2;e.length<=r;)e.push(0);e[r]|=b<<8*(2-p%4);n+=2}return{value:e,binLen:8*n+d}};break;case "B64":d=X;break;case "BYTES":d=W;break;default:throw Error("format must be HEX, TEXT, B64, or BYTES");
}return d}function w(c,a){return c<<a|c>>>32-a}function q(c,a){return c>>>a|c<<32-a}function v(c,a){var d=null,d=new b(c.a,c.b);return d=32>=a?new b(d.a>>>a|d.b<<32-a&4294967295,d.b>>>a|d.a<<32-a&4294967295):new b(d.b>>>a-32|d.a<<64-a&4294967295,d.a>>>a-32|d.b<<64-a&4294967295)}function Q(c,a){var d=null;return d=32>=a?new b(c.a>>>a,c.b>>>a|c.a<<32-a&4294967295):new b(0,c.a>>>a-32)}function Y(c,a,d){return c&a^~c&d}function Z(c,a,d){return new b(c.a&a.a^~c.a&d.a,c.b&a.b^~c.b&d.b)}function R(c,a,d){return c&
a^c&d^a&d}function aa(c,a,d){return new b(c.a&a.a^c.a&d.a^a.a&d.a,c.b&a.b^c.b&d.b^a.b&d.b)}function ba(c){return q(c,2)^q(c,13)^q(c,22)}function ca(c){var a=v(c,28),d=v(c,34);c=v(c,39);return new b(a.a^d.a^c.a,a.b^d.b^c.b)}function da(c){return q(c,6)^q(c,11)^q(c,25)}function ea(c){var a=v(c,14),d=v(c,18);c=v(c,41);return new b(a.a^d.a^c.a,a.b^d.b^c.b)}function fa(c){return q(c,7)^q(c,18)^c>>>3}function ga(c){var a=v(c,1),d=v(c,8);c=Q(c,7);return new b(a.a^d.a^c.a,a.b^d.b^c.b)}function ha(c){return q(c,
17)^q(c,19)^c>>>10}function ia(c){var a=v(c,19),d=v(c,61);c=Q(c,6);return new b(a.a^d.a^c.a,a.b^d.b^c.b)}function B(c,a){var d=(c&65535)+(a&65535);return((c>>>16)+(a>>>16)+(d>>>16)&65535)<<16|d&65535}function ja(c,a,d,b){var f=(c&65535)+(a&65535)+(d&65535)+(b&65535);return((c>>>16)+(a>>>16)+(d>>>16)+(b>>>16)+(f>>>16)&65535)<<16|f&65535}function C(c,a,d,b,f){var e=(c&65535)+(a&65535)+(d&65535)+(b&65535)+(f&65535);return((c>>>16)+(a>>>16)+(d>>>16)+(b>>>16)+(f>>>16)+(e>>>16)&65535)<<16|e&65535}function ka(c,
a){var d,e,f;d=(c.b&65535)+(a.b&65535);e=(c.b>>>16)+(a.b>>>16)+(d>>>16);f=(e&65535)<<16|d&65535;d=(c.a&65535)+(a.a&65535)+(e>>>16);e=(c.a>>>16)+(a.a>>>16)+(d>>>16);return new b((e&65535)<<16|d&65535,f)}function la(c,a,d,e){var f,k,g;f=(c.b&65535)+(a.b&65535)+(d.b&65535)+(e.b&65535);k=(c.b>>>16)+(a.b>>>16)+(d.b>>>16)+(e.b>>>16)+(f>>>16);g=(k&65535)<<16|f&65535;f=(c.a&65535)+(a.a&65535)+(d.a&65535)+(e.a&65535)+(k>>>16);k=(c.a>>>16)+(a.a>>>16)+(d.a>>>16)+(e.a>>>16)+(f>>>16);return new b((k&65535)<<16|
f&65535,g)}function ma(c,a,d,e,f){var k,g,l;k=(c.b&65535)+(a.b&65535)+(d.b&65535)+(e.b&65535)+(f.b&65535);g=(c.b>>>16)+(a.b>>>16)+(d.b>>>16)+(e.b>>>16)+(f.b>>>16)+(k>>>16);l=(g&65535)<<16|k&65535;k=(c.a&65535)+(a.a&65535)+(d.a&65535)+(e.a&65535)+(f.a&65535)+(g>>>16);g=(c.a>>>16)+(a.a>>>16)+(d.a>>>16)+(e.a>>>16)+(f.a>>>16)+(k>>>16);return new b((g&65535)<<16|k&65535,l)}function z(c){var a,d;if("SHA-1"===c)c=[1732584193,4023233417,2562383102,271733878,3285377520];else switch(a=[3238371032,914150663,
812702999,4144912697,4290775857,1750603025,1694076839,3204075428],d=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225],c){case "SHA-224":c=a;break;case "SHA-256":c=d;break;case "SHA-384":c=[new b(3418070365,a[0]),new b(1654270250,a[1]),new b(2438529370,a[2]),new b(355462360,a[3]),new b(1731405415,a[4]),new b(41048885895,a[5]),new b(3675008525,a[6]),new b(1203062813,a[7])];break;case "SHA-512":c=[new b(d[0],4089235720),new b(d[1],2227873595),new b(d[2],4271175723),
new b(d[3],1595750129),new b(d[4],2917565137),new b(d[5],725511199),new b(d[6],4215389547),new b(d[7],327033209)];break;default:throw Error("Unknown SHA variant");}return c}function K(c,a){var d=[],b,e,k,g,l,n,h;b=a[0];e=a[1];k=a[2];g=a[3];l=a[4];for(h=0;80>h;h+=1)d[h]=16>h?c[h]:w(d[h-3]^d[h-8]^d[h-14]^d[h-16],1),n=20>h?C(w(b,5),e&k^~e&g,l,1518500249,d[h]):40>h?C(w(b,5),e^k^g,l,1859775393,d[h]):60>h?C(w(b,5),R(e,k,g),l,2400959708,d[h]):C(w(b,5),e^k^g,l,3395469782,d[h]),l=g,g=k,k=w(e,30),e=b,b=n;a[0]=
B(b,a[0]);a[1]=B(e,a[1]);a[2]=B(k,a[2]);a[3]=B(g,a[3]);a[4]=B(l,a[4]);return a}function U(c,a,b,e){var f;for(f=(a+65>>>9<<4)+15;c.length<=f;)c.push(0);c[a>>>5]|=128<<24-a%32;c[f]=a+b;b=c.length;for(a=0;a<b;a+=16)e=K(c.slice(a,a+16),e);return e}function L(c,a,d){var q,f,k,g,l,n,h,m,u,r,p,v,t,w,x,y,z,D,E,F,G,H,A=[],I;if("SHA-224"===d||"SHA-256"===d)r=64,v=1,H=Number,t=B,w=ja,x=C,y=fa,z=ha,D=ba,E=da,G=R,F=Y,I=e;else if("SHA-384"===d||"SHA-512"===d)r=80,v=2,H=b,t=ka,w=la,x=ma,y=ga,z=ia,D=ca,E=ea,G=aa,
F=Z,I=S;else throw Error("Unexpected error in SHA-2 implementation");d=a[0];q=a[1];f=a[2];k=a[3];g=a[4];l=a[5];n=a[6];h=a[7];for(p=0;p<r;p+=1)16>p?(u=p*v,m=c.length<=u?0:c[u],u=c.length<=u+1?0:c[u+1],A[p]=new H(m,u)):A[p]=w(z(A[p-2]),A[p-7],y(A[p-15]),A[p-16]),m=x(h,E(g),F(g,l,n),I[p],A[p]),u=t(D(d),G(d,q,f)),h=n,n=l,l=g,g=t(k,m),k=f,f=q,q=d,d=t(m,u);a[0]=t(d,a[0]);a[1]=t(q,a[1]);a[2]=t(f,a[2]);a[3]=t(k,a[3]);a[4]=t(g,a[4]);a[5]=t(l,a[5]);a[6]=t(n,a[6]);a[7]=t(h,a[7]);return a}var e,S;e=[1116352408,
1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,
430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];S=[new b(e[0],3609767458),new b(e[1],602891725),new b(e[2],3964484399),new b(e[3],2173295548),new b(e[4],4081628472),new b(e[5],3053834265),new b(e[6],2937671579),new b(e[7],3664609560),new b(e[8],2734883394),new b(e[9],1164996542),new b(e[10],1323610764),new b(e[11],3590304994),new b(e[12],4068182383),new b(e[13],991336113),new b(e[14],
633803317),new b(e[15],3479774868),new b(e[16],2666613458),new b(e[17],944711139),new b(e[18],2341262773),new b(e[19],2007800933),new b(e[20],1495990901),new b(e[21],1856431235),new b(e[22],3175218132),new b(e[23],2198950837),new b(e[24],3999719339),new b(e[25],766784016),new b(e[26],2566594879),new b(e[27],3203337956),new b(e[28],1034457026),new b(e[29],2466948901),new b(e[30],3758326383),new b(e[31],168717936),new b(e[32],1188179964),new b(e[33],1546045734),new b(e[34],1522805485),new b(e[35],2643833823),
new b(e[36],2343527390),new b(e[37],1014477480),new b(e[38],1206759142),new b(e[39],344077627),new b(e[40],1290863460),new b(e[41],3158454273),new b(e[42],3505952657),new b(e[43],106217008),new b(e[44],3606008344),new b(e[45],1432725776),new b(e[46],1467031594),new b(e[47],851169720),new b(e[48],3100823752),new b(e[49],1363258195),new b(e[50],3750685593),new b(e[51],3785050280),new b(e[52],3318307427),new b(e[53],3812723403),new b(e[54],2003034995),new b(e[55],3602036899),new b(e[56],1575990012),
new b(e[57],1125592928),new b(e[58],2716904306),new b(e[59],442776044),new b(e[60],593698344),new b(e[61],3733110249),new b(e[62],2999351573),new b(e[63],3815920427),new b(3391569614,3928383900),new b(3515267271,566280711),new b(3940187606,3454069534),new b(4118630271,4000239992),new b(116418474,1914138554),new b(174292421,2731055270),new b(289380356,3203993006),new b(460393269,320620315),new b(685471733,587496836),new b(852142971,1086792851),new b(1017036298,365543100),new b(1126000580,2618297676),
new b(1288033470,3409855158),new b(1501505948,4234509866),new b(1607167915,987167468),new b(1816402316,1246189591)];"function"===typeof define&&define.amd?define(function(){return y}):"undefined"!==typeof exports?"undefined"!==typeof module&&module.exports?module.exports=exports=y:exports=y:T.jsSHA=y})(this);

return exports;
})(),(function(){
var exports={};
/*!
 * EventEmitter2
 * https://github.com/hij1nx/EventEmitter2
 *
 * Copyright (c) 2013 hij1nx
 * Licensed under the MIT license.
 */
!function(e){function t(){this._events={},this._conf&&s.call(this,this._conf)}function s(e){e&&(this._conf=e,e.delimiter&&(this.delimiter=e.delimiter),e.maxListeners&&(this._events.maxListeners=e.maxListeners),e.wildcard&&(this.wildcard=e.wildcard),e.newListener&&(this.newListener=e.newListener),this.wildcard&&(this.listenerTree={}))}function i(e){this._events={},this.newListener=!1,s.call(this,e)}function n(e,t,s,i){if(!s)return[];var r,l,o,h,a,f,c,u=[],_=t.length,p=t[i],v=t[i+1];if(i===_&&s._listeners){if("function"==typeof s._listeners)return e&&e.push(s._listeners),[s];for(r=0,l=s._listeners.length;l>r;r++)e&&e.push(s._listeners[r]);return[s]}if("*"===p||"**"===p||s[p]){if("*"===p){for(o in s)"_listeners"!==o&&s.hasOwnProperty(o)&&(u=u.concat(n(e,t,s[o],i+1)));return u}if("**"===p){c=i+1===_||i+2===_&&"*"===v,c&&s._listeners&&(u=u.concat(n(e,t,s,_)));for(o in s)"_listeners"!==o&&s.hasOwnProperty(o)&&("*"===o||"**"===o?(s[o]._listeners&&!c&&(u=u.concat(n(e,t,s[o],_))),u=u.concat(n(e,t,s[o],i))):u=u.concat(o===v?n(e,t,s[o],i+2):n(e,t,s[o],i)));return u}u=u.concat(n(e,t,s[p],i+1))}if(h=s["*"],h&&n(e,t,h,i+1),a=s["**"])if(_>i){a._listeners&&n(e,t,a,_);for(o in a)"_listeners"!==o&&a.hasOwnProperty(o)&&(o===v?n(e,t,a[o],i+2):o===p?n(e,t,a[o],i+1):(f={},f[o]=a[o],n(e,t,{"**":f},i+1)))}else a._listeners?n(e,t,a,_):a["*"]&&a["*"]._listeners&&n(e,t,a["*"],_);return u}function r(e,t){e="string"==typeof e?e.split(this.delimiter):e.slice();for(var s=0,i=e.length;i>s+1;s++)if("**"===e[s]&&"**"===e[s+1])return;for(var n=this.listenerTree,r=e.shift();r;){if(n[r]||(n[r]={}),n=n[r],0===e.length){if(n._listeners){if("function"==typeof n._listeners)n._listeners=[n._listeners,t];else if(l(n._listeners)&&(n._listeners.push(t),!n._listeners.warned)){var h=o;"undefined"!=typeof this._events.maxListeners&&(h=this._events.maxListeners),h>0&&n._listeners.length>h&&(n._listeners.warned=!0,console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",n._listeners.length),console.trace())}}else n._listeners=t;return!0}r=e.shift()}return!0}var l=Array.isArray?Array.isArray:function(e){return"[object Array]"===Object.prototype.toString.call(e)},o=10;i.prototype.delimiter=".",i.prototype.setMaxListeners=function(e){this._events||t.call(this),this._events.maxListeners=e,this._conf||(this._conf={}),this._conf.maxListeners=e},i.prototype.event="",i.prototype.once=function(e,t){return this.many(e,1,t),this},i.prototype.many=function(e,t,s){function i(){0===--t&&n.off(e,i),s.apply(this,arguments)}var n=this;if("function"!=typeof s)throw new Error("many only accepts instances of Function");return i._origin=s,this.on(e,i),n},i.prototype.emit=function(){this._events||t.call(this);var e=arguments[0];if("newListener"===e&&!this.newListener&&!this._events.newListener)return!1;if(this._all){for(var s=arguments.length,i=new Array(s-1),r=1;s>r;r++)i[r-1]=arguments[r];for(r=0,s=this._all.length;s>r;r++)this.event=e,this._all[r].apply(this,i)}if("error"===e&&!(this._all||this._events.error||this.wildcard&&this.listenerTree.error))throw arguments[1]instanceof Error?arguments[1]:new Error("Uncaught, unspecified 'error' event.");var l;if(this.wildcard){l=[];var o="string"==typeof e?e.split(this.delimiter):e.slice();n.call(this,l,o,this.listenerTree,0)}else l=this._events[e];if("function"==typeof l){if(this.event=e,1===arguments.length)l.call(this);else if(arguments.length>1)switch(arguments.length){case 2:l.call(this,arguments[1]);break;case 3:l.call(this,arguments[1],arguments[2]);break;default:for(var s=arguments.length,i=new Array(s-1),r=1;s>r;r++)i[r-1]=arguments[r];l.apply(this,i)}return!0}if(l){for(var s=arguments.length,i=new Array(s-1),r=1;s>r;r++)i[r-1]=arguments[r];for(var h=l.slice(),r=0,s=h.length;s>r;r++)this.event=e,h[r].apply(this,i);return h.length>0||!!this._all}return!!this._all},i.prototype.on=function(e,s){if("function"==typeof e)return this.onAny(e),this;if("function"!=typeof s)throw new Error("on only accepts instances of Function");if(this._events||t.call(this),this.emit("newListener",e,s),this.wildcard)return r.call(this,e,s),this;if(this._events[e]){if("function"==typeof this._events[e])this._events[e]=[this._events[e],s];else if(l(this._events[e])&&(this._events[e].push(s),!this._events[e].warned)){var i=o;"undefined"!=typeof this._events.maxListeners&&(i=this._events.maxListeners),i>0&&this._events[e].length>i&&(this._events[e].warned=!0,console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.",this._events[e].length),console.trace())}}else this._events[e]=s;return this},i.prototype.onAny=function(e){if("function"!=typeof e)throw new Error("onAny only accepts instances of Function");return this._all||(this._all=[]),this._all.push(e),this},i.prototype.addListener=i.prototype.on,i.prototype.off=function(e,t){if("function"!=typeof t)throw new Error("removeListener only takes instances of Function");var s,i=[];if(this.wildcard){var r="string"==typeof e?e.split(this.delimiter):e.slice();i=n.call(this,null,r,this.listenerTree,0)}else{if(!this._events[e])return this;s=this._events[e],i.push({_listeners:s})}for(var o=0;o<i.length;o++){var h=i[o];if(s=h._listeners,l(s)){for(var a=-1,f=0,c=s.length;c>f;f++)if(s[f]===t||s[f].listener&&s[f].listener===t||s[f]._origin&&s[f]._origin===t){a=f;break}if(0>a)continue;return this.wildcard?h._listeners.splice(a,1):this._events[e].splice(a,1),0===s.length&&(this.wildcard?delete h._listeners:delete this._events[e]),this}(s===t||s.listener&&s.listener===t||s._origin&&s._origin===t)&&(this.wildcard?delete h._listeners:delete this._events[e])}return this},i.prototype.offAny=function(e){var t,s=0,i=0;if(e&&this._all&&this._all.length>0){for(t=this._all,s=0,i=t.length;i>s;s++)if(e===t[s])return t.splice(s,1),this}else this._all=[];return this},i.prototype.removeListener=i.prototype.off,i.prototype.removeAllListeners=function(e){if(0===arguments.length)return!this._events||t.call(this),this;if(this.wildcard)for(var s="string"==typeof e?e.split(this.delimiter):e.slice(),i=n.call(this,null,s,this.listenerTree,0),r=0;r<i.length;r++){var l=i[r];l._listeners=null}else{if(!this._events[e])return this;this._events[e]=null}return this},i.prototype.listeners=function(e){if(this.wildcard){var s=[],i="string"==typeof e?e.split(this.delimiter):e.slice();return n.call(this,s,i,this.listenerTree,0),s}return this._events||t.call(this),this._events[e]||(this._events[e]=[]),l(this._events[e])||(this._events[e]=[this._events[e]]),this._events[e]},i.prototype.listenersAny=function(){return this._all?this._all:[]},"function"==typeof define&&define.amd?define(function(){return i}):"object"==typeof exports?exports.EventEmitter2=i:window.EventEmitter2=i}();
return exports.EventEmitter2;
})());
//exports = SkyWay.MultiParty; 
