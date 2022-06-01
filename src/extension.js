const vscode = require('vscode');
var path = require('path'), pathPosix = require('path/posix');
var LineByLine = require('n-readlines');

var zlib = require('zlib');
var fs = require('fs');

const { promisify } = require('node:util');
const { pipeline } = require('node:stream');
const pipe = promisify(pipeline);

var sshvf = require('./TextDocumentProvider.js');
var Settings = require('./Settings.js');

var CTagSSH_Tags = undefined;
var CTagSSH_History = [];
var CTagSSH_VF;
var CTagSSH_Init = false;
var CTagSSH_StatusBar;
var CTagSSH_Settings;

const CTagSSHMode = Object.freeze(
	{"NotConnected": 1, 
	"Connecting": 2, 
	"Connected": 3, 
	"Download" : 4,
	"RemoteDownload" : 5
});

const CTagSSH_PadWidth = 3;
const CTagSSH_Padding = ' ';
const sshfs = "sshfs";
const ctagsshvf = "ctagsshvf";

const collapsePathMode = Object.freeze({"left": 1, "center": 2, "right": 3});

/**
 * @param {string} path
 * @param {number} maxlen
 * @param {collapsePathMode} align
 */
function collapsePath(path, maxlen, align)
{
	if (path.length <= maxlen) {
		return path;
	}

	switch(align) {
		// @ts-ignore
		case collapsePathMode.left:
			return '…' + path.substring(path.length - maxlen + 1, path.length);
		
		// @ts-ignore
		case collapsePathMode.right: 
			return path.substring(0, maxlen - 1) + '…';

		// @ts-ignore
		case collapsePathMode.center:
		default:
			return path.substring(0, (maxlen - 1) / 2) + '…' + path.substring(path.length - (maxlen + 1) / 2 + 1, path.length);
	}
}

/**
 * @brief Update StatusBar according to the mode. Set icon and text color.
 * 
 * @param {number} mode
 */
function updateStatusBar(mode)
{
	switch (mode) {
		case CTagSSHMode.NotConnected:
			CTagSSH_StatusBar.text = '| $(debug-disconnect) CTagSSH |';
			CTagSSH_StatusBar.color = "#DD0000";
			CTagSSH_StatusBar.tooltip = "Not Connected";
			break;

		case CTagSSHMode.Connecting:
			CTagSSH_StatusBar.text = '| $(outline-view-icon) CTagSSH |';
			CTagSSH_StatusBar.color = "#FFFF00";
			CTagSSH_StatusBar.tooltip = "Connecting";
			break;

		case CTagSSHMode.Connected:
			CTagSSH_StatusBar.text = '| $(outline-view-icon) CTagSSH |';
			CTagSSH_StatusBar.color = "#00DD00";
			CTagSSH_StatusBar.tooltip = "Connected";
			break;

		case CTagSSHMode.Download:
			CTagSSH_StatusBar.text = '| $(extensions-install-count) CTagSSH |';
			CTagSSH_StatusBar.color = "#0000EE";
			CTagSSH_StatusBar.tooltip = "Downloading";
			break;
			
		case CTagSSHMode.RemoteDownload:
			CTagSSH_StatusBar.text = '| $(extensions-install-count) CTagSSH |';
			CTagSSH_StatusBar.color = "#FF00FF";
			CTagSSH_StatusBar.tooltip = "Remote downloading";
			break;
	}

	CTagSSH_StatusBar.show();
}

/**
 * @param {number} max
 * 
 * @return random number [0, max)
 */
function getRandomInt(max) {
	return Math.floor(Math.random() * max);
 }

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context)
{
	console.log('The extension "ctagssh" is now active!');

	CTagSSH_Settings = new Settings.Settings("ctagssh.json");

	// Add status bar
	CTagSSH_StatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	CTagSSH_StatusBar.command = 'ctagssh.menu';
	context.subscriptions.push(CTagSSH_StatusBar);
	updateStatusBar(CTagSSHMode.NotConnected);

	// Registering new TextDocumentContentProvider
	CTagSSH_VF = new sshvf.CTagSSHVF();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(ctagsshvf, CTagSSH_VF));
	
	// Check on active workspace
	if (vscode.workspace.workspaceFolders === undefined) {
		console.error('Variable "vscode.workspace.workspaceFolders" is not defined.');
		return;
	}
	CTagSSH_Init = true;

	// Connect to remote host
	connectToSSH();

	// Registering commands
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.gotoTag', () => {
		searchTags();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.back', () => {
		moveToBack();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.reconnect', async () => {
		if(!CTagSSH_VF.isConnected) {
			connectToSSH();
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.menu', async () => {
		showMenu();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.loadRemoteCTags', () => {
		loadRemoteCTags();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.test', async () => {
		var a = 1;
	}));
}

