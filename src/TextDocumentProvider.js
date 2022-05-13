"use strict";

var vscode = require("vscode");
const sshClient = require("sftp-promises");

var CTagSSHVF = /** @class */ (function ()
{
	class CTagSSHVF_t {
		constructor() {
			this.onDidChangeEmitter = new vscode.EventEmitter();
			this.onDidChange = this.onDidChangeEmitter.event;

			this.loadedFile = new Map();
		}

		async connectToSHH(config)
		{
			this.config = config;
			console.log(`SSH2 connecting to remote server ${this.config.username}@${this.config.host}:${this.config.port}...`);

			this.sftp = new sshClient();
			this.sftp.session(this.config)
				.then(ftpSession => {
					this.isConnected = true;
					this.session = ftpSession;
					console.log(`SSH2 connected to remote server ${this.config.username}@${this.config.host}:${this.config.port}`);
				}).catch(() => {
					console.error('SSH2 catch error');
				});
		}

		async preload_file(uri)
		{
			if (this.isConnected == false) {
				throw vscode.FileSystemError.Unavailable('Can not connect to remote host');
			}

			if (this.loadedFile.has(uri.path)) {
				this.loadedFile.get(uri.path).date = Date.now();
				//console.log("file found in cache");
				return;
			}

			try {
				await this.sftp.getBuffer(uri.path, this.session)
					.then(data => {
						this.loadedFile.set(uri.path, {date: Date.now(), text: String(data)});
						return;

					}).then(undefined, err => {
						this.isConnected = false;
						this.session.end();
						console.error(`sftp.getBuffer returns error:'${err.message}' on load file '${uri}'.`);
						this.connectToSHH(this.config);
						throw vscode.FileSystemError.Unavailable(`sftp.getBuffer returns error:'${err.message}' on load file '${uri}'.`);
					});
			}
			catch (err) {
				this.isConnected = false;
				this.session.end();
				console.error(`${uri}. Load file returns error: ${err.message}`);
				this.connectToSHH(this.config);
				throw vscode.FileSystemError.FileNotFound(`${uri}. Load file returns error: ${err.message}`);
			}
		}

		provideTextDocumentContent(uri) {
			return this.loadedFile.get(uri.path).text;
		}
	}
	return CTagSSHVF_t;
}());

exports.CTagSSHVF = CTagSSHVF;
