"use strict";

var vscode = require("vscode");
const sshClient = require("ssh2-promise");
const fs = require('fs');

/**
 * @bref A class inherited from TextDocumentContentProvider. The main task is to read a file from a remote server.
 */
var CTagSSHVF = /** @class */ (function ()
{
	class CTagSSHVF_t {
		constructor() {
			this.onDidChangeEmitter = new vscode.EventEmitter();
			this.onDidChange = this.onDidChangeEmitter.event;

			this.separator = '$';
			this.loadedFile = new Map();
		}

		disconnect()
		{
			this.isConnected = false;
			
			if (this.ssh) {
				this.ssh.close();
				delete this.ssh;
				this.ssh = undefined;
			}
		}

		/**
		 * @param {any} config
		 */
		async connect(config)
		{
			this.config = config;

			if (!Number.isInteger(this.config.port)) {
				this.config.port = 22;
			}
			console.log(`SSH2 connecting to remote server ${this.config.username}@${this.config.host}:${this.config.port}...`);

			this.ssh = new sshClient(this.config);
			this.sftp = this.ssh.sftp();

			try {
				await this.ssh.connect();
				this.homepath = await this.sftp.realpath('./');
				this.getStatIsWork = true;
				this.isConnected = true;
				this.statTempFile = this.homepath + '/.ctagssh.temp';
				console.log(`SSH2 connected to remote server ${this.config.username}@${this.config.host}:${this.config.port}${this.homepath}`);
				return Promise.resolve();
			}
			catch(err)
			{
				this.isConnected = false;
				console.error(`Can not connect to romote server`);
				return Promise.reject();
			}
		}

		async downloadRemoteFile(
			inputFile, 
			rndCompressedFile, 
			localTmpFile, 
			localNewCTagsFile, 
			compressExecLine,
			decompressFoo,
			readCTagsFoo)
		{

			if (inputFile === "" || rndCompressedFile === "" || localTmpFile == ""
			|| localNewCTagsFile === "" || compressExecLine === "" || decompressFoo === undefined
			|| readCTagsFoo === undefined) {

				return Promise.reject(`Bad ::downloadRemoteFile arguments`);
			}

			let p = undefined;
			try {
				// compress remote ctags file with gzip
				console.log('Gzipping remote file: ' + inputFile);
				await this.ssh.exec(compressExecLine);
				console.log('Remote file ' + inputFile + ' was gzipped');
				
				// fetch remote gzipped ctags into local folder
				console.log('Fetching file locally: ' + inputFile);
				await this.sftp.fastGet(rndCompressedFile, localTmpFile);
				
				// decompress local gzipped ctags
				await decompressFoo(localTmpFile, localNewCTagsFile);
				readCTagsFoo(localNewCTagsFile);
				
				console.log('File ' + inputFile + ' was fetched locally');
			} catch(err) {
				let a = "" + err;
				let b = "";
				try {
					// remove possible garbage
					await this.sftp.unlink(rndCompressedFile);
					fs.unlinkSync(localTmpFile);
				} catch(err1) {

					b += err1;
					console.error(`Tempfiles removing failed: ${b}`);
				}
				console.error(`Compressor remote execution failed: ${a}`);

				// revert color back
				p = Promise.reject(`${a} ; ${b}`);
			}

			if (undefined === p) {						
				// remove garbage
				try {
					await this.sftp.unlink(rndCompressedFile);
					fs.unlinkSync(localTmpFile);
				} catch(err) {
					let a = "" + err;
					console.error(`Remove garbage files failed: ${a}`);

					p = Promise.reject(err.message);
				}
			}
			return p !== undefined ? p : Promise.resolve('');
		}

		/**
		 * @param {string | Buffer} remoteDirectory
		 */
		// readdir over sftp wrapper method
		async remoteReaddir(remoteDirectory) 
		{
			if (this.isConnected == true) {

				return await this.sftp.readdir(remoteDirectory);
			} else {

				throw vscode.FileSystemError.Unavailable("Can't read directory into remote host since it is disconnected");
			}
		}

		/**
		 * @param {{ path: string; }} uri
		 */
		async preload_file(uri)
		{
			if (this.isConnected == false) {
				throw vscode.FileSystemError.Unavailable('Can not connect to remote host');
			}

			let mtime = 0;
			let filepath = uri.path.split(this.separator)[1];

			if (this.getStatIsWork) {
				try {
					let attr = await this.sftp.getStat(filepath);
					mtime = attr.mtime;
					//console.log(`sftp.getStat(${filepath}).mtime = ${mtime}`);
				} catch(err){
					//console.error(`sftp.getStat(${filepath}) is fault`);
					this.getStatIsWork = false;
				}
			}

			if (!this.getStatIsWork) {
				try {
					await this.remoteExec(`stat ${filepath} | grep "Modify" > ${this.statTempFile}`);
					await this.sftp.readFile(`${this.statTempFile}`)
						.then(data => {
							let str_date = String(data)
							let date = new Date(str_date.substring(8, str_date.length - 1))
							mtime = date.valueOf();
						});
				} catch(err) {
					console.error(`Get the file stat is fault.`);
				}
			}

			// Find file in cache and check this mtime
			if (this.loadedFile.has(filepath)) {
				if (this.loadedFile.get(filepath).mtime >= mtime) {
					this.loadedFile.get(filepath).date = Date.now();
					return Promise.resolve('');
				} else {
					console.log("The file is found in cache but mtime is expired");
					this.loadedFile.delete(filepath);
				}
			}

			await this.sftp.readFile(filepath)
				.then(data => {
					this.loadedFile.set(filepath, {mtime: mtime, date: Date.now(), text: String(data)});
					return Promise.resolve('');

				}).then(undefined, err => {
					if (err.message == 'No such file') {
						return Promise.reject(`The file '${filepath}' not found on remote host.`);
					}

					this.disconnect();
					console.error(`sftp.readFile returns error:'${err.message}' on load file '${filepath}'. Reconnect`);
					this.connect(this.config);
					return Promise.reject(`sftp.readFile returns error:'${err.message}' on load file '${filepath}'. Reconnect`);
				});
		}

		/**
		 * @param {{ path: string; }} uri
		 */
		provideTextDocumentContent(uri) {
			let filepath = uri.path.split(this.separator)[1];
			return this.loadedFile.get(filepath).text;
		}
	}
	return CTagSSHVF_t;
}());

exports.CTagSSHVF = CTagSSHVF;