function deactivate()
{
	if (CTagSSH_StatusBar) {
		CTagSSH_StatusBar.dispose();
	}

	freeCTags();
}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}

function freeCTags() {
	if (CTagSSH_Tags !== undefined) {
		CTagSSH_Tags = undefined;
	}
}

/**
 * @brief Show externsion's quick menu
 */
async function showMenu()
{
	let menuGlobal = [
		{label: "Connect to host"     , id: 0},
		{label: "Disconnect from host", id: 1}
	];
	let conf_ctagssh = vscode.workspace.getConfiguration('ctagssh');
	
	if (conf_ctagssh.usingSSHFS == true) {
		menuGlobal.push({label: "Set profile on SSH FS ->", id: 2});
	}

	vscode.window.showQuickPick(menuGlobal, {/* title: "DESCRIPTION", */matchOnDescription: true, matchOnDetail: true})
		.then(val => {
			switch(val.id) {
				case 0:
					if (!CTagSSH_VF.isConnected) {
						connectToSSH();
					};
					break;

				case 1:
					CTagSSH_VF.disconnect();
					updateStatusBar(CTagSSHMode.NotConnected);
					break;

				case 2:
					selectProfileSSHFS();
					break;
			}
		})
		.then(undefined, err => {
			;
		});
}

/**
 * @brief Connect to remote host, read .ctags file from disk and update StatusBar
 * 
 * @return Promise
 */
async function connectToSSH()
{
	CTagSSH_VF.disconnect();
	updateStatusBar(CTagSSHMode.Connecting);

	let conf = {};
	const conf_ctagssh = vscode.workspace.getConfiguration('ctagssh');
	let found = false;
	
	if (conf_ctagssh.usingSSHFS === true && ('sshfs' in CTagSSH_Settings.get()) && ('profile' in CTagSSH_Settings.get().sshfs)) {
		// Check for extension "SSH FS"
		let conf_sshfs = vscode.workspace.getConfiguration(sshfs);
		if (conf_sshfs !== undefined) {
			conf_sshfs.configs.every((/** @type {{ name: any; host: any; port: any; username: any; password: any; }} */ element) => {
				if (CTagSSH_Settings.get().sshfs.profile == element.name) {
					console.log(`Using connection settings from profile "${CTagSSH_Settings.get().sshfs.profile}" of SSHFS extension!`);
					conf.host = element.host;
					conf.port = (element.port === undefined) ? 22 : element.port;
					conf.username = element.username;
					conf.password = element.password;
					found = true;
				}
				return !found;
			});
		}
	}

	if (!found) {
		console.log('Using connection settings from CTagSSH!');
		conf.host = conf_ctagssh.host;
		conf.port = ('port' in conf_ctagssh) && (Number.isInteger(conf_ctagssh.port)) ? 22 : conf_ctagssh.port;
		conf.username = conf_ctagssh.username;
		conf.password = conf_ctagssh.password;
	}

	readCTags(conf_ctagssh);

	CTagSSH_VF.connect(conf)
		.then(() => {
			updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
			return Promise.resolve();
		})
		.then(undefined, (/** @type {any} */ err) => {
			updateStatusBar(CTagSSHMode.NotConnected);
			return Promise.reject(err);
		});
}

function readCTags(conf_ctagssh) {
	if (CTagSSH_Tags === undefined) {
		const filename = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, conf_ctagssh.fileCtags);

		console.log(`Reading tags from: '${filename}'`);
		loadCTags(filename).then(() => {
			console.log("Read tags");
		});
	}
}

function selectProfileSSHFS()
{
	const conf_sshfs = vscode.workspace.getConfiguration(sshfs);

	if (conf_sshfs !== undefined) {
		if (conf_sshfs.configs.length > 0) {
			let profileList = [];

			conf_sshfs.configs.forEach(element => {
				profileList.push({
					label: element.name
				});
			});

			vscode.window.showQuickPick(profileList, {matchOnDescription: true, matchOnDetail: true})
				.then(val => {
					if (!('sshfs' in CTagSSH_Settings.get())) {
						CTagSSH_Settings.get().sshfs = {};
					}
					CTagSSH_Settings.get().sshfs.profile = val.label;
					CTagSSH_Settings.save();
					connectToSSH();
				})
				.then(undefined, err => {
					;
				});
		} else {
			vscode.window.showErrorMessage("Not found profile of SSH FS extension!");
			return;
		}
	}
}

