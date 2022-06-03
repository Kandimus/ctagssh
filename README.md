# CTags support via SSH
> The extension that provides CTags Support via SSH in Visual Studio Code.

## Additional Setup

### 1) `.ctags` file
You have to install [CTags](http://ctags.sourceforge.net/) and generate the .ctags file before you use this extension. Or copy the .ctags file from a remote host to the project folder manually or via the extension menu.

Run the CTags command under the your project folder.
```
ctags -R -f .ctags
```

### 2) Connect to remote host
Open settings and fill `host`, `port`, `username` and `password` fields to connect to the remote host.

### 3) Support extension `SSH FS`
If the extension `SSH FS` is already installed you should to set check `ctagssh.usingSSHFS` on the extension settings and select `SSH FS` profile for connect to remote host via command `ctagssh.menu`.

### 4) Upload the `ctags` file
Open the extension settings and fill `Ctags Files Remote Path` and `Ctags Extensions` filelds. Then click on the extension menu and select the `Load CTags file using remote SSH connection` item. Select the required file from the list and upload them.

## Extension icon
The colour of the extension icon indicate status of connection:
- Red - connection is not established
- Yellow - connecting to a remote host
- Green - connected to a remote host
- Blue - downloading a file contains selected tag in progress

## Keybinding
Select the words in the vscode and press `Shift+F12`.
Press `Ctrl+Shift+F12` to return to the previos tag.
Press `Shift+F11` to open dialog to select the remote ctag file.

## Command
| Command | Description |
|---|---|
| `ctagssh.gotoTag` | Go to definition of the tag under cursor (`Shift+F12`). |
| `ctagssh.reconnect` | Reconnect to the remote host when connection is not established. |
| `ctagssh.menu` | Opening the extension quick menu. You also may be click on the extension icon on the StatusBar. |
| `ctagssh.back` | Return to the previos tag. |
| `ctagssh.loadRemoteCTags` | Select the remote ctag file for upload. Warning! The upload file will replace the local ctag file (`Shift+F11`). |

## Issues
Please submit issues to [ctagssh](https://github.com/Kandimus/ctagsssh)

**Enjoy!**
