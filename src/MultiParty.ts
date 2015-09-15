/// <reference path='SkyWay.d.ts' />

// 他、以下のものもreference (これらはtsd　や　dtsm を用いて解決するべきでしょう)
// https://github.com/borisyankov/DefinitelyTyped/tree/master/eventemitter2
// https://github.com/borisyankov/DefinitelyTyped/tree/master/webrtc
// https://github.com/borisyankov/DefinitelyTyped/tree/master/webaudioapi

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

module SkyWay{
	var jsSHA = require("jssha");

	navigator.getUserMedia =
		navigator.getUserMedia
		|| navigator.webkitGetUserMedia
		|| navigator.mozGetUserMedia;
	var AudioContext = window['AudioContext'] || window['webkitAudioContext'];

	export declare var ScreenShare:any;

	interface MultiPartyOptions{
		/** API key(skywayから取得)。必須 */
		key?:string;
		/** ルーム名 */
		room?:string;
		/** ユーザID */
		id?:string;
		/** データチャンネルで信頼性のあるデータ転送を行う。デフォルト値はfalse */
		reliable?:boolean;
		/** データシリアライゼーションモードを( binary | binary-utf8 | json | none )のいずれかにセットする。デフォルト値はbinary */
		serialization?:string;
		/** ビデオストリーミングを許可する。デフォルト値はtrue */
		video?:boolean;
		/**  オーディオストリーミングを許可する。デフォルト値はtrue */
		audio?:boolean;
		/** Peerサーバに接続時に、各PeerとのMediaStreamを開始する。 デフォルト値はtrue */
		auto_call?:boolean;
		/** MdediaStreamの通信許諾ルーチン。デフォルト値は (peerId,cb)=>cb(true); */
		manual_answer?:Function;
		/** サーバポーリングによるユーザリストのチェックを許可する。デフォルト値はtrue */
		polling?:boolean;
		/** ポーリング間隔(msec)を設定する。デフォルト値は3000 */
		polling_interval?:number;
		/** コンソールに表示されるデバッグログレベルを設定する
		 * 0: ログを表示しない
		 * 1: エラーだけを表示
		 * 2: エラーと警告だけ表示
		 * 3: すべてのログを表示
		 * */
		debug?:any;
		/** peerサーバのホスト名 */
		host?:string;
		/** peerサーバのポート番号 */
		port?:number;
		/** peerサーバとの接続にTLSを使用する */
		secure?:boolean;
		/** RTCPeerConnectionに渡されるオプション。ICEサーバの設定を行うことができる。
		 * 初期値は {'iceServers': [{ 'url': 'stun:stun.skyway.io:3478' }] } */
		config?:any;

		room_name?:string;
		room_id?:string;
		video_stream?:any;
		audio_stream?:any;
		use_stream?:any;
		peerjs_opts?:PeerOptions;
	}

