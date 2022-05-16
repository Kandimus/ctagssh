"use strict";

var vscode = require("vscode");
const sshClient = require("ssh2-promise");

var CTagSSHVF = /** @class */ (function ()
{
	class CTagSSHVF_t {
		constructor() {
			this.onDidChangeEmitter = new vscode.EventEmitter();
			this.onDidChange = this.onDidChangeEmitter.event;

			this.loadedFile = new Map();
		}

		disconnect()
		{
			this.isConnected = false;
			
			if (this.ssh) {
				this.ssh.close();
				delete this.ssh;
			}
		}

		async connect(config)
		{
			this.config = config;
			console.log(`SSH2 connecting to remote server ${this.config.username}@${this.config.host}:${this.config.port}...`);

			this.ssh = new sshClient(this.config);
			this.sftp = this.ssh.sftp();

			await this.ssh.connect()
				.then(() => {
					this.isConnected = true;
					console.log(`SSH2 connected to remote server ${this.config.username}@${this.config.host}:${this.config.port}`);
					return Promise.resolve(2);
				}).catch(() => {
					console.error('SSH2 catch error');
					return Promise.reject(0);
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
				await this.sftp.readFile(uri.path)
					.then(data => {
						this.loadedFile.set(uri.path, {date: Date.now(), text: String(data)});
						return;

					}).then(undefined, err => {
						this.disconnect();
						console.error(`sftp.getBuffer returns error:'${err.message}' on load file '${uri}'.`);

						this.connect(this.config);
						throw vscode.FileSystemError.Unavailable(`sftp.getBuffer returns error:'${err.message}' on load file '${uri}'.`);
					});
			}
			catch (err) {
				this.disconnect();
				console.error(`${uri}. Load file returns error: ${err.message}`);

				this.connect(this.config);
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
