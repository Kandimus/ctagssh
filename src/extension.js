const vscode = require('vscode');
var path = require('path');
var LineByLine = require('n-readlines');
var sshvf = require('./TextDocumentProvider.js');

var CTagSHH_Tags = undefined;
var CTagSSH_VF;
var CTagSHH_Init = false;
var CTagSHH_StatusBar;
const CTagSSHColor = Object.freeze({"NotConnect": "#DD0000", "Connecting": "#FFFF00", "Connected": "#00DD00", "Download" : "#0000EE"});

function collapsePath(path, maxlen, align)
{
	if (path.length <= maxlen) {
		return path;
	}

	switch(align) {
		case 'left':
			return '…' + path.substring(path.length - maxlen + 1, path.length);
		
		case 'right':
			return path.substring(0, maxlen - 1) + '…';

		case 'center':
		default:
			return path.substring(0, (maxlen - 1) / 2) + '…' + path.substring(path.length - (maxlen + 1) / 2 + 1, path.length);
	}
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context)
{
	console.log('Congratulations, your extension "ctagssh" is now active!');

	// Add status bar
	CTagSHH_StatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	//CTagSHHStatusBar.command = myCommandId;
	CTagSHH_StatusBar.text = `| $(outline-view-icon) CTagSSH |`;
	CTagSHH_StatusBar.backgroundColor = '#FF0000';//'statusBar.errorBackground';//'statusBarItem.errorBackground';
	CTagSHH_StatusBar.color = CTagSSHColor.NotConnect;
	CTagSHH_StatusBar.tooltip = "Not Connect";
	context.subscriptions.push(CTagSHH_StatusBar);
	CTagSHH_StatusBar.show();

	// Registering new TextDocumentContentProvider
	CTagSSH_VF = new sshvf.CTagSSHVF();
	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('ctagsshvf', CTagSSH_VF));
	
	if (vscode.workspace.workspaceFolders === undefined) {
		console.error('Variable "vscode.workspace.workspaceFolders" is not defined.');
		return;
	}
	CTagSHH_Init = true;

	// Connect to remote host
	connectToSSH();

	// Registering commands
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.gotoTag', () => {
		searchTags(context);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.reconnect', async () => {
		connectToSSH();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.print', () => {
		const maxElementToPrint = 10;
		if (CTagSHH_Tags.length > maxElementToPrint) {
			for (ii = 0; ii < maxElementToPrint; ++ii) {
				console.log(CTagSHH_Tags[ii]);
			}
		} else {
			console.log(CTagSHH_Tags);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.test', async () => {
		var a = 1;
	}));
}

function deactivate()
{
	if (CTagSHH_StatusBar) {
		CTagSHH_StatusBar.dispose();
	}

	if (CTagSHH_Tags) {
		delete CTagSHH_Tags;
		CTagSHH_Tags = undefined;
	}
}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}

//////////////////////////////////////////////////
//
async function connectToSSH()
{
	CTagSSH_VF.disconnect();
	
	CTagSHH_StatusBar.tooltip = "Connecting...";
	CTagSHH_StatusBar.color = CTagSSHColor.Connecting;
	CTagSHH_StatusBar.show();

	let conf = vscode.workspace.getConfiguration('ctagssh');

	if (CTagSHH_Tags === undefined) {
		let filename = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, conf.fileCtags)

		console.log(`Reading tags from: '${filename}'`);
		loadCTags(filename).then(console.log("Read tags"));
	}

	CTagSSH_VF.connect(conf)
		.then(() => {
			CTagSHH_StatusBar.tooltip = CTagSSH_VF.isConnected ? "Connected" : "Not connect";
			CTagSHH_StatusBar.color = CTagSSH_VF.isConnected ? CTagSSHColor.Connected : CTagSSHColor.NotConnect;
			CTagSHH_StatusBar.show();
			return Promise.resolve(1);
		})
		.then(undefined, err => {
			return Promise.reject(err);
		});
}

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

	CTagSHH_Tags = [];
	while (line = liner.next()) {
		let elements = line.toString('ascii').split("\t");
		let tagName, fileName;
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

		//TODO check pattern as ^_32$. it found in 3UK
		if (!isNaN(patternLeft)) {
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
		let maxlen = 80 - (tagName.length + delim.length);
		CTagSHH_Tags.push({
			label: tagName + delim + collapsePath(fileName, maxlen, 'left'),
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

function searchTags(context/*: vscode.ExtensionContext*/)
{
	let query = getSelectedText(vscode.window.activeTextEditor);

	let displayFiles = CTagSHH_Tags.filter((tag, index) => {
		return tag.tagName === query;
	});

	//Case 1. Only one tag found  
	if (displayFiles.length === 1) {
		navigateToDefinition(displayFiles[0]);

	//Case 2. Many tags found
	} else if (displayFiles.length > 0) {
		vscode.window.showQuickPick(displayFiles, {matchOnDescription: true, matchOnDetail: true})
			.then(val => {
				navigateToDefinition(val);
			})
			.then(undefined, err => {
				;
			});
	
	//Case 3. No tags found
	} else {
		vscode.window.showErrorMessage('No related tags are found for the "' + query + '"');
	}
}

async function navigateToDefinition(tag)
{
	if (typeof(tag) == 'undefined') {
		return;
	}

	//console.log('navigateToDefinition: filePath = "' + tag.filePath + '" pattern = "' + tag.pattern + '"');
	const uri = vscode.Uri.parse('ctagsshvf:' + tag.filePath);
	console.log('Virtual file: ' + uri.path);
	
	CTagSHH_StatusBar.tooltip = "Download ...";
	CTagSHH_StatusBar.color = CTagSSHColor.Download;
	CTagSHH_StatusBar.show();
	await CTagSSH_VF.preload_file(uri)
		.then(async () => {
			let lineNumber = -1;
			let doc = await vscode.workspace.openTextDocument(uri);
			let textEdit = await vscode.window.showTextDocument(doc, { preview: false });

			CTagSHH_StatusBar.tooltip = CTagSSH_VF.isConnected ? "Connected" : "Not connect";
			CTagSHH_StatusBar.color = CTagSSH_VF.isConnected ? CTagSSHColor.Connected : CTagSSHColor.NotConnect;
			CTagSHH_StatusBar.show();

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
				vscode.window.showErrorMessage('Tag "' + tag.tagName + '" is not found in the "' + fullPath + '"');
			}
		})
		.then(undefined, err =>{
			CTagSHH_StatusBar.tooltip = CTagSSH_VF.isConnected ? "Connected" : "Not connect";
			CTagSHH_StatusBar.show();
		});
}

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

function findLineNumByPattern(text, reg)
{
	var lineNumber = 0;
	var found  = 0;
	var regExp = new RegExp(reg);
	var lines  = text.split("\n");

	lines.every(element => {
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