	module util{
		export function checkOpts(opts_:MultiPartyOptions){
			var opts:MultiPartyOptions = {};

			// key check (なかったら throw)
			if(!opts_.key || typeof(opts_.key) !== "string")
				throw "app key must be specified";

			// key check ( string patter がマッチしなかったら throw )
			if(!opts_.key.match(/^[0-9a-z]{8}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{4}\-[0-9a-z]{12}$/))
				throw "wrong string pattern of app key";

			// copy key
			opts.key = opts_.key;

			// todo : room prefix にdomainを意識したほげほげ
			// room check (なかったら "")
			if(!opts_.room || typeof(opts_.room) !== "string") {
				var seed = "";
			} else if(!opts_.room.match(/^[0-9a-zA-Z\-\_]{4,32}$/)){
				throw "room name should be digit|alphabet and length between 4 and 32";
			} else {
				var seed = <string>opts_.room
			}

			opts.room_name = seed;
			opts.room_id = util.makeRoomID(seed);

			// id check (なかったら生成）
			var hash_ = location.pathname + "_peer_id";
			if(!!sessionStorage[hash_]) {
				opts.id = opts.room_id  +sessionStorage[hash_];
			} else if(!opts_.id || typeof(opts_.id) !== "string") {
				opts.id = opts.room_id + util.makeID();
			} else {
				opts.id = opts.room_id + opts_.id;
			}
			sessionStorage[hash_] = opts.id.substring(opts.room_id.length);

			// reliable check (なかったら false)
			opts.reliable = !!opts_.reliable;

			// serialization check (未指定なら binary)
			if(!opts_.serialization) {
				opts.serialization = "binary";
			} else {
				// serializationのタイプをチェックする
				// binary, utf-8, json以外はエラー
				opts.serialization = opts_.serialization;
			}

			// stream check
			opts.video_stream = (opts_.video === undefined ? true : opts_.video);
			opts.audio_stream = (opts_.audio === undefined ? true : opts_.audio);
			opts.use_stream = opts.video_stream || opts.audio_stream;

			opts.auto_call = opts_.auto_call === undefined? true : opts_.auto_call;
			opts.manual_answer = opts_.manual_answer === undefined? (peerId,cb)=>cb(true):opts_.manual_answer;

			// polling disconnect/reconnect (must for FF)
			opts.polling = (opts_.polling === undefined ? true : opts_.polling);
			opts.polling_interval = (opts_.polling_interval === undefined ? 3000 : opts_.polling_interval);

			// peerjs options
			opts.peerjs_opts = {
				debug: opts_.debug || false,
				key: opts.key
			};
			if(opts_.host) opts.peerjs_opts.host = opts_.host;
			if(opts_.port) opts.peerjs_opts.port = opts_.port;
			if(opts_.secure) opts.peerjs_opts.secure = opts_.secure;
			if(opts_.config) opts.peerjs_opts.config = opts_.config;

			return opts;
		}

		export function makeToken(room_name:string,local:string,remote:string):string{
			var sha = new jsSHA('SHA-224','TEXT');
			var seed = local+'_'+room_name +'_'+ remote;
			sha.update(seed);
			return sha.getHash("HEX");
		}

		export function makeID(){
			var id = "";

			for (var i = 0; i < 32; i++) {
				// id += String.fromCharCode( (Math.random() * (125 - 33) + 33) | 0)
				id += String.fromCharCode( (Math.random() * (57 - 48) + 48) | 0)
			}
			return id;
		}

		export function makeRoomID(seed:string){
			var sha = new jsSHA('SHA-224','TEXT');
			seed = seed || "";
			//seed += location.host + location.pathname;
			//return CybozuLabs.MD5.calc(seed).substring(0,6) + "R_";
			sha.update(seed);
			var hash = sha.getHash("HEX");
			return hash.substring(0,8) + "R_";
		}

		export function createVideoNode(video:{src:string;id:string}){
			// 古いノードが会った場合は削除
			var prev_node = document.getElementById(video.id);
			if(prev_node) prev_node.parentNode.removeChild(prev_node);

			// 表示用のビデオノードを作る
			var v_ = document.createElement("video");
			v_.setAttribute("src", video.src);
			v_.setAttribute("id", video.id);

			var played = false;

			v_.addEventListener("loadedmetadata", function(ev) {
				if(!played) {
					played = true;
					this.play();
				}
			}, false);

			// since FF37 sometimes doesn't fire "loadedmetadata"
			// work around is after 500msec, calling play();
			setTimeout(function(ev){
				if(!played) {
					played = true;
					v_.play();
				}
			}, 500);

			return v_;
		}
	}
	export class MultiParty extends EventEmitter2{
		public static util = util;
		public room:string = null; //room name
		public id:string = null; // ID
		public key:string = null; //app key
		public peers:{[id:string]:any} = {}; // peer objects
		public stream:MediaStream = null; //my media stream
		private tracks_:{
			audio?:{
				enabled?:boolean;
				muted?:boolean
			};
			video?:{
				enabled?:boolean;
			}
		} = {};
		private audioContext_:AudioContext;
		public gainNode:GainNode;
		public scriptNode:ScriptProcessorNode;
		public analyzerNode:AnalyserNode;
		private outputNode_;
		private mediaStreamSorce_:MediaStreamAudioSourceNode;
		public pollInterval = null;

		public opened = false;
		public peer:Peer = null; //自分自身のpeerオブジェクト
		public screenStream = null; // SkyWayのScreenStream

		private log_(msg,level=3){
			if(level<=this.opts.debug)
				console.log(msg);
		}

