"use strict";

const collapsePathMode = Object.freeze({
	"left"  : 1,
	"center": 2,
	"right" : 3
});

/**
* @param {number} max
* 
* @return random number [0, max)
*/
var getRandomInt = (function (/** @type {number} */ max)
{
	if (max === 0) {
		max = 0x7FFFFFFF;
	}
	return Math.floor(Math.random() * max);
});

/**
* @param {string} path
* @param {number} maxlen
* @param {collapsePathMode} align
*/
var collapsePath = (function(path, maxlen, align)
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
});

	/**
	 * @param {string} x
	 */
var nBytes = (function(x)
{
	const units = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	let l = 0, n = parseInt(x, 10) || 0;

	while (n >= 1000) {
		++l;
		n /= 1000;
	}

	return n.toFixed(l > 0 ? 2 : 0) + ' ' + units[l];
});

/**
 * @param {any} aObject
*/
var deepcopy = (function(aObject)
{
	let bObject = Array.isArray(aObject) ? [] : {};
	let value;

	for (const key in aObject) {
		value = aObject[key];
		bObject[key] = (typeof value === "object") ? this.deepcopy(value) : value;
	}
	return bObject;
});
	
/**
* @param {string} text
* @param {string | RegExp} reg
*/
var findLineNumByPattern = (function(text, reg)
{
	let lineNumber = 0;
	var found = undefined;
	let regExp = new RegExp(reg);
	let lines  = text.split("\n");

	lines.every((/** @type {string} */ element) => {
		found = regExp.exec(element);
		if (found) {
			return false;
		}
		++lineNumber;
		return true;
	});

	return found ? lineNumber : -1;
});

exports.collapsePathMode = collapsePathMode;
exports.getRandomInt = getRandomInt;
exports.collapsePath = collapsePath;
exports.nBytes = nBytes;
exports.deepcopy = deepcopy;
exports.findLineNumByPattern = findLineNumByPattern;