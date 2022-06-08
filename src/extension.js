const vscode = require('vscode');
const path = require('path');
const pathPosix = require('path-posix');
const LineByLine = require('n-readlines');
const fs = require('fs');

var sshvf = require('./TextDocumentProvider.js');
var Settings = require('./Settings.js');
var Utils = require('./utils.js');

var CTagSSH_Tags = undefined;
var CTagSSH_History = [];
var CTagSSH_VF;
var CTagSSH_Init = false;
var CTagSSH_StatusBar;
var CTagSSH_Settings;

const CTagSSHMode = Object.freeze({
	"NotConnected"   : 1,
	"Connecting"     : 2,
	"Connected"      : 3,
	"Download"       : 4,
	"RemoteDownload" : 5
});

const CTagSSH_Padding = ' ';
const sshfs = "sshfs";
const ctagsshvf = "ctagsshvf";
const ctagssh = "ctagssh";

/**
* @param {vscode.ExtensionContext} context
*/
function activate(context)
{
	console.log('The extension "ctagssh" is now active!');

	CTagSSH_Settings = new Settings.Settings(`${ctagssh}.json`);

	// Add status bar
	CTagSSH_StatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	CTagSSH_StatusBar.command = `${ctagssh}.menu`;
	context.subscriptions.push(CTagSSH_StatusBar);
	updateStatusBar(CTagSSHMode.NotConnected);

	// Registering new TextDocumentContentProvider
	CTagSSH_VF = new sshvf.CTagSSHVF();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(ctagsshvf, CTagSSH_VF));

	// Check on active workspace
	if (vscode.workspace.workspaceFolders === undefined) {
		vscode.window.showErrorMessage('Variable "vscode.workspace.workspaceFolders" is not defined.');
		return;
	}
	CTagSSH_Init = true;
 
	// Connect to remote host
	connectToSSH();
 
	// Registering commands
	context.subscriptions.push(vscode.commands.registerCommand(`${ctagssh}.gotoTag`, () => {
		searchTags();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(`${ctagssh}.back`, () => {
		moveToBack();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(`${ctagssh}.reconnect`, async () => {
		if(!CTagSSH_VF.isConnected) {
			connectToSSH();
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand(`${ctagssh}.menu`, async () => {
		showMenu();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(`${ctagssh}.loadRemoteCTags`, () => {
		loadRemoteCTags();
	}));
}

function deactivate()
{
	if (CTagSSH_StatusBar) {
		CTagSSH_StatusBar.dispose();
	}

	CTagSSH_Tags = undefined;
}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
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
 * @brief Show externsion's quick menu
 */
async function showMenu()
{
	let dynamicExtMenu = [];
	let conf = vscode.workspace.getConfiguration(ctagssh);

	dynamicExtMenu.push({label: "Connect to host"     , foo: () => {
		if (!CTagSSH_VF.isConnected) {
			connectToSSH();
		}
	}});

	dynamicExtMenu.push({label: "Disconnect from host", foo: () => {
		CTagSSH_VF.disconnect();
		updateStatusBar(CTagSSHMode.NotConnected);
	}});
	
	if (conf.usingSSHFS == true) {
		dynamicExtMenu.push({label: "Set profile on SSH FS >", foo: Menu_slectSSHfsProfile});
	}

	if ("" !== conf.ctagsFilesRemotePath && true == CTagSSH_VF.isConnected) {
		dynamicExtMenu.push({label: "Load CTags file using remote SSH connection >", foo: loadRemoteCTags});
	}

	vscode.window.showQuickPick(dynamicExtMenu, { title: "Global extension menu", matchOnDescription: true, matchOnDetail: true })
		.then(val => val.foo())
		.then(undefined, err => {
			;
		});
}

function Menu_slectSSHfsProfile()
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
	const conf_ctagssh = vscode.workspace.getConfiguration(ctagssh);
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

	readCTags(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, conf_ctagssh.fileCtags));

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

async function loadRemoteCTags()
{
	let conf = vscode.workspace.getConfiguration(ctagssh);

	if ("" !== conf.ctagsFilesRemotePath && CTagSSH_VF.isConnected == true) {
		await CTagSSH_VF.remoteReaddir(conf.ctagsFilesRemotePath)
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
						//label : `${Utils.nBytes(element.attrs.size).padEnd(10, CTagSSH_Padding)}\t${new Date(element.attrs.mtime * 1000 /*msecs*/).toISOString().replace(/T/, ' ').replace(/\..+/, '')}\t${element.filename}`,
						label : element.filename,
						description: new Date(element.attrs.mtime * 1000 /*msecs*/).toISOString().replace(/T/, ' ').replace(/\..+/, ''),
						detail: Utils.nBytes(element.attrs.size).padEnd(10, CTagSSH_Padding),
						filename : element.filename
					});
				});

				vscode.window.showQuickPick(ctagsFilesList, {title: "CTags: " + conf.ctagsFilesRemotePath, matchOnDescription: true, matchOnDetail: true})
					.then(async val => {
						
						if (undefined !== val) {

							const localNewCTagsFile = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, conf.fileCtags);
						
							// change color
							updateStatusBar(CTagSSHMode.RemoteDownload);

							CTagSSH_VF.downloadRemoteFile(
								pathPosix.join(conf.ctagsFilesRemotePath, val.filename), 
								vscode.workspace.workspaceFolders[0].uri.fsPath)
							.then(filename => {
								try {
									// remove old ctags file
									fs.unlinkSync(localNewCTagsFile);

									// rename new ctags
									fs.renameSync(filename, localNewCTagsFile);

									// read new ctags file into memory
									readCTags(localNewCTagsFile);
								} catch (err) {
									// revert color back
									updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
									return Promise.reject(err);
								}

								// revert color back
								updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
							})
							.then(undefined, err => {

								// revert color back
								updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
								return Promise.reject(err.message);
							});
						}
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

/**
* @param {fs.PathLike} filename
*/
function readCTags(filename)
{
	console.log(`Reading tags from: '${filename}'`);
	CTagSSH_Tags = undefined;
	loadCTags(filename).then(() => {
		console.log("Read tags");
	});
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
		vscode.window.showErrorMessage("Can't load CTags file ${tagFilePath5}");
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

		CTagSSH_Tags.push({
			label: tagName,
			description: Utils.collapsePath(fileName, 80 - tagName.length * 2 / 3, Utils.collapsePathMode.left),
			detail: null,
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
			let conf = vscode.workspace.getConfiguration(ctagssh);
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
			// enumeration of list of matching tags
			filteredFiles.forEach((element, index) => {
				element.detail = (index + 1).toString();
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

	const uri = vscode.Uri.parse(`${ctagsshvf}:${Utils.getRandomInt(255).toString(16)}${CTagSSH_VF.separator}${tag.filePath}`);
	console.log('Virtual file: ' + uri.path);
	
	updateStatusBar(CTagSSHMode.Download);
	CTagSSH_VF.preload_file(uri)
		.then(async () => {
			let lineNumber = -1;
			const conf_ctagssh = vscode.workspace.getConfiguration(ctagssh);
			let doc = await vscode.workspace.openTextDocument(uri);
			let textEdit = await vscode.window.showTextDocument(doc, { preview: !conf_ctagssh.openFileInNewWindow });

			updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);

			if (tag.type == 'N') {
				lineNumber = parseInt(tag.pattern);
				lineNumber = lineNumber === 0 ? lineNumber : lineNumber - 1;
			
			} else {
				const text = textEdit.document.getText();
				lineNumber = Utils.findLineNumByPattern(text, tag.pattern);
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

async function moveToBack()
{
	if (CTagSSH_History.length <= 0) {
		return;
	}

	let element = CTagSSH_History.pop();

	if (element.fileUri.scheme == ctagsshvf) {
		updateStatusBar(CTagSSHMode.Download);
		await CTagSSH_VF.preload_file(element.fileUri);
		updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
	}

	const conf_ctagssh = vscode.workspace.getConfiguration(ctagssh);
	let doc = await vscode.workspace.openTextDocument(element.fileUri);
	await vscode.window.showTextDocument(doc, { preview: !conf_ctagssh.openFileInNewWindow});

	setSelectionText(vscode.window.activeTextEditor, element.lineno);
}