		constructor(public opts:MultiPartyOptions){
			//__extends(MultiParty,new ee2.EventEmitter2())
			//MultiParty.prototype = new ee2.EventEmitter2();
			super();
			// option をチェック
			// room, myid, key プロパティを割り当てる
			this.opts = util.checkOpts(opts);

			var self = this;
			setTimeout(function(ev){
				self.conn2SkyWay_();
			}, 0);
		}

		/**
		 * SkyWayサーバーに繋ぐ
		 * @private
		 */
		private conn2SkyWay_(){
			var self = this;

			this.peer = new Peer(this.opts.id, this.opts.peerjs_opts);

			// SkyWayサーバーへの接続が完了したら、open イベントを起こす
			this.peer.on('open', function(id) {
				if(self.opened) {
					self.fire_("sw_err","Error : connection to SkyWay is already opened");
					throw "Error : connection to SkyWay is already opened";
				} else {
					self.opened = true;
				}

				// id check
				if(id !== this.opts.id) {
					throw "Error : SkyWay returns wrong peer id for myself";
				}

				// open イベントを発火する
				self.fire_('open', id);

				// Roomメンバーに接続
				self.connectPeers_();

				self.setupPeerHandler_();

				// 接続確認pollingを始める
				if(this.opts.polling) {
					self.startPollingConnections_();
				}
			}.bind(this));

			// SkyWayサーバーへの接続が失敗した場合のerror処理
			this.peer.on("error", function(err) {
				self.fire_("sw_err",err);
				//throw "Error : " + err;
			});
		}

		/**
		 * APIServerから取得した各Peerに接続を行う
		 * @private
		 */
		private connectPeers_(){
			var self = this;
			self.listAllPeers(function(peers){
				peers.forEach(function(peer_id){
					self.peers[peer_id] = {};
				});

				// MediaStream処理を開始する
				if(self.opts.use_stream) {
					self.startMediaStream_();
				}
				// DataChannel処理を開始する
				self.startDataChannel_();
			});
		}

		/**
		 * 接続中のIDとサーバのIDを比較して接続・再接続・切断する
		 * @private
		 */
		private startPollingConnections_(){
			var self = this;
			self.pollInterval = setInterval(function(){
				self.listAllPeers(function(newList){
					for(var peer_id in self.peers){
						var removeId = true;
						var addId = false;
						if(peer_id === undefined) {
							return;
						}
						$.each(newList, function(j, peerId){
							if(peer_id === peerId) {
								removeId = false;
							}
							if(self.peers[peerId] == void 0){
								addId = true;
							}
						});
						if(removeId) {
							self.removePeer(peer_id);
						} else if(addId){
							self.DCconnect_(peer_id);
						} else {
							var peer = self.peers[peer_id];
							var reconnect = {
								video: peer.call?!peer.call.open:false,
								screen: peer.screen_sender?!peer.screen_sender.open:false,
								data: peer.DCconn?!peer.DCconn.open:false
							};
							if(reconnect.video || reconnect.screen || reconnect.data) {
								if(!peer.reconnectIndex_){
									peer.reconnectIndex_ = 1;
								} else {
									peer.reconnectIndex_++;
								}
								// reconnect on powers of 2 minus (1, 2, 4, 8 ...)
								if((peer.reconnectIndex_ & (peer.reconnectIndex_-1)) == 0){
									self.reconnect(peer_id, reconnect);
								}
							} else {
								peer.reconnectIndex_ = 0;
							}
						}
					}
				})
			}, self.opts.polling_interval);
		}

		////////////////////////////////////
		// video 処理

		/**
		 * Media Stream 処理の開始
		 * @private
		 */
		private startMediaStream_(){
			this.startMyStream_();
		}

