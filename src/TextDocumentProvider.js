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
					this.sftp.realpath('./')
						.then(path => {
							this.getStatIsWork = true;
							this.isConnected = true;
							this.homepath = path;
							this.statTempFile = this.homepath + '/.ctagssh.temp';

							console.log(`SSH2 connected to remote server ${this.config.username}@${this.config.host}:${this.config.port}${this.homepath}`);
						}).then(undefined, err =>{
							console.error(`Can not connect to romote server`);
						});
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

			let mtime = 0;

			if (this.getStatIsWork) {
				try {
					attr = await this.sftp.getStat(uri.path);
					mtime = attr.mtime;
					//console.log(`sftp.getStat(${uri.path}).mtime = ${mtime}`);
				} catch(err){
					//console.error(`sftp.getStat(${uri.path}) is fault`);
					this.getStatIsWork = false;
				}
			}

			if (!this.getStatIsWork) {
				try {
					await this.ssh.exec(`stat ${uri.path} | grep "Modify" > ${this.statTempFile}`);
					await this.sftp.readFile(`${this.statTempFile}`)
						.then(data => {
							let str_date = String(data)
							let date = new Date(str_date.substring(8, str_date.length - 1))
							mtime = date.valueOf();
							//console.log('Stat is "' + str_date.substring(8, str_date.length - 1) + '"');
							//console.log('Date is "' + date.valueOf() + '"');
						});
				} catch(err) {
					console.error(`Get the file stat is fault.`);
				}
			}

			// Find file in cache and check this mtime
			if (this.loadedFile.has(uri.path)) {
				if (this.loadedFile.get(uri.path).mtime >= mtime) {
					this.loadedFile.get(uri.path).date = Date.now();
					//console.log("The file is found in cache");
					return;
				} else {
					//console.log("The file is found in cache but mtime is expired");
					this.loadedFile.delete(uri.path);
				}
			}

			try {
				await this.sftp.readFile(uri.path)
					.then(data => {
						let tmpstr = String(data);
						this.loadedFile.set(uri.path, {mtime: mtime, date: Date.now(), text: String(data)});
						return;

					}).then(undefined, err => {
						//this.disconnect();
						console.error(`sftp.readFile returns error:'${err.message}' on load file '${uri}'.`);

						//this.connect(this.config);
						throw vscode.FileSystemError.Unavailable(`sftp.readFile returns error:'${err.message}' on load file '${uri}'.`);
					});
			}
			catch (err) {
				//this.disconnect();
				console.error(`${uri}. Load file returns error: ${err.message}`);

				//this.connect(this.config);
				throw vscode.FileSystemError.FileNotFound(`${uri}. Load file returns error: ${err.message}`);
			}
		}

		provideTextDocumentContent(uri) {
			//let tmpstr = this.loadedFile.get(uri.path).text;
			//tmpstr = tmpstr;
			return this.loadedFile.get(uri.path).text;
		}
	}
	return CTagSSHVF_t;
}());

exports.CTagSSHVF = CTagSSHVF;
