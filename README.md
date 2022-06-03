# CTags support via SSH
> This extension provides CTags file format support via SSH for Visual Studio Code.

## Additional Setup

### 1) `.ctags` file
You should install [CTags](http://ctags.sourceforge.net/) and generate .ctags file before you will use this extension. Another option is to copy some existing .ctags file from a remote host to project folder manually or via the extension menu.

Run the CTags command under your project folder.
```
ctags -R -f .ctags
```

### 2) Connect to remote host
Open settings and fill `host`, `port`, `username` and `password` fields accordingly in order to connect remote host.

### 3) Support of `SSH FS` extension
If the extension `SSH FS` is already installed you should to set `ctagssh.usingSSHFS` on the extension settings and select `SSH FS` profile to connect remote host via command `ctagssh.menu`.

### 4) Load `ctags` file from remote host
Open the extension settings and fill `Ctags Files Remote Path` and `Ctags Extensions` fields. Click on the extension menu and select `Load CTags file using remote SSH connection` item. Select the required file from the list and extension will download it in your project folder.

## Extension icon
Current colour of the extension icon indicates one of connection statuses:
- Red - connection was not established
- Yellow - connecting to remote host
- Green - connected to remote host
- Blue - download of file with serched tag in progress
- Purple - remote ctags file download

## Keybinding
Select some word in the vscode and press `Shift+F12`.
Press `Ctrl+Shift+F12` to return to previously searched tag.
Press `Shift+F11` to open the dialog for select remote ctag file.

## Command
| Command | Description |
|---|---|
| `ctagssh.gotoTag` | Go to definition of tag under cursor (`Shift+F12`). |
| `ctagssh.reconnect` | Reconnect to remote host when connection is not established. |
| `ctagssh.menu` | Open extension quick menu. Also may click on the extension icon of the StatusBar. |
| `ctagssh.back` | Return to previous searched tag. |
| `ctagssh.loadRemoteCTags` | Select remote ctag file for download. Warning! Once downloaded the file will replace the local ctag file (`Shift+F11`). |

## Issues
Please submit any issues to [ctagssh](https://github.com/Kandimus/ctagsssh)

**Enjoy!**