		/**
		 * video stream 取得開始
		 * @private
		 */
		private startMyStream_(){
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
			var scriptNode = audioContext.createScriptProcessor(0,1,1);
			self.scriptNode = scriptNode;

			scriptNode.onaudioprocess = ()=>{};

			self.gainNode.connect(outputNode);
			self.stream = outputNode.stream;
			analyser.connect(scriptNode);
			scriptNode.connect(outputNode);
			self.fire_('my_ms', {"src": URL.createObjectURL(self.stream), "id": self.opts.id});

			if(self.opts.auto_call){
				navigator.getUserMedia({"video": self.opts.video_stream, "audio": self.opts.audio_stream},(stream:MediaStream)=>{
					self.bindMediaStream(stream);
					self.listAllPeers(peers=>{
						self.startCall_(peers);
					})
				},(err)=>{throw err});
			}
		}
		public bindMediaStream(stream:MediaStream){
			var self = this;
			var mic = self.audioContext_.createMediaStreamSource(stream);
			if(self.mediaStreamSorce_) self.mediaStreamSorce_.disconnect();
			self.mediaStreamSorce_ = mic;

			mic.connect(self.analyzerNode);
			mic.connect(self.gainNode);
			if(self.outputNode_.stream.getVideoTracks()[0]){
				self.outputNode_.stream.removeTrack(
					self.outputNode_.stream.getVideoTracks()[0]
				);
			}
			if(stream.getVideoTracks()[0]){
				self.outputNode_.stream.addTrack(stream.getVideoTracks()[0]);
			}

			// 自己再生（確認）用のトラック
			if(stream.getVideoTracks()[0]){
				self.tracks_.video = self.stream.getVideoTracks()[0];
			}
			if(stream.getAudioTracks()[0]){
				self.tracks_.audio = self.stream.getAudioTracks()[0];
			}
		}

		/**
		 * MediaTrackをmuteする
		 * @param opts
		 */
		public mute(opts?:{audio?:boolean;video?:boolean}){
			if(opts === undefined) {
				this.tracks_.audio.enabled = false;
				this.tracks_.video.enabled = false;

				if(this.gainNode !== undefined) {
					this.gainNode.gain.value = 0;
				}
				return;
			}
			if(opts.audio !== undefined && opts.audio === true){
				this.tracks_.audio.enabled = false;
				this.tracks_.audio.muted = true;

				if(this.gainNode !== undefined) {
					this.gainNode.gain.value = 0;
				}
			}
			if(opts.video !== undefined && opts.video === true){
				this.tracks_.video.enabled = false;
			}
		}

		/**
		 * MediaTrackをunmuteする
		 * @param opts
		 */
		public unmute(opts?:{audio?:boolean;video?:boolean}){
			if(opts === undefined) {
				this.tracks_.audio.enabled = true;
				this.tracks_.video.enabled = true;

				if(this.gainNode !== undefined) {
					this.gainNode.gain.value = 3;
				}
				return;
			}
			if(opts.audio !== undefined && opts.audio === true){
				this.tracks_.audio.enabled = true;

				if(this.gainNode !== undefined) {
					this.gainNode.gain.value = 3;
				}
			}
			if(opts.video !== undefined && opts.video === true){
				this.tracks_.video.enabled = true;
			}
		}

		/**
		 * peersに対して、MediaStream callを開始する
		 * @param peers
		 * @param isScreen
		 * @private
		 */
		private startCall_(peers:string[]=[],isScreen=false){
			var self = this;

			peers.forEach(peer_id=>{
				if(isScreen === true) {
					if(!self.peers[peer_id].screen_sender || self.peers[peer_id].screen_sender.open) {
						var call = self.peer.call(
							peer_id,
							self.screenStream,
							{metadata:{type:'screen',token:self.makeToken_(peer_id)}}
						);
						self.log_("peer.call called from screenshare startCall_",3);
						self.peers[peer_id].screen_sender = call;
						self.setupStreamHandler_(call);
					}
				} else {
					var call = self.peer.call(
						peer_id,
						self.stream,
						{metadata:{token:self.makeToken_(peer_id)}}
					);
					self.log_("peer.call called from generic media exchange startCall_",3);
					self.peers[peer_id].call = call;
					self.setupStreamHandler_(call);
				}
			});
		}

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
		private makeToken_(remote:string){
			return util.makeToken(this.opts.room_name,remote,this.peer.id);
		}
		public makeToken(remote:string){
			return this.makeToken_(remote);
		}

		private authPeer_(conn:DataConnection|MediaConnection){
			if(!conn.metadata || !conn.metadata.token) return false;
			return conn.metadata.token == util.makeToken(this.opts.room_name,this.peer.id,conn.peer);
		}