async function do_gunzip(input, output) {
	const gunzip = zlib.createGunzip();
	const source = fs.createReadStream(input);
	const destination = fs.createWriteStream(output);
	await pipe(source, gunzip, destination);
}

async function loadRemoteCTags()
{
	let conf = vscode.workspace.getConfiguration('ctagssh');

	if ("" !== conf.ctagsFilesRemotePath && CTagSSH_VF.isConnected == true) {

		await CTagSSH_VF.sftp.readdir(conf.ctagsFilesRemotePath)
			.then(data => {
				
				// extract available extensions from ctagssh settings if any
				let ctagsExtensions = [];
				let tmpFiles = [];

				if ("" !== conf.ctagsExtensions) {

					ctagsExtensions = conf.ctagsExtensions.split(/[,;\s]+/)
						.filter((/** @type {string} */ element) => element !== "")
						.map((/** @type {string} */ element) => element.toLowerCase());
				}

				// if there are available fltering extensions then do filtering for files list
				if (0 !== ctagsExtensions.length) {

					tmpFiles = data.filter((element) => 
						element.attrs.isFile() && ctagsExtensions.includes(path.extname(element.filename).toLowerCase().substring(1)));
				}
				
				if (0 === tmpFiles.length) {
					tmpFiles = data.filter((element) => element.attrs.isFile());
				}
				let ctagsFilesList = [];
				tmpFiles.sort((a, b) => {
					
					const A = a.filename;
  					const B = b.filename;
  					
					return A < B ? -1 : A > B ? 1 : 0;
				})
				.forEach((/** @type {{ attrs: { size: { toString: () => string; }; mtime: number; }; filename: any; }} */ element) => {

					ctagsFilesList.push({
						label : `${element.attrs.size.toString().padStart(10, CTagSSH_Padding)}\t${new Date(element.attrs.mtime * 1000 /*msecs*/).toISOString().replace(/T/, ' ').replace(/\..+/, '')}\t${element.filename}`,
						filename : element.filename
					});
				});

				vscode.window.showQuickPick(ctagsFilesList, {title: "CTags: " + conf.ctagsFilesRemotePath, matchOnDescription: true, matchOnDetail: true})
					.then(async val => {
						
						const rndCompressedFile = CTagSSH_VF.statTempFile + getRandomInt(16777216).toString(16);
						const rndFilename = pathPosix.basename(rndCompressedFile);
						const inputFile = pathPosix.join(conf.ctagsFilesRemotePath, val.filename);
						const execLine = gzipExecLine(inputFile, rndCompressedFile);
						const localTmpFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, rndFilename + '.gz');
						const localNewCTagsFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, conf.fileCtags);
					
						try {
						
							// change color
							updateStatusBar(CTagSSHMode.RemoteDownload);
							
							// compress remote ctags file with gzip
							console.log('Gzipping remote file: ' + inputFile);
							await CTagSSH_VF.ssh.exec(execLine);
							console.log('Remote file ' + inputFile + ' was gzipped');
							
							// fetch remote gzipped ctags into local folder
							console.log('Fetching file locally: ' + inputFile);
							await CTagSSH_VF.sftp.fastGet(rndCompressedFile, localTmpFile);
							
							// decompress local gzipped ctags
							await do_gunzip(localTmpFile, localNewCTagsFile);
							freeCTags();
							readCTags(conf);
							
							console.log('File ' + inputFile + ' was fetched locally');
							
							// revert color back
							updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);

						} catch(err) {
							let a = "" + err;
							console.error(`Compressor remote execution failed: ` + a);
							return Promise.reject(err.message);
						}
						
						// remove garbage
						try {
							
							await CTagSSH_VF.sftp.unlink(rndCompressedFile);
							fs.unlinkSync(localTmpFile);
						} catch(err) {
							
							let a = "" + err;
							console.error(`Remove garbage files failed: ` + a);
							return Promise.reject(err.message);
						}

						return Promise.resolve('');
					})
					.then(undefined, err => {
						return Promise.reject(err.message);
					});
			})
			.then(undefined, err => {
				let a = "" + err;
				console.error(`Can't read remote folder: ` + a);
				return Promise.reject(err.message);
			});
	}
}


