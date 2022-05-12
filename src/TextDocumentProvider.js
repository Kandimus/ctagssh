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
			this.sftp = new sshClient({host: 'indlin4550', port: '22', username: 'vitalyli', password: '9whR2;NE.'});
			this.sftp.session({host: 'indlin4550', port: '22', username: 'vitalyli', password: '9whR2;NE.'})
				.then(ftpSession => {
					this.isConnected = true;
					this.session = ftpSession;
					console.log('SSH2 connected to remote server');
				}).catch(() => {
					console.error('SSH2 catch error');
				});
		}

		async preload_file(uri)
		{
			console.log(">>> preload_file");
			if (this.isConnected == false) {
				throw vscode.FileSystemError.NoPermissions('Can not connect to remote host');
			}

			if (this.loadedFile.has(uri.path)) {
				this.loadedFile.get(uri.path).date = Date.now();
				console.log("file found in cache");
				return;
			}

			try {
				await this.sftp.getBuffer(uri.path, this.session)
					.then(data => {
						this.loadedFile.set(uri.path, {date: Date.now(), text: String(data)});
						return;

					}).then(undefined, err => {
						console.error(err.message);
						throw vscode.FileSystemError.FileNotFound(`${uri}. Error: ${err.message}`);
					});
			}
			catch (err) {
				console.error(err.message);
				throw vscode.FileSystemError.FileNotFound(`${uri}. Error: ${err.message}`);
			}
		}

		provideTextDocumentContent(uri) {
			console.log('>>> provideTextDocumentContent');
			if (this.isConnected == false) {
				throw vscode.FileSystemError.NoPermissions('Can not connect to remote host');
			}

			return this.loadedFile.get(uri.path).text;
		}
	}
	return CTagSSHVF_t;
}());

exports.CTagSSHVF = CTagSSHVF;
