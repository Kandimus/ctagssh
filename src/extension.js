const vscode = require('vscode');
var path = require('path');
var LineByLine = require('n-readlines');
var sshvf = require('./TextDocumentProvider.js');

var arrayTags = [];
var pathCTagFile = './';
const CTagSSHVF = new sshvf.CTagSSHVF();
var Init = false;
var CTagSHHConfig = {};

function collapsePath(path, maxlen, align) {
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

	CTagSHHConfig = vscode.workspace.getConfiguration('ctagssh');

	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('ctagsshvf', CTagSSHVF));
	CTagSSHVF.connectToSHH({host: CTagSHHConfig.host, port: CTagSHHConfig.port, username: CTagSHHConfig.username, password: CTagSHHConfig.password});

	if (vscode.workspace.workspaceFolders !== undefined) {
		Init = true;
		pathCTagFile = vscode.workspace.workspaceFolders[0].uri.fsPath + '/';
	} else {
		console.error('Variable "vscode.workspace.workspaceFolders" is not defined. Set rootpath as "./"');
		return;
	}

	pathCTagFile = path.join(pathCTagFile, '.ctags'); //3UK.ctags
	console.log('Read .tags file from:' + pathCTagFile);
	arrayTags    = loadCTags(pathCTagFile);
	
	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.gotoTag', () => {
			searchTags(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.print', () => {
		const maxElementToPrint = 30;

		if (arrayTags.length > maxElementToPrint) {
			for (ii = 0; ii < maxElementToPrint; ++ii) {
				console.log(arrayTags[ii]);
			}
		} else {
			console.log(arrayTags);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('ctagssh.test', async () => {
		const uri = vscode.Uri.parse('ctagsshvf:' + '///eephome/eep/cceep/mb_cceep/bb/amdext/v222_0/pub/pcs_pos_srv_c.h');
		
		CTagSSHVF.preload_file(uri).then(async () => {
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { preview: false });
		});
	}));
}

function deactivate() {}

// eslint-disable-next-line no-undef
module.exports = {
	activate,
	deactivate
}

//////////////////////////////////////////////////
//
function loadCTags(tagFilePath) {
	let tags = [];
	let liner = new LineByLine(tagFilePath);
	let line;

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
		tags.push({
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

	return tags;
}

function searchTags(context/*: vscode.ExtensionContext*/)
{
	let query = getSelectedText(vscode.window.activeTextEditor);

	let displayFiles = arrayTags.filter((tag, index) => {
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
		
	await CTagSSHVF.preload_file(uri)
		.then(async () => {
			let lineNumber = -1;
			let doc = await vscode.workspace.openTextDocument(uri);
			let textEdit = await vscode.window.showTextDocument(doc, { preview: false });

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
			;
		});
}

function getSelectedText(editor) {
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