function gzipExecLine(inputFile, rndCompressedFile) {

	//gzip -cfN9 INPUT_FILE > ~/OUTPUT_FILE
	return `gzip -cfN9 ${inputFile} > ${rndCompressedFile}`;
}

/**
 * @param {import("fs").PathLike} tagFilePath
 */
async function loadCTags(tagFilePath)
{
	let line;

	try {
		var liner = new LineByLine(tagFilePath);
	}
	catch(err) {
		vscode.window.showErrorMessage("Can not load file '.ctags'");
		return Promise.reject();
	}

	CTagSSH_Tags = [];
	while (line = liner.next()) {
		let elements = line.toString('ascii').split("\t");
		let tagName = "";
		let fileName = "";
		let remainingElements = elements.filter((el, index) => {
			if (index === 0) {
				tagName = el;
				return false;
			}
			if (index === 1) {
				fileName = el;
				return false;
			}
			return true;
		});

		if (tagName.indexOf("!_") == 0) {
			continue;
		}

		let remainingString = remainingElements.join("\t");
		let patternLeft     = remainingString.substring(remainingString.indexOf("\/^"), remainingString.lastIndexOf(";"));
		let patternRight    = remainingString.substring(remainingString.lastIndexOf(";\"") + 2);
		var patternType     = patternRight.substring(patternRight.indexOf("\t") + 1, patternRight.indexOf("\t") + 2);

		if (!isNaN(parseInt(patternLeft))) {
			var patternEscaped = patternLeft;
			patternType = 'N';
		} else {
			// Strip starting (/^) and ending ($/;") characters from ctags pattern
			let pattern = patternLeft.substring(patternLeft.indexOf("\/^") + 2, patternLeft.lastIndexOf("\/"));

			if (pattern.slice(-1) == '$') {
				pattern = pattern.substring(0, pattern.length - 1);
			}
			// See: https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript/3561711#3561711
			//patternEscaped = "^" + pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$";
			patternEscaped = pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		}

		const delim = '  ->  ';
		let maxlen = (80-(CTagSSH_PadWidth-1)) - (tagName.length + delim.length);
		CTagSSH_Tags.push({
			label: tagName + delim + collapsePath(fileName, maxlen, collapsePathMode.left),
			tagName: tagName,
			filePath: fileName,
			pattern: patternEscaped,
			// remainingString: remainingString,
			// patternleft: patternLeft,
			// patternright: patternRight,
			type: patternType
		});
	}
	return Promise.resolve();
}

function deepcopy(aObject) {
	 
	let bObject = Array.isArray(aObject) ? [] : {};
  
	let value;
	for (const key in aObject) {
  
	  // Prevent self-references to parent object
	  // if (Object.is(aObject[key], aObject)) continue;
	  
	  value = aObject[key];
  
	  bObject[key] = (typeof value === "object") ? deepcopy(value) : value;
	}
  
	return bObject;
  }

function searchTags()
{
	let query = getSelectedText(vscode.window.activeTextEditor);

	let displayFiles = CTagSSH_Tags.filter((/** @type {{ tagName: string; }} */ tag) => {
		return tag.tagName === query;
	});

	switch (displayFiles.length) {

		case 0:
			// No tags found
			vscode.window.showErrorMessage(`No related tags are found for the '${query}'`);
			break;

		case 1:
			// Only one tag found
			navigateToDefinition(displayFiles[0]);
			break;

		default:
			// A list of tags
			
			// extract available extensions from ctagssh settings if any
			let conf = vscode.workspace.getConfiguration('ctagssh');
			let filterExtensions = [];
			let tmpFiles = [];

			if ("" !== conf.showExtensions) {
		
				filterExtensions = conf.showExtensions.split(/[,;\s]+/)
					.filter((/** @type {string} */ element) => element !== "")
					.map((/** @type {string} */ element) => element.toLowerCase());
			}

			// if there are available fltering extensions then do filtering for files list
			if (0 !== filterExtensions.length) {

				tmpFiles = displayFiles.filter((/** @type {{ filePath: string; }} */ element) => 
					filterExtensions.includes(path.extname(element.filePath).toLowerCase().substring(1)));
			}
			if (0 === tmpFiles.length) {
				tmpFiles = displayFiles;
			}
			
			let filteredFiles = tmpFiles.map(dc => Object.assign({}, dc));
			//let filteredFiles = deepcopy(tmpFiles);
			// enumeration of list of matching tags
			filteredFiles.forEach((element, index) => {

				element.label = `(${(index + 1).toString().padStart(CTagSSH_PadWidth, CTagSSH_Padding)}) ${element.label}`;
			});

			vscode.window.showQuickPick(filteredFiles, {title: "Variants", matchOnDescription: true, matchOnDetail: true})
				.then(val => {
					navigateToDefinition(val);
				})
				.then(undefined, err => {
					;
				});
			break;
	}
}

