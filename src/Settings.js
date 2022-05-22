"use strict";

var vscode = require("vscode");
var fs = require('fs');

/**
 * @bref A class implemented read and save oparations on custom settings
 */
class Settings {

	/**
	 * @param {string} filename
	 */
	constructor(filename)
	{
		this.path = `${process.env.USERPROFILE}/.vscode/${filename}`
		this.settings = JSON.parse("{}");
		this.reload();
	}

	get()
	{
		return this.settings;
	}

	reload()
	{
		try {
			const data = fs.readFileSync(this.path, 'utf8');
			this.settings = JSON.parse(data);
		} catch (err) {
			console.error(err);
		}
	}

	save()
	{
		try {
			const data = JSON.stringify(this.settings);
			fs.writeFileSync(this.path, data);
		 } catch (err) {
			console.error(err);
		 }
	}
};

exports.Settings = Settings;