		/**
		 * 新規に接続してきたpeerからのcallを受け付けるハンドラ
		 * @private
		 */
		private setupPeerHandler_(){
			var self = this;
			// 新規に接続してきたpeerからのcallを受け付けるハンドラ
			if(!this.peer._events.call || this.peer._events.call.length === 0) {
				this.peer.on('call', function(call:MediaConnection) {
					if(!self.authPeer_(call)){
						self.log_("Failed check server connection token.",1);
						call.close();
						return;
					}
					if(!self.peers[call.peer]) {
						self.peers[call.peer] = {};
					}
					if(call.metadata && call.metadata.type === 'screen') {
						self.peers[call.peer].screen_receiver = call;
						self.opts.manual_answer(call.peer,(shouldAnswer)=>{
							if(shouldAnswer){
								call.answer();
								self.setupStreamHandler_(call);
							}
						});

					} else {
						self.peers[call.peer].call = call;
						self.opts.manual_answer(call.peer,(shouldAnswer)=>{
							if(shouldAnswer){
								call.answer(self.stream);
								self.setupStreamHandler_(call);
								if(!!self.screenStream){
									self.peers[call.peer].screen_sender = self.peer.call(
										call.peer,
										self.screenStream,
										{metadata:{type:'screen',token:self.makeToken_(call.peer)}}
									);
								}
							}
						});
						/*
						call.answer(self.stream);
						self.setupStreamHandler_(call);
						if(!!self.screenStream){
							var call:MediaConnection = self.peer.call(
								call.peer,
								self.screenStream,
								{metadata:{type:'screen',token:self.makeToken_(call.peer)}}
							);
							self.peers[call.peer].screen_sender = call;
						}
						self.log_("peer.call called from call callback",3);
						*/
					}
				});
			}
		}

		/**
		 * peerからのvideo stream, closeに対し、ハンドラをセットする
		 * @param call
		 * @private
		 */
		private setupStreamHandler_(call:MediaConnection){
			var self = this;
			var isReconnect = !!(call.metadata && call.metadata.reconnect);

			call.on('stream', function(stream) {
				if(call.metadata && call.metadata.type === 'screen') {
					self.peers[this.peer].screen_receiver.stream = stream;
					self.setupPeerScreen_(this.peer, stream, isReconnect);
				} else {
					self.peers[this.peer].call.stream = stream;
					self.setupPeerVideo_(this.peer, stream, isReconnect);
				}

			}).on('close', function(){
				// handle peer close event
				// check skyway server to see this user is disconnected.


				var peer_id = this.peer;
				var metadata = this.metadata;
				self.listAllPeers(function(list){
					var isDisconnected = true;
					for(var index in list) {
						if(list[index] === peer_id) {
							isDisconnected = false;
							break;
						}
					}
					if(isDisconnected){
						if(metadata && metadata.type === 'screen') {
							self.fire_('ss_close', peer_id);
						} else {
							self.fire_('ms_close', peer_id);
						}
						// check if user has any other open connections
						if(self.peers[peer_id] &&
							(self.peers[peer_id].call === undefined || !self.peers[peer_id].call.open) &&
							(self.peers[peer_id].DCconn === undefined || !self.peers[peer_id].DCconn.open) &&
							(self.peers[peer_id].screen_sender === undefined || !self.peers[peer_id].screen_sender.open)) {
							self.removePeer(peer_id);
						}
					} else {
						// leave reconnecting up to startPollingConnections_
					}
				});
			});
		}

		/**
		 * peerのvideoのObjectURLを生成し、frontにpeer_msイベントを返す
		 * @param peer_id
		 * @param stream
		 * @param isReconnect
		 * @private
		 */
		private setupPeerVideo_(peer_id:string, stream:MediaStream, isReconnect:boolean){
			// prevent to call twice.
			// if(!!this.peers[peer_id].video) return;

			var url = window['URL'].createObjectURL(stream);

			// set isReconnect as boolean
			isReconnect = !!isReconnect;

			this.peers[peer_id].video = stream;
			this.fire_('peer_ms', {id: peer_id, src: url , video:stream, reconnect: isReconnect});
		}

