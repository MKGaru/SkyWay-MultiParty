// for Peer File
interface PeerFileReceive{
	on:(event:string,callback:Function)=>PeerFileReceive;
	accept:(file:File)=>PeerFileReceive;
	reject:(file:File)=>PeerFileReceive;
	pause:(file:File)=>PeerFileReceive;
	resume:(file:File)=>PeerFileReceive;
	cancel:(file:File)=>PeerFileReceive;
}
interface PeerFileSend{
	on:(event:string,callback:Function)=>PeerFileSend;
	pause:(file:File)=>PeerFileSend;
	resume:(file:File)=>PeerFileSend;
	cancel:(file:File)=>PeerFileSend;
}
interface PeerFile{
	send:(connection:DataConnection,file:File)=>PeerFileSend;
	receive:(connection:DataConnection)=>PeerFileReceive;
}
declare var peerfile:PeerFile;
// end

interface PeerOptions{
	/** クラウド上のPeerServerを利用するためのAPIキーです。 */
	key?:string;
	/** サーバのホスト名です。デフォルトは、skyway.ioです。相対ホスト名として、'/' も許容します。 */
	host?:string;
	/** サーバのポート番号です。デフォルトはホストがskyway.ioの場合は443番で、その他の場合は80番です。 */
	port?:number;
	/** 自身のPeerServerが動作している場所のpathです。デフォルトは、'/'です。 */
	path?:string;
	/** SSLを利用する場合は、trueにします。skyway.ioはSSLを利用するため、デフォルトは、trueです。 */
	secure?:boolean;
	/** SkyWayが提供するTURNサーバを利用する場合は、trueにします。デフォルトは、trueです。利用には別途申請が必要です。 */
	turn?:boolean;
	/** RTCPeerConnectionへ渡される設定項目のハッシュです。
	 * このハッシュは、カスタマイズされたICE/TURNサーバを含みます。
	 * デフォルト値は、{ 'iceServers': [{ 'url': 'stun:stun.skyway.io:3478' }] }です。
	 * 尚、SkyWayが提供するTURNサーバを利用する場合は、iceServersの指定は不要です。 */
	config?:any;
	/** debugレベルにしたがってログを出力します。デフォルト値は0です。 */
	debug?:number;
}

declare class Peer{
	constructor(id:string,options:PeerOptions);
	constructor(options:PeerOptions);

	/**
	 * idで指定されたリモートのPeerへ接続し、data connectionを返します。
	 * コネクションに失敗した場合に備え、errorイベントを設定してください。
	 * @param id リモートpeerのブローカーIDです(リモートpeerのpeer.idです)。
	 * @param options
	 */
	connect(id:string,options:{
		/** data connectionを識別するためのユニークなラベルです。
		 * もし特定されていない場合は、ランダムに生成されます。dataConnection.labelを通じてアクセスできます。 */
		label?:string;
		/** コネクションに関連付けされるメタデータで、コネクションを開始したpeerに渡されます。
		 * dataConnection.metadataを通じてアクセスできます。serialize可能です。 */
		metadata?:any;
		/** binary (default), binary-utf8, json, or none を指定可能です。dataConnection.serializationを通じてアクセスできます。 */
		serialization?:string;
		/** data channelに信頼性をもたせるか(例えば、大きなファイルの転送）、
		 * もたせないか（例えば、ゲームやストリーミング）を指定可能です。デフォルトはfalseです。true設定は互換性のないブラウザ（Chrome 30とそれ以下)のために、shimを使います。
		 * そのため、完全なパフォーマンスを提供できないことがあります。 */
		reliable?:boolean;
	});

	/**
	 * idで指定されたリモートのpeerへ発信し、media connectionを返します。
	 * コネクションに失敗した場合に備え、errorイベントを設定してください。
	 * @param id リモートpeerのブローカーID(リモートpeerのpeer.id)です。
	 * @param stream 何らかのストリームです。
	 * @param options
	 */
	call(id:string,stream,options?);

	/**
	 * peerイベントのリスナを設定します。
	 * @param event
	 * @param callback
	 */
	on(event:string,callback:Function);

	/** サーバとの接続をクローズします。既存のデータおよびメディア接続はそのままです。peer.destroyedにtrueが設定されます。 */
	disconnect();

	/** サーバへの接続をクローズし、すべての既存のコネクションを終了します。peer.destroyedはtrueに設定されます。 */
	destroy();

	/** SkyWayが提供するRestAPIにアクセスし、APIキー毎のアクティブなPeerIDを取得します。listはArray形式で得られます。 */
	listAllPeers(Function);

	/** peerのブローカーIDです。もしIDがconstructorで指定されない場合、openが発生するまで、undefinedのままです。 */
	id:string;

	/** リモートpeerのIDがkeyとして、peerと関連付けされるコネクションを持つハッシュです。 */
	connections:any;

	/** PeerServerとのアクティブなコネクションがある場合は、false です。 */
	disconnected:boolean;

	/** このpeerにおける、全接続が利用されていない場合はtrueです。 */
	destroyed:boolean;

	_events:any;
}

interface DataConnection{
	send(data);
	close();
	on(event:string,callback:Function);

	/**  ブラウザのバッファが一杯になった場合に、キューされるメッセージのサイズです。*/
	bufferSize:number;
	/** コネクションに関連付けされたRTCDataChannelオブジェクトへの参照です。 */
	dataChannel:any;
	/** コネクションが開始されたときにPeerJSからアサインされる、または指定されるオプションのラベルです。 */
	label:string;
	/** コネクションが開始されたときに、コネクションと関連付けされるメタデータです。 */
	metadata:any;
	/** コネクションがopenであり、読み込み/書き込みの準備ができている場合にtrueになります。 */
	open:boolean;
	/** コネクションに関連付けされる、RTCPeerConnectionへの参照です。 */
	peerConnection:any;
	/** コネクションの相手側のpeer IDです。 */
	peer:string;
	/** 信頼性のあるdata channelの場合にtrueです。コネクションの開始時に定義されます。 */
	reliable:boolean;
	/** コネクションを通じて送信されるデータのserializeフォーマットです。 */
	serialization:string;
}

interface MediaConnection{
	/** callイベントを受信した場合に、応答するためにコールバックにて与えられるmedia connectionにて.answerを呼び出せます。
	 * また、オプションで自身のmedia streamを設定できます。 */
	answer(any?);
	/** media connectionをクローズします。 */
	close();
	/** media connectionイベントのリスナを設定します。 */
	on(event:string,callback:Function);

	/** media connectionがアクティブなとき（例えば、呼び出しにたいして、応答があった後）に、trueとなります。
	 * もし片方向通話のために、最大待ち時間を設定したい場合に、これをチェックできます。 */
	open:boolean;
	/** コネクションが開始されたときに、コネクションと関連付けされるメタデータです。 */
	metadata:any;
	/** コネクションの相手側のpeer IDです。 */
	peer:string;
}