async function navigateToDefinition(tag)
{
	if (typeof(tag) == 'undefined') {
		return;
	}

	CTagSSH_History.push({fileUri: vscode.window.activeTextEditor.document.uri, lineno: vscode.window.activeTextEditor.selection.start.line});

	//console.log('navigateToDefinition: filePath = "' + tag.filePath + '" pattern = "' + tag.pattern + '"');
	const uri = vscode.Uri.parse(`${ctagsshvf}:${getRandomInt(255).toString(16)}${CTagSSH_VF.separator}${tag.filePath}`);
	console.log('Virtual file: ' + uri.path);
	
	updateStatusBar(CTagSSHMode.Download);
	await CTagSSH_VF.preload_file(uri)
		.then(async () => {
			let lineNumber = -1;
			const conf_ctagssh = vscode.workspace.getConfiguration('ctagssh');
			let doc = await vscode.workspace.openTextDocument(uri);
			let textEdit = await vscode.window.showTextDocument(doc, { preview: !conf_ctagssh.openFileInNewWindow });

			updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);

			if (tag.type == 'N') {
				//console.log('navigateToDefinition: tag is number of line = ' + parseInt(tag.pattern));
				lineNumber = parseInt(tag.pattern);
				lineNumber = lineNumber === 0 ? lineNumber : lineNumber - 1;
			
			} else {
				const text = textEdit.document.getText();
				lineNumber = findLineNumByPattern(text, tag.pattern);
				//console.log('navigateToDefinition: line of tag = ' + lineNumber);
			}

			if (lineNumber >= 0) {
				setSelectionText(vscode.window.activeTextEditor, lineNumber);
			} else {
				vscode.window.showErrorMessage(`Tag "${tag.tagName}" is not found in the "${tag.filePath}"`);
			}
		})
		.then(undefined, err =>{
			vscode.window.showErrorMessage(err);
			updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
		});
}

/**
 * @param {vscode.TextEditor} editor
 */
function getSelectedText(editor)
{
	let selection = editor.selection;
	let text = editor.document.getText(selection).trim();
	if (!text) {
		 let range = editor.document.getWordRangeAtPosition(selection.active);
		 text = editor.document.getText(range);
	}
	return text;
}

/**
 * @param {vscode.TextEditor} editor
 * @param {number} lineno
 */
function setSelectionText(editor, lineno)
{
	let newSelection = new vscode.Selection(lineno, 0, lineno, 0);
	editor.selection = newSelection;
	editor.revealRange(newSelection, vscode.TextEditorRevealType.InCenter);
}

/**
 * @param {string} text
 * @param {string | RegExp} reg
 */
function findLineNumByPattern(text, reg)
{
	var lineNumber = 0;
	var found;
	var regExp = new RegExp(reg);
	var lines  = text.split("\n");

	lines.every((/** @type {string} */ element) => {
		found = regExp.exec(element);
		//console.log('findLineNumByPattern: result = ' + found + ', line = ' + lineNumber + ', element: ' + element);
		if (found) {
			return false;
		}
		++lineNumber;
		return true;
	});

	return found ? lineNumber : -1;
};

async function moveToBack()
{
	if (CTagSSH_History.length <= 0) {
		return;
	}

	let element = CTagSSH_History.pop();

	if (element.fileUri.scheme == ctagsshvf) {
		updateStatusBar(CTagSSHMode.Download);
		await CTagSSH_VF.preload_file(element.fileUri);
	}

	const conf_ctagssh = vscode.workspace.getConfiguration('ctagssh');
	let doc = await vscode.workspace.openTextDocument(element.fileUri);
	let textEdit = await vscode.window.showTextDocument(doc, { preview: !conf_ctagssh.openFileInNewWindow});

	setSelectionText(vscode.window.activeTextEditor, element.lineno);
}