		/**
		 * peerのvideo Nodeをセットアップする
		 *  loadedmetadataが完了したら、'peer_video'をfireする
		 * @param peer_id
		 * @param stream
		 * @param isReconnect
		 * @private
		 */
		private setupPeerScreen_(peer_id:string, stream:MediaStream, isReconnect:boolean){
			var self = this;
			if(!isReconnect){
				isReconnect = false;
			}

			self.peers[peer_id].screen_receiver.video = stream;
			self.fire_('peer_ss', {src: URL.createObjectURL(stream), id: peer_id, reconnect: isReconnect});
		}

		/**
		 * peerのdcとmcを全てクローズする
		 * @param peer_id
		 */
		public removePeer(peer_id:string){
			try{
				if(this.peers[peer_id] !== undefined) {
					var peer = this.peers[peer_id];
					if(peer.call) {
						peer.call.close();
					}
					if(peer.screen_sender) {
						peer.screen_sender.close();
					}
					if(peer.screen_receiver) {
						peer.screen_receiver.close();
					}
					if(peer.DCconn) {
						peer.DCconn.close();
					}
				}
			} finally {
				delete this.peers[peer_id];
			}
		}

		//////////////////////////////////
		// DataChannel 処理

		/**
		 * DataChannel 処理を開始する
		 * @private
		 */
		private startDataChannel_(){
			this.startDCconnection_();
		}

		/**
		 * DataChannelのコネクション処理を行う
		 * @private
		 */
		private startDCconnection_(){
			var self = this;

			// API経由で取得したIDには、自分からconnectする
			for ( var peer_id in this.peers ) {
				this.DCconnect_(peer_id);
			}

			//新規に接続してきたpeerからのconnection要求を受け付けるハンドラ
			this.peer.on('connection', function(conn:DataConnection) {
				if(!self.authPeer_(conn)){
					self.log_("Failed check server connection token.",1);
					conn.close();
					return;
				}
				if(!self.peers[conn.peer]) {
					self.peers[conn.peer] = {};
				}
				if(conn.metadata && conn.metadata.type){
					self.fire_('dc_custom',conn);
				}else{
					self.peers[conn.peer].DCconn = conn;

					self.setupDCHandler_(conn);
					self.fire_('dc_open', conn.peer);
				}
			});
		}

		/**
		 * DataChannelのコネクション処理を行う
		 * @param peer_id
		 * @constructor
		 * @private
		 */
		private DCconnect_(peer_id:string){
			var conn = this.peer.connect(peer_id, {"serialization": this.opts.serialization, "reliable": this.opts.reliable,metadata:{token:this.makeToken_(peer_id)}});
			this.peers[peer_id].DCconn = conn;

			conn.on('open', function() {
				this.setupDCHandler_(conn);
				this.fire_('dc_open', conn.peer);
			}.bind(this));
		}

		/**
		 *  DataChannelのイベントハンドラをセットする
		 * @param conn
		 * @private
		 */
		private setupDCHandler_(conn:DataConnection){
			var self = this;
			conn.on('data', function(data) {
				self.fire_('message', {"id": this.peer, "data": data});
			}).on('close', function() {
				// handle peer close event
				// check skyway server to see this user is disconnected.
				var peer_id = this.peer;
				var metadata = this.metadata;
				self.listAllPeers(function(list) {
					var isDisconnected = true;
					for (var index in list) {
						if (list[index] === peer_id) {
							isDisconnected = false;
							break;
						}
					}
					if(isDisconnected){
						self.fire_('dc_close', peer_id);
						// check if user has any other open connections
						if(self.peers[peer_id] &&
							(self.peers[peer_id].call === undefined || !self.peers[peer_id].call.open) &&
							(self.peers[peer_id].DCconn === undefined || !self.peers[peer_id].DCconn.open) &&
							(self.peers[peer_id].screen_sender === undefined || !self.peers[peer_id].screen_sender.open)) {
							self.removePeer(peer_id);
						}
					} else {
						// leave reconnecting up to startPollingConnections_
					}
				});
			});
		}

