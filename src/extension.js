const vscode = require('vscode');
var path = require('path');
var LineByLine = require('n-readlines');
var sshvf = require('./TextDocumentProvider.js');
var Settings = require('./Settings.js');

var CTagSSH_Tags = undefined;
var CTagSSH_VF;
var CTagSSH_Init = false;
var CTagSSH_StatusBar;
var CTagSSH_Settings;
const CTagSSHMode = Object.freeze({"NotConnected": 1, "Connecting": 2, "Connected": 3, "Download" : 4});
const CTagSSH_PadWidth = 3;
const CTagSSH_Padding = ' ';

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
		case collapsePathMode.left:
			return '…' + path.substring(path.length - maxlen + 1, path.length);
		
		case collapsePathMode.right:
			return path.substring(0, maxlen - 1) + '…';

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
	let b = CTagSSH_Settings.get().Kuku;
	CTagSSH_Settings.get().Kuku = b + 1;
	CTagSSH_Settings.save();

	// Add status bar
	CTagSSH_StatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	CTagSSH_StatusBar.command = 'ctagssh.reconnect';
	context.subscriptions.push(CTagSSH_StatusBar);
	updateStatusBar(CTagSSHMode.NotConnected);

	// Registering new TextDocumentContentProvider
	CTagSSH_VF = new sshvf.CTagSSHVF();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('ctagsshvf', CTagSSH_VF));
	
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
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.reconnect', async () => {
		if (!CTagSSH_VF.isConnected) {
			connectToSSH();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.print', () => {
		const maxElementToPrint = 10;
		if (CTagSSH_Tags.length > maxElementToPrint) {
			for (var ii = 0; ii < maxElementToPrint; ++ii) {
				console.log(CTagSSH_Tags[ii]);
			}
		} else {
			console.log(CTagSSH_Tags);
		}
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

	if (CTagSSH_Tags !== undefined) {
		CTagSSH_Tags = undefined;
	}
}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
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

	let conf = vscode.workspace.getConfiguration('ctagssh');

	if (CTagSSH_Tags === undefined) {
		let filename = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, conf.fileCtags)

		console.log(`Reading tags from: '${filename}'`);
		loadCTags(filename).then(() => {
			console.log("Read tags");
		});
	}

	CTagSSH_VF.connect(conf)
		.then(() => {
			updateStatusBar(CTagSSH_VF.isConnected ? CTagSSHMode.Connected : CTagSSHMode.NotConnected);
			return Promise.resolve();
		})
		.then(undefined, err => {
			updateStatusBar(CTagSSHMode.NotConnected);
			return Promise.reject(err);
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
			let filteredFiles = [];

			if ("" !== conf.showExtensions) {
		
				filterExtensions = conf.showExtensions.split(/[,;\s]+/)
					.filter((/** @type {string} */ element) => element !== "")
					.map((/** @type {string} */ element) => element.toLowerCase());
			}

			// if there are available fltering extensions then do filtering for files list
			if (0 !== filterExtensions.length) {

				filteredFiles = displayFiles.filter((/** @type {{ filePath: string; }} */ element) => 
					filterExtensions.includes(path.extname(element.filePath).toLowerCase().substring(1)));
			}
			if (0 === filteredFiles.length) {
				filteredFiles = displayFiles;
			}
		
			// enumeration of list of matching tags
			filteredFiles.forEach((element, index) => {

				element.label = `(${(index + 1).toString().padStart(CTagSSH_PadWidth, CTagSSH_Padding)}) ${element.label}`;
			});

			vscode.window.showQuickPick(filteredFiles, {matchOnDescription: true, matchOnDetail: true})
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

	//console.log('navigateToDefinition: filePath = "' + tag.filePath + '" pattern = "' + tag.pattern + '"');
	const uri = vscode.Uri.parse('ctagsshvf:' + getRandomInt(255).toString(16) + CTagSSH_VF.separator + tag.filePath);
	console.log('Virtual file: ' + uri.path);
	
	updateStatusBar(CTagSSHMode.Download);
	await CTagSSH_VF.preload_file(uri)
		.then(async () => {
			let lineNumber = -1;
			let doc = await vscode.workspace.openTextDocument(uri);
			let textEdit = await vscode.window.showTextDocument(doc, { preview: true });

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
				let newSelection = new vscode.Selection(lineNumber, 0, lineNumber, 0);
				vscode.window.activeTextEditor.selection = newSelection;
				vscode.window.activeTextEditor.revealRange(newSelection, vscode.TextEditorRevealType.InCenter);
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