		/**
		 * DataChannelでつながっている、peerにメッセージを送信する
		 * @param data
		 * @private
		 */
		private send_(data){
			if(!this.peer) {
				return false;
			}

			if(data && typeof(data) === "string" && data.length === 0) {
				return false;
			}

			if(data && (typeof(data) === "string" || typeof(data) === "object")) {
				for(var peer_id in this.peers) if(this.peers[peer_id].DCconn) {
					this.peers[peer_id].DCconn.send(data);
				}
			}
		}

		/**
		 * イベントを発火する
		 * @param name
		 * @param obj
		 * @private
		 */
		private fire_(name:string,obj){
			this.emit(name, obj);
		}

		////////////////////////////////////
		// public method

		/**
		 *  DataChannelでつながっているpeerにメッセージを送信する
		 * @param data
		 */
		public send(data){
			if(this.peer) this.send_(data);
		}

		/**
		 * 切断する
		 */
		public close(){
			if(this.peer) this.peer.destroy();
			clearInterval(this.pollInterval);
		}

		/**
		 * Voice(またはVideo）通話を開始する
		 * @param peers
		 */
		public call(peers:string[]){
			this.startCall_(peers);
		}

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
		public startScreenShare(peers:string[],success:(stream:MediaStream)=>any, error:Function){
			if(!this.peer) return;
			var self = this;
			if(SkyWay && SkyWay.ScreenShare) {
				var sc = new SkyWay.ScreenShare();
				if(sc.isEnabledExtension()) {
					sc.startScreenShare({
						Width: screen.width,
						Height: screen.height,
						FrameRate: 5
					},function (stream){
						self.screenStream = stream;
						self.startCall_(peers,true);
						self.log_("MediaConnection created in OFFER",3);

						//callback use video
						success(stream);
					}, error);
				}
			}
		}

		/**
		 * 画面共有を停止する
		 */
		public stopScreenShare(){
			if(this.screenStream){
				this.screenStream.stop();
				for(var peer_id in this.peers){
					if(this.peers[peer_id].screen_sender) {
						this.peers[peer_id].screen_sender.close()
					}
					delete this.peers[peer_id].screen_sender;
				}
				this.screenStream = undefined;
			}
		}

		/**
		 * 同じRoomのpeer listを取得
		 * @param callback
		 */
		public listAllPeers(callback:(peers:string[])=>void){
			var self = this;
			this.peer.listAllPeers(
				function(peers){
					var roomPeers = [];
					peers.forEach(function(peer_id) {
						// peer_idが自分のidではなく、かつ、peer_idの接頭辞がroom_idの場合
						if(peer_id !== self.opts.id && peer_id.indexOf(self.opts.room_id) === 0) {
							roomPeers.push(peer_id);
						}
					});
					callback(roomPeers);
				}
			);
		}

		/**
		 * ユーザに再接続する
		 * @param peer_id
		 * @param connections
		 */
		public reconnect(peer_id:string, connections) {
			var self = this;
			var peer = self.peers[peer_id];
			if (!peer) return;
			if (connections === undefined) {
				connections = {
					video: true,
					screen: true,
					data: true
				}
			}
			if (connections.video) {
				if (peer.call && peer.call.close) {
					peer.call.close();
				}
				var call = self.peer.call(
					peer_id,
					self.stream,
					{metadata: {reconnect: true,token:self.makeToken_(peer_id)}}
				);

				console.log("peer.call called from reconnect method");
				peer.call = call;
				self.setupStreamHandler_(call);
			}
			if (connections.screen) {
				if (self.screenStream) {
					if (peer.screen_sender && peer.screen_sender.close) {
						peer.screen_sender.close();
					}
					var call = self.peer.call(
						peer_id,
						self.screenStream,
						{metadata: {reconnect: true, type: 'screen',token:self.makeToken_(peer_id)}}
					);
					console.log("peer.call called from reconnect method in screenshare");
					peer.screen_sender = call;
				}
			}
			if (connections.data) {
				if (peer.DCconn && peer.DCconn.close) {
					peer.DCconn.close();
				}
				var conn = this.peer.connect(peer_id,
					{
						"serialization": this.opts.serialization,
						"reliable": this.opts.reliable,
						"metadata": {reconnect: true,token:self.makeToken_(peer_id)}
					}
				).on('open', function () {
					peer.DCconn = conn;
					self.setupDCHandler_(conn);
				});
			}
		}
	}
}

//exports = SkyWay.MultiParty;